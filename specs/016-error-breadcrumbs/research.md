# Phase 0 Research: Opt-In Error Breadcrumbs

All Technical Context decisions are resolved below. The delivery mechanism (Option A — core runtime
configuration option) was settled with the user during specification; R1 records it.

## R1. Delivery: a core runtime configuration option, off by default (Option A)

**Decision**: Enable breadcrumbs through the existing runtime configuration —
`configureLogging({ breadcrumbs: true | { maxEvents } })` — **off by default**. The ring buffer +
enrichment + cause-chain code lives in the core default `.` entry (no new subpath).

**Rationale**: Breadcrumb recording + error enrichment are **intrinsically core pipeline work** (the
buffer must observe the post-pipeline event, and the *real* error event every transport receives must
carry the trail). A subpath would still require a core seam **plus** add a new public extension point
and a new packaged subpath. Option A keeps the public surface minimal — one additive config option,
**no** new extension point, **no** new subpath — matching the existing `redactor` / `sanitizerLimits`
runtime-config pattern. The cost (a small, off-by-default code increment in the default entry) is bounded
by the bundle-invariance gate (R10).

**Alternatives considered**: Option B (dedicated `./breadcrumbs` subpath + a generic core enrichment
seam) — leaner default bundle but more total public surface; rejected by the user. Option C (a wrapping
transport) — a transport runs at fan-out and only sees its own copy, so it cannot enrich the error event
delivered to the consumer's *other* transports; rejected (fails the "automatic enrichment" goal).

## R2. Configuration surface

**Decision**: Add to `LoggerConfig`:
```ts
breadcrumbs?: boolean | BreadcrumbsOptions;   // default: off
interface BreadcrumbsOptions { maxEvents?: number }
```
`true` enables with defaults; an object enables with overrides; `false`/absent = off. `maxEvents` default
**20**, bounds **[1, 100]**; out-of-range clamps to the bound and emits **one** `onInternalError` notice
(mirrors `sanitizerLimits` clamping in `config.ts`). `BreadcrumbsOptions` is the only new public type.

**Rationale**: Minimal, matches the established config-clamp pattern. Cause-chain depth is a fixed
internal constant (not configurable) to keep the surface minimal. No `minLevel` option is needed — the
existing level filter already governs which events reach the pipeline (and thus the buffer), so the trail
naturally reflects only emitted events (R4).

## R3. The buffer: a fixed-capacity ring on the runtime

**Decision**: `BreadcrumbBuffer` (internal, `src/breadcrumbs/`) — a fixed-size circular array of capacity
N with an O(1) write (index advance + overwrite). It is created **once** in `normalizeConfig` and stored
on `NormalizedConfig.breadcrumbs` (the shared `ConfiguredRuntime`); every `Logger` derived from that
runtime reads the same buffer. A `configureLogging()` swap creates a fresh buffer (old discarded). Memory
is **constant**: at most N bounded snapshots, independent of how many events are logged.

**Rationale**: O(1) record (Principle VIII), constant memory, single shared runtime-level resource; no
per-`Logger` allocation. Reading the ordered trail (oldest→newest) for an error is O(N) but only on
error emissions and N is small/bounded.

## R4. What is recorded: a compact post-pipeline snapshot

**Decision**: After the pipeline produces the safe event (post sanitize → URL-scrub → redact →
control-char-guard), record a compact **snapshot**: `{ ts, level, message, attributes }` where
`attributes` is a shallow copy of the event's already-redacted attributes **excluding** the
`safesignal.breadcrumbs` key (R8). Only events that **passed the level filter and were not dropped** by
the pipeline are recorded (a dropped/fail-closed event is never recorded). The snapshot is a copy, never
a reference to the live (dev-frozen) event.

**Rationale**: Snapshots are built from the already-sanitized + redacted event, so the trail carries no
new leakage (Principle IV/V) and is already bounded by `sanitizerLimits` (Principle VIII / FR-012).
Recording post-level-filter means the trail reflects exactly the events the app actually emitted.

