# SafeSignal

**SafeSignal** is a browser-first, vendor-neutral structured logging
facade and safety boundary for browser applications and federated
frontend modules. It catches the errors your users actually hit —
uncaught exceptions, unhandled rejections, and React/Vue component
crashes — and ships them securely to any backend. Published on npm as
`@tallyrow/safesignal`.

## Install

```bash
npm install @tallyrow/safesignal
```

## Quickstart

```ts
import { configureLogging, createLogger, ConsoleTransport } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web', version: '2025.05.0' },
  environment: 'production',
  transports: [ConsoleTransport()],
});

const log = createLogger();
log.info('checkout opened', { cartItems: 3 });
```

## Why SafeSignal

- **Secure-by-default**: tokens, cookies, auth headers, and known-PII fields
  are stripped before any transport sees an event. Fail-closed redaction —
  a redactor failure drops the field, never emits unredacted.
- **Never-throw boundary**: no transport, redactor, or sanitizer failure
  propagates into your `log.info()` call site. Logging cannot break rendering,
  navigation, or state updates.
- **Vendor-neutral transport**: ship to Datadog, Honeycomb, your own ingestion,
  or the built-in transports — same API regardless of destination.
- **Federated-runtime aware**: host owns the configured runtime; modules import
  loggers without re-configuring. Hundreds of `Logger` instances per page stay
  constant-cost.
- **Lightweight**: ~8 KB gzipped default entry; structured events with bounded
  depth and bounded size.

## Subpaths

All opt-in — the core stays tiny. Each routes through the same secure pipeline.

| Subpath | What it does | Import |
|---|---|---|
| `./transport-beacon` | Body-only HTTPS delivery via `sendBeacon` | `@tallyrow/safesignal/transport-beacon` |
| `./transport-otlp` | OTLP/HTTP+JSON (or protobuf) to any OTLP backend | `@tallyrow/safesignal/transport-otlp` |
| `./capture` | Host-installed global uncaught error / unhandled rejection capture | `@tallyrow/safesignal/capture` |
| `./framework-react` | `<LogErrorBoundary>` + `useLogError()` for React | `@tallyrow/safesignal/framework-react` |
| `./framework-vue` | `app.config.errorHandler` adapter + composables for Vue 3 | `@tallyrow/safesignal/framework-vue` |
| `./stacks` | Trimmed, structured, optionally source-mapped error stack frames | `@tallyrow/safesignal/stacks` |
| `./dev-console` | Pretty, collapsed, level-styled dev console rendering | `@tallyrow/safesignal/dev-console` |
| `./testing` | `assertTransportContract` helper for transport security tests | `@tallyrow/safesignal/testing` |

Core features (no subpath needed):
- **W3C trace context** — carry-only `trace_id`/`span_id` on every event;
  `./transport-otlp` populates OTLP `traceId`/`spanId` fields.
- **Error breadcrumbs** — opt-in bounded ring buffer attaches recent-event
  trail and cause chain to every error.
- **Deep error serialization** — opt-in (`serializeErrors: true`): the error
  payload carries the full `cause` chain (`error.causes`, flat and ordered),
  `AggregateError` members (`error.members`, recursive), and safe own
  enumerable extra properties (`error.fields`, incl. `DOMException.code`) —
  bounded by clamped limits under one node budget, fail-safe (a hostile
  getter never drops the event), and passed through the same sanitize →
  scrub → redact pipeline as all event data. Truncation is always explicit
  (`causesTruncated`, `membersTotal`, `fieldsTruncated`, `budgetExhausted`).
  Tune via `serializeErrors: { maxCauseDepth, maxMembers, maxFields,
  maxNodes }`. While enabled, the breadcrumbs `safesignal.errorCauses`
  attribute is not additionally populated — one chain, one place. As with
  attributes, redaction key rules apply to `fields`; still, prefer omission
  over redaction: don't stash secrets on Error objects.

