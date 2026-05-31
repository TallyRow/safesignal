# Contract: `./transport-otlp` Outbound `traceparent` Header Injection

**Subpath**: `@tallyrow/safesignal/transport-otlp`
**Stability**: additive; backward compatible; no change to `.`, `./testing`,
`./transport-beacon`, or the existing `./transport-otlp` behaviour when disabled.
**Extends**: Feature 007 (`transport-otlp-public-api.md` TO-1..TO-9) and Feature 008
(`trace-context.md`, `otlp-trace-mapping.md`). This contract adds the `TI-*` assertions
below; all `TO-*` assertions continue to hold unchanged.

## TI-1 — Opt-in option (additive; runtime surface unchanged)

`OtlpTransportOptions` gains exactly one optional field:

```ts
injectTraceparent?: boolean; // default false
```

- The subpath's runtime export set MUST remain exactly `['createOtlpTransport']`
  (`OtlpTransportOptions` is type-only; the new field erases at runtime).
- `createOtlpTransport({ endpoint, injectTraceparent })` MUST validate the field at
  construction: if `injectTraceparent` is defined and not a boolean, construction MUST
  throw a `TypeError` synchronously at the call site (TO-2 — construction is the only
  throw site).

*Enforcement*: `tests/contract/transport-otlp-traceparent.contract.test.ts`
(construction throw-on-non-boolean + export-set unchanged),
`tests/contract/transport-otlp.contract.test.ts`,
`tests/contract/declarations-surface.test.ts`.

## TI-2 — Disabled by default (byte-identical request)

When `injectTraceparent` is unset or `false`:

- No `traceparent` and no `tracestate` request header is ever set, regardless of the
  events' trace context.
- The delivery request (URL, method, body, and the full header map passed to `fetch`) is
  byte-identical to the pre-feature behaviour.

*Enforcement*: `tests/contract/transport-otlp-traceparent.contract.test.ts` (default-off
case asserts no trace headers and a header map equal to `options.headers` + content-type).

## TI-3 — Homogeneous-only injection (fail-closed)

With `injectTraceparent: true`, on each delivered batch the transport sets a `traceparent`
request header **if and only if** the batch is non-empty AND every event carries the same
single valid normalized trace identity — i.e. all events share one identical
`(traceId, spanId, traceFlags-byte)` derived from `event.context.trace`. In all other
cases — empty batch, no event carries trace context, or two or more events carry differing
trace identities (including a mix of traced and untraced events) — **no** `traceparent`
header is set.

- The transport MUST NOT select a "representative" event or otherwise inject a header that
  does not uniformly describe the whole batch.
- The transport MUST source the value only from the events' existing `context.trace`; it
  MUST NOT mint trace/span ids.

*Enforcement*: `tests/contract/transport-otlp-traceparent.contract.test.ts` (single-trace
→ header present; mixed / untraced-mix / empty → header absent).

## TI-4 — `traceparent` string format

When injected, the header value MUST be the W3C level-1 form:

```text
00-<32-hex traceId>-<16-hex spanId>-<2-hex flags>
```

- `traceId` / `spanId` are emitted exactly as carried (already lowercase-hex, validated
  upstream) — no transformation.
- flags = `(traceFlags ?? 0) & 0xff`, rendered as exactly two lowercase-hex digits; absent
  `traceFlags` yields `00`.
- Version is always `00`.

*Enforcement*: `tests/unit/transport-otlp/traceparent-header.test.ts`.

## TI-5 — `tracestate` rides along only when uniform

When (and only when) `traceparent` is injected, the transport additionally sets a
`tracestate` header **iff** every event in the batch carries the same defined
`traceState` string within the 512-char bound. If `traceState` is absent on any event,
differs across events, or exceeds the bound, `tracestate` MUST be omitted while
`traceparent` is still set (optional part dropped, valid ids kept).

*Enforcement*: `tests/contract/transport-otlp-traceparent.contract.test.ts`,
`tests/unit/transport-otlp/traceparent-header.test.ts`.

## TI-6 — Injected headers never overwrite consumer headers or leak secrets

