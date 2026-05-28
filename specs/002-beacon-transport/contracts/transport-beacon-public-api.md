# Contract — `./transport-beacon` Public API

**Feature**: 002-beacon-transport · **Spec**: [../spec.md](../spec.md)
· **Plan**: [../plan.md](../plan.md)

This contract locks the public surface of the new subpath
`@your-org/frontend-logging-sdk/transport-beacon`. Every assertion
below is asserted by an automated test in
`tests/contract/transport-beacon.contract.test.ts` or — for the bundle
shape and default-entry isolation invariants — in
`tests/security/transport-beacon-bundle-shape.security.test.ts`.

The contract is additive to feature 001. It does NOT supersede,
modify, or extend feature 001's public API contracts in
`specs/001-structured-logging-core/contracts/`.

## TB-1. The subpath exports exactly one factory and one options type

The module reachable via
`import * as TB from '@your-org/frontend-logging-sdk/transport-beacon'`
exports exactly two names:

- `createBeaconTransport` — a function with signature
  `(options: BeaconTransportOptions) => Transport`.
- `BeaconTransportOptions` — an interface (TypeScript-only export at
  type position; not in the runtime namespace).

No other runtime export exists. No `default` export. No re-export of
core types other than what is re-imported for the options-type's own
field types (which are re-imported, not re-exported).

## TB-2. The default entry is unchanged

The set of names exported by `@your-org/frontend-logging-sdk` is
bit-identical to the v1 set:

```text
createLogger, configureLogging, getRootLogger, createRedactor,
scrubUrl, ConsoleTransport, NoopTransport, AppIdentity, Attributes,
AttributeValue, CreateLoggerOptions, ErrorInfo, LevelMap, LogContext,
LogEvent, Logger, LoggerConfig, LogLevel, ModuleIdentity, Redactor,
RedactionRule, SanitizerLimits, ScrubUrlOptions, Transport,
TransportFactory
```

The default entry MUST NOT re-export `createBeaconTransport` or
`BeaconTransportOptions`. Asserted by an `import * as Index from
'@your-org/frontend-logging-sdk'` reflection test and by the
declarations-surface scan from feature 001's T013.

## TB-3. The factory returns a `Transport`

`createBeaconTransport({ endpoint: 'https://...' })` returns an
object that satisfies the existing `Transport` interface from
`@your-org/frontend-logging-sdk`. Specifically:

- The return value has a string `name`.
- The return value has a `send(event)` method returning `void`.
- The return value has a `flush()` method returning `Promise<void>`.
- The return value has a `shutdown()` method returning `Promise<void>`.
- The return value's prototype is `Object.prototype` (no class
  instance) — the factory returns a plain object literal so consumers
  cannot extend or replace internal methods.

## TB-4. Construction is side-effect-free

Construction MUST NOT:

- Attach any global event listener (`window.addEventListener`,
  `document.addEventListener`, etc.).
- Start any timer or interval (`setTimeout`, `setInterval`,
  `requestAnimationFrame`, `queueMicrotask`).
- Read any ambient browser state (`window.location`, `document.cookie`,
  `localStorage`, `sessionStorage`, `navigator.userAgent`,
  `process.env`, `import.meta.env`).
- Invoke `navigator.sendBeacon` or `fetch`.
- Patch any global (`console`, `fetch`, `XMLHttpRequest`,
  `navigator.sendBeacon`, `window.onerror`).

Asserted by a sweep that constructs 1,000 transports and counts
listener installations, timer creations, ambient reads, and network
calls — all MUST be zero.

## TB-5. Construction-time scheme validation

`createBeaconTransport({ endpoint })` MUST throw a TypeScript-typed
error (the concrete class is unspecified — `Error` or a subclass) at
construction when:

- The `endpoint` string fails `new URL(endpoint)` parsing.
- The `endpoint`'s scheme is not `https:` AND
  (`allowInsecureLoopback !== true` OR the host is not in the
  loopback allowlist).
- The `endpoint`'s scheme is `https:` but the host is malformed (e.g.,
  whitespace, empty string).

The thrown error's `.message` MUST name (a) the violated constraint
and (b) the offending endpoint string.

When `allowInsecureLoopback: true` is set, the following endpoints
are accepted: `http://localhost`, `http://localhost:<port>`,
`http://127.0.0.1`, `http://127.0.0.1:<port>`, `http://[::1]`,
`http://[::1]:<port>`. Any other `http://` host (e.g.,
`http://example.com`, `http://10.0.0.1`, `http://my-dev-server`)
still throws.

## TB-6. Construction-time options-shape validation

`createBeaconTransport({ ...invalid })` MUST throw at construction
when any field violates the validation rules in [data-model.md](../data-model.md):

- `endpoint` is not a string.
- `batching.maxBatchSize` is not an integer in `[1, 1000]`.
- `batching.maxBatchAgeMs` is set and not a finite non-negative number.
- `allowInsecureLoopback` is set and is not a boolean.
- `name` is set and is not a non-empty string.

The thrown error MUST name the violating field and the constraint it
violated. Construction MUST NOT silently coerce or normalize invalid
values.

## TB-7. The returned `Transport` passes `assertTransportContract`

A beacon transport instance in **default configuration**
(`{ endpoint: 'https://logs.example.com/ingest' }`) MUST pass every
assertion in the existing
`assertTransportContract` helper from `@your-org/frontend-logging-sdk/testing`:

- T-1..T-9 (behavioral) — `name` is a non-empty string; `send` is a
  function; `send` accepts a `LogEvent`; `send` returns `void`;
  `flush`/`shutdown` are optional but if present return Promises;
  `shutdown` is idempotent; `send` after `shutdown` is a no-op; etc.
- T-S1..T-S5 (security) — body-only delivery; no URL params; no
  fragment carrying event content; HTTPS for cross-origin; immutable
  treatment of received events; tolerant of `flush`/`shutdown`
  being called multiple times.

A beacon transport instance with **batching enabled**
(`{ endpoint: 'https://logs.example.com/ingest', batching: { maxBatchSize: 10 } }`)
MUST also pass every assertion in the same helper. The helper is
agnostic to whether the transport batches.

## TB-8. The `name` field defaults to `'beacon'` and is overridable

- `createBeaconTransport({ endpoint: '...' }).name === 'beacon'`.
- `createBeaconTransport({ endpoint: '...', name: 'beacon-ingest' }).name === 'beacon-ingest'`.
- Two instances constructed with different `name` values are
  distinguishable in `onInternalError` notices via the
  `BeaconError.transportName` field.

## TB-9. The factory is referentially transparent (no shared state across instances)

Two calls to `createBeaconTransport(options)` produce two
independent transport instances. Specifically:

- Each instance has its own buffer (when batching).
- Each instance installs its own `pagehide` listener on first
  `send()` (verified via spy on `addEventListener`).
- Each instance has its own `notified.*` rate-limit flags.
- A drop notice fired by one instance does NOT prevent the same code
  from firing on the other instance.

## TB-10. Construction is synchronous and cannot await

The factory returns synchronously. No path through `createBeaconTransport`
calls `await`, returns a Promise, or schedules a microtask.
The returned `Transport`'s `send` method is also synchronous (it
returns `void`, never a Promise — the underlying network call is
fire-and-forget).

## TB-11. Bundle-shape isolation

(Asserted by `tests/security/transport-beacon-bundle-shape.security.test.ts`.)

- The new subpath's source under `src/transport-beacon/**` MUST NOT
  import (runtime or value imports) from any module under
  `src/internal/**`, `src/runtime/**`, `src/pipeline/**`,
  `src/config/**`, `src/context/**`, or `src/transport/**`. The only
  permitted import is type-only:
  `import type { LogEvent, Transport } from '../api/types.js'`. The
  test scans the subpath's source files directly (a regex / AST walk)
  to flag any forbidden import.
- The built `dist/transport-beacon.{mjs,cjs}` MUST NOT contain any
  observability-vendor package name (`@opentelemetry/*`,
  `@datadog/*`, `dd-rum`, `@sentry/*`, etc.).
- The built `dist/transport-beacon.{mjs,cjs,d.ts}` MUST NOT contain
  vendor-specific identifiers (`SeverityNumber`, `LoggerProvider`,
  `Span`, `Exporter`, `Processor`).
- The built `dist/index.{mjs,cjs,d.ts}` (the default entry) MUST NOT
  contain `createBeaconTransport`, the `oversized_event` /
  `beacon_batch_drop` / `beacon_unavailable` code strings, or the
  beacon transport's source-distinctive identifiers.
- The built `dist/transport-beacon.mjs` MUST be ≤ 5120 bytes
  gzipped.

## TB-12. No dependency-pins regression

(Asserted by extending feature 001's
`tests/contract/dependency-pins.test.ts`.)

- `package.json` `dependencies` remains empty after this feature.
- `package.json` `devDependencies` introduces no new vendor SDK or
  observability-package entry beyond what feature 001 already
  carries (in particular, the existing `@opentelemetry/*` dev-only
  pins are not modified by this feature).
- `package.json` `exports` gains exactly one new entry,
  `./transport-beacon`, with the documented `types` / `import` /
  `require` triple.

## Contract test plan

| ID    | File                                                                | Assertion summary                                |
|-------|---------------------------------------------------------------------|--------------------------------------------------|
| TB-1  | `tests/contract/transport-beacon.contract.test.ts`                  | Subpath surface reflection (exactly 2 exports)   |
| TB-2  | `tests/contract/public-api.contract.test.ts` (feature 001) + new sweep | Default-entry surface unchanged                  |
| TB-3  | `tests/contract/transport-beacon.contract.test.ts`                  | Returned object satisfies `Transport`            |
| TB-4  | `tests/performance/transport-beacon-construction.performance.test.ts` | Construction side-effect-free over 1,000 instances |
| TB-5  | `tests/unit/transport-beacon/endpoint-validation.test.ts`           | Scheme validation matrix (HTTPS / HTTP / loopback / malformed) |
| TB-6  | `tests/unit/transport-beacon/endpoint-validation.test.ts`           | Options-shape validation matrix                   |
| TB-7  | `tests/contract/transport-beacon.contract.test.ts`                  | `assertTransportContract` passes (default + batching) |
| TB-8  | `tests/contract/transport-beacon.contract.test.ts`                  | `name` defaulting and override                   |
| TB-9  | `tests/contract/transport-beacon.contract.test.ts`                  | Multi-instance independence                       |
| TB-10 | `tests/contract/transport-beacon.contract.test.ts`                  | Synchronous construction; sync `send`            |
| TB-11 | `tests/security/transport-beacon-bundle-shape.security.test.ts`     | Bundle-shape isolation + gzip budget             |
| TB-12 | `tests/contract/dependency-pins.test.ts` (feature 001, extended)    | No new deps; `exports` gains one entry           |