## R5. Enrichment placement: in the dispatcher, gated, pre-freeze

**Decision**: In `dispatch()`, after `controlCharGuard` and **before** `freezeInDev`, guarded by
`if (config.breadcrumbs)`:
- if the event is **error-level**, attach the current trail as `attributes['safesignal.breadcrumbs']`
  (an ordered oldest→newest array of the prior snapshots, excluding this error);
then freeze + fan-out as today; **after** fan-out (still under the guard), record this event's snapshot.
The whole breadcrumb block is wrapped in `try/catch` → `onInternalError` (R9). When disabled,
`config.breadcrumbs` is `undefined` and the single falsy check adds effectively zero cost (SC-001).

**Rationale**: Attaching before freeze keeps the enriched event dev-frozen like everything else.
Attaching the **already-safe** trail post-redact avoids re-sanitizing/re-redacting N entries on every
error (the entries were processed when recorded). Recording after fan-out means the error's own trail is
never part of what is recorded for it. Disabled = one falsy branch, no allocation, no recording.

## R6. Cause chain: extracted pre-dispatch, processed by the existing pipeline

**Decision**: In `logger.ts` `emit()`, when `breadcrumbs` enabled **and** level is `error` **and** an
error value is present, extract the bounded cause chain from the raw error value and write it to
`attributes['safesignal.errorCauses']` **before** `dispatch()`. `extractCauseChain(value, maxDepth)`
walks `value.cause` (and nested causes), is **cycle-safe** (tracks seen objects) and **depth-bounded**
(`MAX_CAUSE_DEPTH = 8`), reducing each cause to `{ name, message }` (non-`Error` causes via `String()`).
The top error stays in `event.error`; the chain is the nested causes only.

**Rationale**: Writing the chain into `attributes` **before** the pipeline means the existing
**sanitizer + redactor + control-char-guard** process it uniformly — **no redactor/sanitizer change**,
and the chain is bounded + redacted exactly like any attribute. Cycle/depth bounds prevent unbounded or
looping traversal (Principle III / SC-005). Extracting in `emit()` (where the raw error value lives) keeps
the transport boundary clean — the raw `Error` is still never handed to a transport.

## R7. Trail field shape: a reserved `safesignal.*` attribute key

**Decision**: The trail is `attributes['safesignal.breadcrumbs']` — an array of
`{ ts: string; level: string; message: string; attributes?: object }` entries (oldest→newest). The cause
chain is `attributes['safesignal.errorCauses']` — an array of `{ name: string; message: string }`. Both
are plain `AttributeValue` arrays (no new public type), documented as machine-parseable shapes.

**Rationale**: Reuses the structured `attributes` bag every transport already carries, matching the
`./capture` precedent's `safesignal.source` / `safesignal.errorType` reserved namespace. No `LogEvent`
type change → smaller public surface. Downstream monitoring parses a documented key.

## R8. Anti-nesting: snapshots exclude the breadcrumbs key

**Decision**: The recorded snapshot's `attributes` omits the `safesignal.breadcrumbs` key. (The small,
bounded `safesignal.errorCauses` from a prior error is retained — it is useful context and bounded.)

**Rationale**: Without this, an error's trail would contain prior errors' trails, giving O(N²) /
unbounded nested growth. Excluding the trail key keeps each snapshot bounded and total memory constant
(FR-012 / SC-003).

## R9. Fail-safe and re-entrancy

**Decision**: The enrich step and the record step are each wrapped so any throw is swallowed and routed
to `onInternalError`; the error event is **still delivered** (enrichment runs before fan-out — on a
throw, the un-enriched but valid event proceeds; recording runs after fan-out). Buffer operations are
**synchronous and do not emit**, so there is no re-entrant logging loop.

**Rationale**: Principle III — breadcrumbs never break the page and never prevent error delivery
(SC-006). The dispatcher already wraps transports; this adds the same discipline to the breadcrumb block.

## R10. Bundle discipline — the binding constraint for Option A

