# Contract: `./transport-otlp` Public API

**Subpath**: `@tallyrow/safesignal/transport-otlp`
**Stability**: additive; backward compatible; no change to `.`, `./testing`,
`./transport-beacon`.

## TO-1 — Exported surface (exactly two names)

The subpath entry (`src/transport-otlp/index.ts`) exports **exactly**:

- `createOtlpTransport` — a value (factory function).
- `OtlpTransportOptions` — a **type-only** export (erases at runtime).

`Object.keys(await import('@tallyrow/safesignal/transport-otlp'))` MUST equal
`['createOtlpTransport']` at runtime.

*Enforcement*: `tests/contract/transport-otlp.contract.test.ts`;
`tests/contract/declarations-surface.test.ts` (exports-map + d.ts surface).

## TO-2 — Factory signature & construction-time validation

```ts
function createOtlpTransport(options: OtlpTransportOptions): Transport
```

- MUST validate `options` and throw a typed error **synchronously at the call
  site** when invalid (bad/missing/non-HTTPS endpoint per TO-5; malformed
  options). Construction is the ONLY place this subpath may throw.
- MUST NOT perform network, timer, listener, or ambient-read work in the factory
  beyond pure validation (lazy `pagehide` install happens on first `send`).

*Enforcement*: contract test (construction throws on bad endpoint; succeeds on
good); performance test (no per-instance side effects).

## TO-3 — `Transport` contract conformance (T-S1..T-S5)

The returned object MUST satisfy `assertTransportContract`:
- **Structural**: `name: string` (non-empty), `send(event): void | Promise<void>`.
- **T-S1**: no `LogEvent` data appears in any request URL.
- **T-S2**: cross-origin delivery is body-only (POST JSON).
- **T-S3**: absolute endpoint URLs are HTTPS (loopback HTTP only via
  `allowInsecureLoopback`).
- **T-S4**: the transport does not mutate the received event.
- **T-S5**: `flush()` and `shutdown()` are idempotent.

*Enforcement*: `tests/contract/transport-otlp.contract.test.ts` runs
`assertTransportContract(createOtlpTransport({ endpoint: 'https://…' }))`.

## TO-4 — Fail-safe behavior

- `send()`, `flush()`, `shutdown()` MUST NEVER throw or reject to the caller.
- Delivery failure (non-2xx, reject, `fetch` absent, oversized, buffer overflow,
  page-unload) MUST drop the affected event/batch and surface **at most one**
  `onInternalError` notice per failure class per instance per session.
- **No retry**: a failed flush MUST NOT be re-attempted.
- Buffer length MUST stay ≤ `maxBufferedEvents` (bounded memory).

*Enforcement*: `tests/contract/transport-otlp.contract.test.ts` (failure
injection) + `tests/integration/transport-otlp-host-module.integration.test.ts`.

## TO-5 — Endpoint security

- HTTPS endpoints pass. `http://` passes ONLY with `allowInsecureLoopback: true`
  AND hostname ∈ {`localhost`, `127.0.0.1`, `[::1]`}. All else throws at
  construction.
- The consumer supplies the full OTLP logs URL; the transport appends nothing to
  it (no synthesized paths/queries).

*Enforcement*: contract + `tests/unit/transport-otlp/endpoint-validation.test.ts`.

## TO-6 — Header / secret isolation

- `options.headers` are sent only on the delivery request.
- No header value MUST appear in any serialized record, request body,
  `onInternalError` message, thrown error, or the published bundle.

*Enforcement*: `tests/security/transport-otlp-privacy.security.test.ts` (secret
fixture in a header; assert absent from body/records/diagnostics) + bundle scan.

## TO-7 — Vendor neutrality & bundle discipline

- `src/transport-otlp/**/*.ts` MUST import only intra-subpath (`./…`) modules
  and a **type-only** import from `../api/types.js`. No import from
  `../internal/`, `../runtime/`, `../pipeline/`, `../config/`, `../context/`,
  `../transport/`, **or `../internal/telemetry/otel/`**, and no `@opentelemetry/*`
  package import.
- `dist/transport-otlp.{mjs,cjs}` MUST contain no `@opentelemetry/` string and
  no vendor identifier (`SeverityNumber`, `LogRecord`, `LoggerProvider`, …) and
  no `@datadog`/`@sentry` reference.
- `dist/index.{mjs,cjs,d.ts}` MUST NOT contain OTLP-subpath fingerprints
  (`createOtlpTransport`, `OtlpTransportOptions`, OTLP failure-code literals).
- `dist/transport-otlp.mjs` gzipped MUST stay within its recorded budget (a
  small headroom over the measured baseline, mirroring beacon's 5120 B style).

*Enforcement*: `tests/security/transport-otlp-bundle-shape.security.test.ts`
(mirror of `transport-beacon-bundle-shape.security.test.ts`).

## TO-8 — Lightweight & federated

- No per-`Logger` init; batcher/timer/connection state live on the single
  configured transport instance; `child()`/`withContext()` stay constant-cost.
- Host owns the runtime; modules don't replace it. Duplicate-package-copy =
  **isolated**.

*Enforcement*: `tests/performance/transport-otlp-logger-cost.perf.test.ts` +
integration host/module test.

## TO-9 — Zero new runtime dependencies

- The subpath adds no entry to `dependencies`. The OTLP-JSON serializer is
  hand-written.

*Enforcement*: `tests/contract/dependency-pins.test.ts`.
