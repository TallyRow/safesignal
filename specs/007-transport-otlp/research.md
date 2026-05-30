# Phase 0 Research: OTLP Log Transport

All `/speckit-clarify` decisions are settled (see spec → Clarifications). This
document records the technical decisions that turn those into an implementable
design, plus the one architectural finding that reinterprets FR-002.

## D1 — Wire encoding: OTLP/HTTP+JSON, hand-built, zero-dependency

**Decision**: Serialize events to the **OTLP logs JSON** shape
(`{ resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords: [...] }] }] }`)
by hand, in pure TypeScript, with **no runtime dependency** and **no
`@opentelemetry/*` import**. POST with `Content-Type: application/json`.

**Rationale**:
- The clarify session chose JSON for v1 (browser-native, lean, dep-free).
- **Hard constraint discovered in research**: the subpath bundle-shape security
  test (modeled on `tests/security/transport-beacon-bundle-shape.security.test.ts`)
  forbids any `@opentelemetry/` string or vendor identifier (`SeverityNumber`,
  `LogRecord`, …) in `dist/transport-otlp.{mjs,cjs}`. The
  `internal-import-boundary.test.ts` rule allows `@opentelemetry/*` imports
  **only** under `src/internal/telemetry/otel/**`. Therefore the subpath cannot
  import `@opentelemetry/*` **nor** the internal OTel seam
  (`src/internal/telemetry/otel/mapping.ts` etc., which import
  `@opentelemetry/api-logs`).
- OTLP/HTTP+JSON is a stable, fully-specified wire format. Producing it requires
  only literal `severityNumber` integers and a small `AnyValue` encoder — no SDK.

**FR-002 reconciliation**: FR-002 says "build on the existing internal OTel
event seam rather than inventing a new event model." This is satisfied as
**conceptual reuse**: the transport consumes the canonical `LogEvent` model
(already OTel-shaped) and applies the **same** documented level→severity mapping
that `src/internal/telemetry/otel/mapping.ts` uses — but it does **not** import
that dep-bearing module at runtime. The OTLP-JSON shape is a documented contract
(`contracts/otlp-payload.md`), not a new event model. This keeps the subpath
zero-dep and vendor-neutral, consistent with Principles III + the bundle budget.

**Alternatives considered**:
- *Import `@opentelemetry/api-logs` + `@opentelemetry/exporter-logs-otlp-http`*:
  rejected — pulls a multi-package runtime dep into a browser bundle, blows the
  size budget, and fails the vendor-neutrality bundle test. Contradicts the
  zero-runtime-dep posture.
- *Reuse `mapping.ts` via the internal seam*: rejected — transitively imports
  `@opentelemetry/api-logs`, which the boundary + bundle tests forbid in a
  subpath.
- *protobuf now*: rejected by clarify (roadmap follow-up; FR-015 keeps it
  additive behind an internal encoding seam).

## D2 — Level → OTLP SeverityNumber mapping