**Decision**: Two mechanically-enforced gates govern the default-entry size:
1. **`scripts/ci/bundle-invariance-check.sh`** (CI job `bundle-invariance`) compares HEAD's gzipped
   `dist/index.mjs` against the **merge-base** build and fails if the delta exceeds **±1024 bytes**. This
   tolerance is **dynamic and NOT re-baselinable** — so the core breadcrumb code MUST add **< 1 KiB
   gzipped** to `dist/index.mjs`. The implementation MUST stay lean to fit (a compact ring buffer +
   cause-chain walker + thin wiring; precedent: Feature 008 added +597 B mjs and fit).
2. **`tests/security/transport-beacon-bundle-shape.security.test.ts` (group e)** holds stored absolute
   ceilings `DEFAULT_ENTRY_MJS_GZ_MAX` / `DEFAULT_ENTRY_CJS_GZ_MAX`. These ARE re-baselined (bumped) with
   a documented justification comment to the new observed sizes (the established mechanism — the file
   already records F008's re-baseline).

**Rationale**: Option A's only real risk is bundle growth. Gate (1) bounds it hard (the feature must fit
under +1 KiB on mjs); gate (2) is a stored ceiling that legitimately moves with documented core growth.
Neither gate is removed or weakened (Principle X). The `exports` map is unchanged (no subpath), so the
distributed-surface parity set is untouched (Principle XI).

## R11. Integrity, scale, federation

**Decision**: Enrichment adds fields to the **error** event only and never mutates non-error or
already-delivered events (snapshots are copies; the in-flight error event is mutated before freeze/fan-out,
not after). The buffer is one shared runtime-level resource; `Logger` creation/derivation stays
side-effect-free (no per-`Logger` buffer/timer/listener). Duplicate package copies are **isolated** —
each copy's runtime owns its own buffer.

**Rationale**: Principles VII (integrity), VIII (lightweight loggers / federated runtime). Mirrors the
existing duplicate-copy-isolation contract verified by `tests/integration/duplicate-copy-isolation`.

## R12. Verification

**Decision**: Contract (trail/cause shape, ordering, bounds, disabled = no change, config clamp),
security (secret in pre-redaction data → 0 in trail/causes; only post-redaction data; snapshot excludes
the trail key), integrity/integration (other + delivered events untouched; the real error event carries
the trail end-to-end through `configureLogging` + a capturing transport), performance (M ≫ N → buffer
bounded, O(1) record, no per-`Logger` cost), and failure-safety (throwing recorder/enricher swallowed,
error still delivered). Bundle gates per R10. All via existing `npm` scripts; identical local/CI.

## Resolved decisions summary

| Topic | Resolution |
|-------|------------|
| Delivery | Core runtime config option, off by default (Option A) — R1 |
| Config surface | `breadcrumbs?: boolean \| { maxEvents }`; default 20, bounds [1,100], clamp+notice — R2 |
| Buffer | Fixed-capacity ring on the runtime; O(1) write; constant memory; created once — R3 |
| Recorded | Compact post-pipeline snapshot `{ts,level,message,attributes-minus-trail}`; post-level-filter only — R4 |
| Enrichment | Dispatcher, gated, pre-freeze (trail) + post-fan-out (record); fail-safe — R5 |
| Cause chain | `emit()` pre-dispatch → `attributes['safesignal.errorCauses']`; cycle-safe, depth-bounded; reuses pipeline — R6 |
| Field shapes | Reserved `safesignal.breadcrumbs` / `safesignal.errorCauses` attribute arrays; no new `LogEvent` type — R7 |
| Anti-nesting | Snapshot excludes the `safesignal.breadcrumbs` key — R8 |
| Fail-safe | Enrich+record wrapped → `onInternalError`; error still delivered; sync, no re-entrancy — R9 |
| Bundle | Must fit ±1 KiB on index.mjs (dynamic gate); bump stored ceilings with justification — R10 |
| Integrity/scale | Error-event-only enrichment; runtime-level shared buffer; isolated copies — R11 |
