# Implementation Plan: Outbound `traceparent` Header Injection

**Branch**: `009-traceparent-injection` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-traceparent-injection/spec.md`

## Summary

Add an optional `injectTraceparent?: boolean` (default `false`) to
`OtlpTransportOptions` so the `./transport-otlp` transport can set a standard W3C
`traceparent` (and, when applicable, `tracestate`) **request header** on each OTLP
delivery request — completing the logs-to-traces correlation that Feature 008 put on the
event payload. SafeSignal stays **carry-only** (never mints ids) and a propagator, not a
tracer.

**Key technical approach** (resolved in research):

- **Read the already-normalized field, don't re-validate.** Feature 008 normalizes
  `context.trace` once per emit (before sanitize/redact), so by the time the OTLP
  transport sees an event, `event.context.trace` is either a valid normalized
  `TraceContext` or absent. The transport's serializer already reads this field directly;
  the header injector does the same. **No import of `src/trace/`** → the 007 TO-7
  vendor-neutral bundle boundary holds (the subpath keeps its only-`type`-from-`../api/types.js`
  discipline).
- **Homogeneous-only, fail-closed (Settled Default 2).** A new pure intra-subpath helper
  computes a per-event traceparent key `traceId-spanId-flagsByte` (flagsByte = `traceFlags
  ?? 0`) from the normalized field, or a `none` sentinel when absent. It injects
  `traceparent` **iff every event in the batch shares one identical non-`none` key**;
  empty / trace-less / heterogeneous batches inject nothing. `tracestate` rides along
  **iff** all events also share one identical defined `traceState` within the 512-char
  bound; otherwise `traceparent` is kept and `tracestate` is dropped (FR-004).
- **Inject at delivery, never overwrite consumer headers.** In `flushBatch`, after
  serialize and before `deliver(...)`, build a per-request header map
  `{ traceparent, ...(tracestate?), ...state.headers }` — consumer-supplied
  `options.headers` are spread **last** so they always win and the injected trace headers
  can never overwrite, duplicate, or expose an auth/secret value (007 TO-6). The frozen
  `state.headers` is never mutated. When injection is off or the batch is non-homogeneous,
  the helper returns the **same** `state.headers` reference → the request is byte-identical
  to today (SC-003).
- **Transport-only ⇒ no core re-baseline.** Nothing in `src/` outside `src/transport-otlp/`
  changes. The default / `./testing` / `./transport-beacon` bundles are byte-unchanged (no
  ±1 KiB re-baseline needed). Only `dist/transport-otlp.mjs` grows by the small header
  builder; keep it within the **recorded budget constant** in
  `transport-otlp-bundle-shape.security.test.ts` (read the live value at implementation
  time rather than assuming a figure) and re-baseline that single constant only if the
  measured delta requires it.

> **Dependency**: extends the `./transport-otlp` transport (Feature 007) and the
> trace-context model + normalization (Feature 008), **both shipped in v1.2.0**. This
> branch is cut from `main` (009) after 008 merged — no stacking required.

## Technical Context

**Language/Version**: TypeScript 5.x, strict (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), target ES2020, `platform: browser`.

**Primary Dependencies**: **None added.** The traceparent/tracestate string builder and
the homogeneity check are hand-written, pure, zero-dependency. Build: tsup. Lint/format:
Biome. Test: Vitest (Node 20 + 22 matrix).

**Storage**: N/A.

**Testing**: Vitest — contract (option + homogeneous-only injection policy + default-off),
failure-safety (malformed/heterogeneous → no header, no throw, batch still ships),
security (no secret/auth-header leak or collision; `tracestate` bounded), unit (the header
builder's key/format/precedence logic), plus the existing `./transport-otlp` bundle-shape +
size gate (unchanged, must still pass).

**Target Platform**: Modern browsers; SSR-safe (no ambient reads). Delivery is
`fetch`+`keepalive` (the existing 007 `deliver` primitive).

**Project Type**: Reusable browser package — **`./transport-otlp` subpath change only**
(one optional option + one pure helper + a delivery-path wiring). No core/event-model
change.

**Performance Goals**: Constant-cost `Logger` creation (untouched — no per-instance work
added). The homogeneity check + header build run once per flushed batch, synchronously,
bounded O(batch size), on the single configured transport instance. Bundle delta confined
to `transport-otlp.mjs` within its budget; default/testing/beacon byte-unchanged.

**Constraints**: Off by default; additive (disabled path byte-identical); carry-only (no id
minting); homogeneous-only fail-closed (no misleading header); never throws into
`send`/`flush`/`shutdown`; vendor-neutral W3C (no `@opentelemetry/*` in the bundle); secure
(`tracestate` bounded, no auth/secret collision or exposure); `./transport-beacon` out of
scope.

**Scale/Scope**: Multi-app + federated. The OTLP transport is configured once at the
runtime level and owned by the host (007 contract); enabling injection is a host-level
construction choice. Duplicate-package-copy behaviour unchanged (isolated).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **API Stability (I)**: Additive — `OtlpTransportOptions` gains one optional `boolean`
  field (default `false`); the option type erases at runtime so the subpath's runtime
  export set is unchanged (still exactly `createOtlpTransport`). No existing
  field/behaviour changes; the disabled default is byte-identical. Safe path stays easy
  (injection is deliberate opt-in; nothing dumps extra data). **PASS.**
- **Browser Resilience & Failure Safety (II)**: The homogeneity check + header build are
  wrapped so any failure yields **no header** and the batch still delivers; they run inside
  the already-fail-closed `flushBatch`, and `deliver` still never throws/rejects. Malformed
  or heterogeneous trace context degrades to "no header", never to a throw or a dropped
  log. **PASS.**
- **Neutrality & Portability (III)**: Pure W3C Trace Context; works with any tracer; no
  vendor dep; the header builder imports only `type` from `../api/types.js` and nothing
  from `src/trace/` or `@opentelemetry/*`, so **no vendor identifier reaches the
  `./transport-otlp` bundle** (the 007 bundle-shape gate is unchanged and still enforced).
  **PASS.**
- **Structured Observability (III)**: The header is standards-conformant W3C
  `traceparent`/`tracestate`, derived only from the already-structured `context.trace`; no
  other field is serialized into the header; event payloads and OTLP records are unchanged.
  Backends consume the standard header without call-site rewrites. **PASS.**
- **Secure by Default (IV)**: The header carries only trace identifiers (+bounded
  `tracestate`), never secrets. Consumer `options.headers` are spread last so the injected
  headers can't overwrite, duplicate, or expose auth/secret values; the header value never
  appears in records, bodies, `onInternalError` diagnostics, thrown errors, or the bundle.
  Off by default → no new default capture. No env/build/transport downgrade. **PASS.**
- **Log Integrity & Monitoring Suitability (VI)**: No drop/sample/resize/reorder/transform
  of events. Homogeneous-only + carry-only avoids a header that misrepresents a mixed
  batch. Presence/absence rules are deterministic and documented. Event payloads + OTLP
  records unchanged. **PASS.**
- **Lightweight Logger & Federated Runtime (VII)**: No per-`Logger` state, timer, listener,
  ambient read, or network work added. The injection work is per-flushed-batch on the
  single configured transport instance; `child()`/`withContext()` stay constant-cost. Host
  owns the runtime; duplicate copies stay isolated. **PASS.**
- **Reproducible Verification (VIII)**: All gates run via existing `npm` scripts, identical
  local/CI. `tests/` held to `src/` standards. No new relaxations planned. **PASS.**
- **Mechanical Enforcement (IX)**: Every gate paired with an automated check (table below);
  the transport-otlp size budget is an explicit, enforced constant. **PASS.**
- **Test & Documentation Coverage**: Contract + failure + security + unit tests enumerated
  in Phase 1; README/quickstart show the safe opt-in. **PASS.**

**Gate result: PASS — no violations. Complexity Tracking empty.**

### Documented gate → enforcement map (Principle IX)

| Gate | Enforcement mechanism |
|------|----------------------|
| `injectTraceparent` option shape + construction validation (boolean if defined) | `tests/contract/transport-otlp-traceparent.contract.test.ts` (construction throw-on-non-boolean, T009) + `tests/contract/transport-otlp.contract.test.ts` (export surface) |
| Homogeneous-only injection policy (single-trace injects; mixed/none/empty omit) | `tests/contract/transport-otlp-traceparent.contract.test.ts` |
| `traceparent`/`tracestate` string format + flags byte + `tracestate` bound | `tests/unit/transport-otlp/traceparent-header.test.ts` |
| Fail-closed: malformed/heterogeneous → no header, no throw, batch ships | `tests/integration/transport-otlp-traceparent-failure-safety.integration.test.ts` |
| Default-off → request byte-identical to pre-feature baseline | `tests/contract/transport-otlp-traceparent.contract.test.ts` (default-off case) |
| No secret/auth-header leak, collision, or overwrite via injected header | `tests/security/transport-otlp-traceparent-privacy.security.test.ts` |
| No `@opentelemetry/*` / vendor id in `./transport-otlp` bundle (still) | `tests/security/transport-otlp-bundle-shape.security.test.ts` (unchanged) |
| `dist/transport-otlp.mjs` within size budget | `tests/security/transport-otlp-bundle-shape.security.test.ts` (budget constant) |
| Default / `./testing` / `./transport-beacon` bundles byte-unchanged (±1 KiB) | `scripts/ci/bundle-invariance-check.sh` (no core touch → no delta) |
| Subpath runtime export surface unchanged (still `createOtlpTransport`) | `tests/contract/transport-otlp.contract.test.ts` + `tests/contract/declarations-surface.test.ts` |
| No per-`Logger` cost from this feature | existing `tests/performance/transport-otlp-logger-cost.perf.test.ts` (unchanged) |
| DCO sign-off | `dco-check` CI job |

## Project Structure

### Documentation (this feature)

```text
specs/009-traceparent-injection/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── traceparent-injection.md   # option + homogeneity policy + header/precedence rules
├── checklists/
│   └── requirements.md  # /speckit-specify output
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
src/
└── transport-otlp/
    ├── otlp-transport.ts            # + injectTraceparent option, validation, state field;
    │                                #   flushBatch builds per-request headers before deliver()
    └── traceparent-header.ts        # NEW (pure, intra-subpath, type-only ../api/types.js import):
                                     #   decideBatchTraceparent(events) → headers | none;
                                     #   buildRequestHeaders(base, events, enabled)

tests/
├── contract/
│   ├── transport-otlp.contract.test.ts            # extended: export surface unchanged
│   └── transport-otlp-traceparent.contract.test.ts # NEW: homogeneity policy + default-off
│                                                  #      + construction throw-on-non-boolean (TI-1)
├── unit/transport-otlp/
│   └── traceparent-header.test.ts                 # NEW: key/format/precedence/bound logic
├── integration/
│   └── transport-otlp-traceparent-failure-safety.integration.test.ts  # NEW
└── security/
    ├── transport-otlp-traceparent-privacy.security.test.ts            # NEW
    └── transport-otlp-bundle-shape.security.test.ts                    # unchanged (must still pass)
```

Build/config touch-points:
- **No** new `tsup` entry, **no** new `exports` map entry, **no** new public export.
- `tests/security/transport-otlp-bundle-shape.security.test.ts` — re-baseline the
  transport-otlp gzip budget constant **only if** the measured delta requires it (the
  header builder is small; first preference is to stay within the current ceiling).
- **No** change to `tests/security/transport-beacon-bundle-shape.security.test.ts`
  `DEFAULT_ENTRY_MJS_GZ_*` constants — core is untouched.

**Structure Decision**: Keep the entire change inside the `src/transport-otlp/` subpath. A
new pure `traceparent-header.ts` reads the already-normalized `event.context.trace`
(written by Feature 008's emit-path normalization), computes the homogeneous batch
decision, and formats the W3C header strings — importing only `type` from
`../api/types.js`, nothing from `src/trace/` or any vendor package, so the subpath's
vendor-neutral bundle gate (007 TO-7) is preserved. `otlp-transport.ts` gains the opt-in
option, its construction validation, a state field, and a one-line wiring in `flushBatch`
to pass a per-request header map to the existing `deliver(...)`. No core, no new export, no
new subpath.

## Complexity Tracking

> No constitutional violations — section intentionally empty.