**Decision**: Use the OTLP severity ranges with these literal constants and
texts (total over the SDK's four levels):

| LogEvent level | severityNumber | severityText |
|----------------|----------------|--------------|
| `debug` | 5  (`DEBUG`) | `DEBUG` |
| `info`  | 9  (`INFO`)  | `INFO`  |
| `warn`  | 13 (`WARN`)  | `WARN`  |
| `error` | 17 (`ERROR`) | `ERROR` |

**Rationale**: These are the canonical OTLP `SeverityNumber` base values for
each range (DEBUG 5–8, INFO 9–12, WARN 13–16, ERROR 17–20) and match the
in-repo `LEVEL_TO_SEVERITY` table in `src/internal/telemetry/otel/mapping.ts`
(which uses the `@opentelemetry/api-logs` `SeverityNumber` enum whose values are
exactly these integers). Encoding them as plain literals keeps the seam's
semantics without importing it.

**Alternatives**: a configurable mapping — rejected for v1 (unnecessary surface;
the four-level mapping is unambiguous).

## D3 — Identity → OTLP Resource attribute naming

**Decision**: Map SafeSignal `LogContext` identity to the OTLP `Resource`:

| LogContext field | OTLP Resource attribute |
|------------------|-------------------------|
| `context.application.name` | `service.name` |
| `context.application.version` | `service.version` |
| `context.environment` | `deployment.environment` |
| `context.module.name` | `module.name` (custom, **per-LogRecord**) |
| `context.module.version` | `module.version` (custom, **per-LogRecord**) |

Only present fields are emitted (omit absent ones; no `undefined`/empty keys).

**Refinement (implementation)**: `service.*` / `deployment.environment` are
runtime-global and live on the shared batch `Resource`; `module.*` is
per-logger (can vary within a batch via `withContext`), so it is attributed
**per-`LogRecord`** rather than on the Resource — correct OTLP origin
attribution (Principle VI) for federated modules sharing one transport.

**Rationale**: `service.name`/`service.version`/`deployment.environment` are
standard OTel semantic-convention resource attributes that every OTLP backend
understands and filters on — vendor-neutral by construction. SafeSignal's
federated `module.*` identity has no standard resource key, so it is carried as
clearly-named custom attributes, preserving origin-attribution (Principle VI)
without a vendor-specific choice.

**Alternatives**: putting identity on every LogRecord — rejected (OTLP models
shared identity on the Resource; duplicating per-record is wasteful and
non-idiomatic).

## D4 — LogRecord field mapping

**Decision**:
- `timeUnixNano` / `observedTimeUnixNano`: `event.timestamp` (ISO) → epoch-ms →
  `×1_000_000` as a string (OTLP requires uint64-as-string).
- `severityNumber` / `severityText`: per D2.
- `body`: `{ stringValue: event.message }`.
- `attributes`: `event.attributes` flattened to OTLP `KeyValue[]` via the
  `AnyValue` encoder (D5).
- `event.context.attributes` (merged context bag): emitted as LogRecord
  attributes under a `context.`-prefixed key namespace to keep them
  distinguishable from per-call attributes without collisions.
- `event.error` (if present): mapped to the standard exception attributes
  `exception.type` (`error.name`), `exception.message`, `exception.stacktrace`
  (`error.stack`).

**Rationale**: matches OTLP logs data-model semantics and the existing
`LogEvent` contract; uses standard exception semantic conventions so backends
render errors natively.

## D5 — AttributeValue → OTLP AnyValue encoder

**Decision**: A pure recursive encoder:
- `string` → `{ stringValue }`
- `boolean` → `{ boolValue }`
- `number` → integer-safe → `{ intValue: String(n) }`; else `{ doubleValue }`
- `null` → `{}` (empty AnyValue) — OTLP has no null; represent as unset value
- `AttributeValue[]` → `{ arrayValue: { values: [...] } }`
- nested object → `{ kvlistValue: { values: KeyValue[] } }`

Depth/size already bounded upstream by the sanitizer; the encoder does not
re-walk untrusted input beyond the already-sanitized `AttributeValue` union.

**Rationale**: faithful, lossless OTLP-JSON representation with no dependency;
the `AttributeValue` union (string|number|boolean|null|array|object) maps 1:1 to
OTLP `AnyValue`.

## D6 — Delivery: `fetch` + `keepalive: true`

**Decision**: `fetch(endpoint, { method: 'POST', keepalive: true, headers:
{ 'content-type': 'application/json', ...configuredHeaders }, body })`.
- 2xx → delivered. Inspect OTLP `partialSuccess.rejectedLogRecords` if the
  backend returns it (2xx with partial rejection) → emit a `partial_rejection`
  notice; do not retry.
- non-2xx → `send_failed` notice; drop.
- thrown/rejected fetch → `send_failed` notice (with `.cause`); drop.
- `fetch` undefined → `delivery_unavailable` notice; drop.

**Rationale**: only `fetch` can set the auth + content-type headers OTLP
backends require (clarify decision); `keepalive` preserves best-effort delivery
during unload; `navigator.sendBeacon` cannot set headers, so it is not used.
Mirrors the proven `tryFetchKeepalive` path in
`src/transport-beacon/delivery.ts`.

**Alternatives**: `sendBeacon` primary (beacon's model) — rejected: can't carry
auth headers, defeating US3.

## D7 — Batching + no retry

**Decision**: A bounded in-memory buffer flushed when **either** `maxBatchSize`
events accumulate **or** `maxBatchAgeMs` elapses (defaults proposed in
data-model; tunable via options). On flush, build one OTLP request for the
batch. **No retry**: a failed flush drops that batch with one rate-limited
notice. A `pagehide`/unload best-effort flush is installed lazily (first
`send`), mirroring beacon, and uses `keepalive`. Buffer is hard-capped at
`maxBufferedEvents` (default 1000) — events over the cap are dropped
(`buffer_overflow`); a single event whose serialized record exceeds
`maxRecordBytes` (default 64 KiB) is dropped (`oversized_event`) — rather than
growing memory.

**Rationale**: simplest provably-bounded fail-safe posture (clarify decision);
avoids retry buffers, backoff timers, and duplicate delivery in a tab that may
unload at any moment. Reuses beacon's batcher shape and lazy-pagehide pattern.

**Alternatives**: bounded retry / `Retry-After` — rejected by clarify.

## D8 — Endpoint validation

**Decision**: Reuse the beacon validation rule verbatim (own copy in the
subpath, no cross-import): HTTPS always passes; HTTP passes only with
`allowInsecureLoopback: true` AND hostname ∈ {localhost, 127.0.0.1, [::1]};
everything else throws a typed error **at construction time** (consumer call
site), never from `send`. The consumer supplies the full OTLP logs endpoint URL
(e.g. `https://otlp.example.com/v1/logs`); the transport does not synthesize or
append paths (keeps it backend-neutral).

**Rationale**: identical security guarantee as beacon (T-S3), construction-time
failure stays off the hot path (Principle II). Consumer-supplied full path keeps
it vendor-neutral (backends differ on base vs. `/v1/logs`).

## D9 — Duplicate-package-copy classification

**Decision**: **Isolated** — each `createOtlpTransport(...)` instance owns its
own batcher/state; multiple package copies do not cross-affect. Documented in
the public-API contract + README, matching `./transport-beacon`.

**Rationale**: the transport holds no module-global state; isolation is the
natural and safest classification (Principle VII).

## D10 — Verification reuse

**Decision**: No new CI jobs or runners. The feature rides the existing
`build → typecheck ×2 → test ×2 (Node 20+22) → bundle-invariance →
dependency-pins → lint → format-check → coverage → secret-scan → dco` pipeline.
Extend `scripts/ci/bundle-invariance-check.sh`'s bundle list and the
`dependency-pins` job's gated test set to include the new bundle-shape test.

**Rationale**: Principle VIII — one reproducible entrypoint; identical local/CI
outcomes. No environment-specific behavior introduced.

## Open items deferred to /speckit-tasks (implementation detail, not ambiguity)

- Default `maxBatchSize` (20) / `maxBatchAgeMs` (5000) / `maxBufferedEvents`
  (1000) / `maxRecordBytes` (64 KiB) are now pinned in data-model; revisit only
  if implementation measurement shows a better default.
- Whether `batcher.ts` physically reuses `src/transport-beacon/batcher.ts` (it
  cannot import across subpaths under the boundary rule, so it will be a
  parallel copy or a shared helper hoisted to an allowed location — decide in
  tasks; default: parallel copy to preserve subpath isolation).
- Final gz size budget constant for `dist/transport-otlp.mjs` (record the
  measured baseline + a small headroom, like beacon's 5120 B).