- The per-request header map MUST be constructed so consumer-supplied `options.headers`
  win on any key collision (injected trace headers MUST NOT overwrite, duplicate, or
  expose an `options.headers` value).
- The frozen `state.headers` MUST NOT be mutated.
- No `traceparent`/`tracestate` value or any consumer header value MUST appear in any
  serialized record, request body, `onInternalError` message, thrown error, or the
  published bundle (TO-6 holds).
- The injected header MUST carry only trace identifiers + bounded `tracestate`; no other
  event field, attribute, or context value may be serialized into a request header.

*Enforcement*: `tests/security/transport-otlp-traceparent-privacy.security.test.ts`
(secret fixture in `options.headers` and a consumer `traceparent`; assert injection never
overwrites/duplicates/exposes them) + the existing bundle scan.

## TI-7 — Fail-safe: never throw into delivery; never drop a batch

- Computing the batch decision and building the header MUST NEVER throw or reject into
  `send` / `flush` / `shutdown`. Any unexpected failure MUST fall back to no injected
  header and the batch MUST still be delivered.
- Malformed, partial, or heterogeneous trace context MUST yield no header and MUST NOT
  drop, reorder, resize, or otherwise alter the batch.

*Enforcement*:
`tests/integration/transport-otlp-traceparent-failure-safety.integration.test.ts`.

## TI-8 — Vendor neutrality & bundle discipline (unchanged gate still holds)

- `src/transport-otlp/**` (including the new `traceparent-header.ts`) MUST import only
  intra-subpath (`./…`) modules and a **type-only** import from `../api/types.js`. It MUST
  NOT import from `../trace/`, `../internal/`, `../runtime/`, `../pipeline/`, `../config/`,
  `../context/`, `../transport/`, or any `@opentelemetry/*` package.
- `dist/transport-otlp.{mjs,cjs}` MUST remain free of `@opentelemetry/` and vendor
  identifiers, and `dist/transport-otlp.mjs` gzipped MUST stay within its recorded budget.
- `dist/index.{mjs,cjs,d.ts}`, `dist/transport-beacon.*`, and the `./testing` bundle MUST
  be byte-unchanged by this feature (no core touch).

*Enforcement*: `tests/security/transport-otlp-bundle-shape.security.test.ts` (vendor scan +
size budget) + `scripts/ci/bundle-invariance-check.sh` (zero delta on non-OTLP bundles).

## TI-9 — Lightweight & federated (unchanged)

- No per-`Logger` state, timer, listener, ambient read, or network work is added. The
  decision + header build run once per flushed batch on the single configured transport
  instance, synchronously, bounded O(batch size).
- Host owns the runtime; enabling injection is a host-level construction choice. Duplicate
  package copies stay isolated (TO-8 holds).

*Enforcement*: existing `tests/performance/transport-otlp-logger-cost.perf.test.ts`
(unchanged) + the host/module integration test.

## Contract test plan

| ID   | File | Assertion summary |
|------|------|-------------------|
| TI-1 | `transport-otlp-traceparent.contract.test.ts` + `transport-otlp.contract.test.ts` | option additive; export surface unchanged; boolean-or-throw |
| TI-2 | `transport-otlp-traceparent.contract.test.ts` | disabled ⇒ no trace headers; request byte-identical |
| TI-3 | `transport-otlp-traceparent.contract.test.ts` | single-trace injects; mixed/untraced-mix/empty omit |
| TI-4 | `traceparent-header.test.ts` | `00-…-…-<2hex>` format; flags default `00` |
| TI-5 | `transport-otlp-traceparent.contract.test.ts` + `traceparent-header.test.ts` | `tracestate` only when uniform + bounded |
| TI-6 | `transport-otlp-traceparent-privacy.security.test.ts` | consumer headers win; no secret/dup/expose; no leak in diagnostics/bundle |
| TI-7 | `transport-otlp-traceparent-failure-safety.integration.test.ts` | no throw into delivery; batch still ships |
| TI-8 | `transport-otlp-bundle-shape.security.test.ts` + invariance check | no vendor id; size budget; non-OTLP bundles byte-unchanged |
| TI-9 | `transport-otlp-logger-cost.perf.test.ts` (existing) | no per-`Logger` cost added |