Full details: [`docs/subpaths.md`](docs/subpaths.md)

## Ship logs over HTTPS

```ts
import { configureLogging, createLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

const onInternalError = (err: Error): void => myReporter.captureException(err);

configureLogging({
  application: { name: 'payments', version: '2.4.1' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      onInternalError,
    }),
  ],
  onInternalError,
});

const logger = createLogger();
logger.error('payment processor 5xx', { orderId: 'ord_9f3' }, new Error('upstream timeout'));
```

The transport satisfies the [transport security contract](contracts/transport.md)
(T-S1..T-S5) by construction: body-only, HTTPS, no event data in URLs. Supports
opt-in batching. See [`docs/subpaths.md`](docs/subpaths.md) for OTLP,
OTLP+protobuf, trace context, breadcrumbs, and the full subpath reference.

## What SafeSignal does NOT do

- Ship a transport in the default entry — use a subpath or implement `Transport`.
- Read `process.env`, `import.meta.env`, `location`, or `document.cookie` —
  pass `environment` explicitly.
- Touch globals from the core or `createLogger()`. The one opt-in exception:
  `./capture` is host-owned, explicitly installed, and never a side effect of
  creating a logger.
- Persist to IndexedDB. Batch, sample, or deduplicate by default.
- Web Vitals, view tracking, network instrumentation, or server backends.
  SafeSignal is an error-logging library, not a RUM product.

## Logging safely

The safe path is the easy path.

**DO — structured attributes, fixed-string messages:**

```ts
log.info('order placed', { orderId: order.id, total: order.total });
log.warn('payment declined', { reason: 'insufficient_funds', code: 'PD-12' });
```

**DON'T — interpolate values into messages or dump raw objects:**

```ts
// BAD — values buried in a string, invisible to the pipeline.
log.info(`order placed by ${user.email}`);

// BAD — dumps arbitrary state; the sanitizer type-tags classes/DOM/Events
// rather than recursing, so this produces no useful data and risks leaks.
log.error('reducer failed', { state });

// GOOD
log.info('order placed', { userId: user.id });
log.error('reducer failed', { orderId: state.orderId, errorCode: state.error });
```

Full DO/DON'T enumeration, sanitizer rules, redactor composition, and documented
drop/transform behaviors: [`docs/safe-logging.md`](docs/safe-logging.md).

## Federated deployments

Host owns `configureLogging()`; modules call `createLogger({ module })` against
the host's already-configured runtime. Duplicate package copies are **isolated**.
Full federated story: [`docs/safe-logging.md`](docs/safe-logging.md).

## Project resources

[![CI](https://github.com/TallyRow/safesignal/actions/workflows/ci.yml/badge.svg)](https://github.com/TallyRow/safesignal/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@tallyrow/safesignal.svg)](https://www.npmjs.com/package/@tallyrow/safesignal)

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — issues, PRs, DCO sign-off
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure
- [`GOVERNANCE.md`](GOVERNANCE.md) — project decision-making
- [`CHANGELOG.md`](CHANGELOG.md) — release notes (including v1.0.0 rename migration)
- [`docs/safe-logging.md`](docs/safe-logging.md) — full reference: sanitizer, redactor,
  transport security, federated ownership, documented drops/transforms
- [`docs/subpaths.md`](docs/subpaths.md) — per-subpath details: transports, capture,
  framework adapters, stacks, dev-console, testing
- [`contracts/transport.md`](contracts/transport.md) — T-S1..T-S5 transport security contract

## Migrating from `@your-org/frontend-logging-sdk`?

```bash
npm install @tallyrow/safesignal
```

```ts
// Before
import { createLogger } from '@your-org/frontend-logging-sdk';
// After
import { createLogger } from '@tallyrow/safesignal';
```

Subpaths unchanged. No runtime behavior changes. See [`CHANGELOG.md`](CHANGELOG.md).
