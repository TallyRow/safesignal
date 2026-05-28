# SafeSignal

**SafeSignal** is a browser-first, vendor-neutral structured logging
facade and safety boundary for browser applications and federated
frontend modules. It ships secure-by-default sanitization, URL
scrubbing, key + shape redaction, control-character escaping, and a
pluggable transport boundary — all applied before any transport sees
an event. Published on npm as `@tallyrow/safesignal` (TallyRow is the
publishing organization; SafeSignal is the product).

> **Status**: in development. US1 (public API, level filtering),
> US2 (pluggable transports, failure isolation, `/testing` subpath),
> and US3 (full security pipeline — sanitization, URL scrubbing,
> redaction, control-character escaping, dev-mode freeze) are
> functional end-to-end. US4 (federated host/module context) and
> US5 (many-`Logger`-per-page scale + vendor-neutral runtime) follow.
> See `specs/001-structured-logging-core/tasks.md`.

## What this package gives you

- A stable public `Logger` API (`debug | info | warn | error`) with structured
  attributes.
- Production-safe defaults: `warn` and `error` are the baseline; `debug` and
  `info` are opt-in.
- A pluggable transport boundary — bring your own HTTP/beacon/file delivery.
- **Secure-by-default** sanitization, URL scrubbing, key + shape redaction,
  control-character escaping, and a dev-mode deep freeze — all applied
  **before** any transport sees an event. The pipeline order is locked
  by automated security tests and cannot be bypassed.
- Failure isolation: a misbehaving transport never breaks the host app.
- Fail-closed redaction: if a redactor throws or returns an invalid
  value, the affected event is dropped (never partially emitted) and
  `onInternalError` is invoked.

## What this package does NOT do (in v1)

- Ship an HTTP/beacon transport — implement `Transport` yourself; body-only
  delivery is required by the transport contract.
- Read `process.env.NODE_ENV`, `import.meta.env`, `location`, or
  `document.cookie` — pass `environment` explicitly.
- Install global listeners or singletons.
- Persist events.
- Batch, sample, or deduplicate events.

## Install

```bash
npm install @tallyrow/safesignal
```

## Quickstart

```ts
import {
  configureLogging,
  createLogger,
  ConsoleTransport,
} from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web', version: '2025.05.0' },
  environment: 'production',
  transports: [ConsoleTransport()],
});

const log = createLogger();

log.info('checkout opened', { cartItems: 3 });
log.warn('coupon rejected', { code: 'SUMMER25', reason: 'expired' });
log.error('payment failed', { provider: 'acme-pay' }, new Error('declined'));
```

### Ship logs over HTTPS — `./transport-beacon` subpath

For body-only HTTPS delivery, import the first-party
`createBeaconTransport` from the `./transport-beacon` subpath. It
satisfies the transport security contract (T-S1..T-S5) by
construction — see
[`docs/safe-logging.md`](docs/safe-logging.md) for the full
write-up.

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
      onInternalError, // ← inner hook for async beacon drops
    }),
  ],
  onInternalError,     // ← outer hook for SafeTransport failures
});

const logger = createLogger();
logger.warn('payment retry exceeded threshold', { attemptCount: 4 });
logger.error('payment processor 5xx', { orderId: 'ord_9f3' }, new Error('upstream timeout'));
```

The transport:

- Refuses non-HTTPS endpoints at construction time (loopback dev
  endpoints opt in via `allowInsecureLoopback: true`).
- Prefers `navigator.sendBeacon`; falls back once to `fetch` with
  `keepalive: true` and `credentials: 'same-origin'`.
- Installs a single `pagehide` listener lazily on first `send()`;
  removes it on `shutdown()`.
- Supports optional opt-in batching for high-volume pages — see
  the [Beacon transport batching](docs/safe-logging.md#beacon-transport-batching-opt-in)
  section of `docs/safe-logging.md` for the envelope shape and
  `maxBatchSize × per-event-size < 64 KiB` sizing rule.
- Surfaces every drop through `onInternalError` with a documented
  `BeaconErrorCode` — `oversized_event`, `transport_send_failed`,
  `beacon_batch_drop`, `beacon_unavailable`,
  `transport_shutdown_failed`. Wire the hook to **both** layers
  above for full coverage.

### Level configuration

In `production`, `debug` and `info` are dropped by default. Raise the
threshold per environment:

```ts
configureLogging({
  environment: 'production',
  level: { production: 'info', development: 'debug', test: 'warn' },
  transports: [ConsoleTransport()],
});
```

## Logging safely

The constitution requires the **safe path** to be the **easy path**. A few
patterns the package's types and pipeline enforce:

### DO — structured attributes, fixed-string messages

```ts
log.info('order placed', {
  orderId: order.id,
  total:   order.total,
  currency: order.currency,
});

log.warn('payment declined', { reason: 'insufficient_funds', code: 'PD-12' });
```

### DON'T — interpolate values into the message string

```ts
// BAD — values disappear into a string the package can't structure.
log.info(`order placed by ${user.email}`);

// GOOD — values stay structured and reviewable.
log.info('order placed', { userId: user.id });
```

### DON'T — dump whole objects, DOM nodes, or framework objects

```ts
// BAD — the sanitizer (T031) will type-tag classes / DOM / Event /
// Promise rather than recurse, so this won't even produce useful data
// AND it risks pulling fields you didn't intend to log.
log.info('order placed', { order });
log.error('click handler failed', { event });           // DOM Event
log.error('reducer failed', { state });                  // full app state

// GOOD — extract the fields you actually want.
log.info('order placed', { orderId: order.id, total: order.total });
```

[`docs/safe-logging.md`](docs/safe-logging.md) covers the full
enumeration of DO / DON'T patterns, the sanitizer's bounded-input
rules, the redactor's default denylist and shape rules,
`createRedactor()` composition, `scrubUrl()` usage, the
diagnostics contract, and — per constitution Principle VI — every
documented behavior that drops, transforms, or otherwise bounds an
event before delivery (level-filter drops, fail-closed redactor
drops, sanitizer truncation markers, URL-scrubber replacements,
control-char escapes, `NoopTransport` swallowing, and the v1
no-batching / no-sampling / no-deduplication stance).

## Transport security — body-only, HTTPS, no event data in URLs

Consumer transports MUST follow the security clauses of
`contracts/transport.md` (T-S1..T-S5). These are not stylistic — they
exist because URLs leak through proxy logs, browser history, server
access logs, referer headers, and APM dashboards. The package's
pipeline does no good if you then funnel its output through a query
string.

### Rules

- **T-S1 — No event data in URLs.** No part of a `LogEvent` may appear
  in the URL path, query string, or fragment. Not the message, not an
  attribute value, not a context field.
- **T-S2 — Body-only delivery.** Use `navigator.sendBeacon(url, blob)`
  with a JSON `Blob`, or `fetch(url, { method: 'POST' | 'PUT' | 'PATCH',
  body: JSON.stringify(event), keepalive: true })`. Never `GET`.
- **T-S3 — HTTPS for cross-origin.** Absolute URLs MUST use `https://`.
  Same-origin relative URLs (`/log`) inherit the page's scheme and are
  fine.
- **T-S4 — Treat events as immutable.** Don't mutate the `LogEvent` the
  transport receives. The package freezes events in `__DEV__` builds to
  catch accidental writes.
- **T-S5 — Idempotent `flush()` / `shutdown()`.** Both are optional and
  safe to call more than once.

### Canonical sample

The first-party `createBeaconTransport` from
`@tallyrow/safesignal/transport-beacon` (used in the
[Quickstart](#ship-logs-over-https--transport-beacon-subpath)
section above) is the body-only beacon reference both example
projects use. It tries `sendBeacon` first, falls back to `fetch`
with `keepalive: true`, and refuses non-HTTPS endpoints at
construction time.

Consumers who need a different delivery primitive implement the
`Transport` interface themselves and follow T-S1..T-S5 in their
own code.

### Verify your transport with `assertTransportContract`

The `./testing` subpath ships a contract-test helper that runs T-S1..T-S5
against any consumer-supplied transport. Use it in your own test suite —
not in production code:

```ts
// my-transport.test.ts
import { assertTransportContract } from '@tallyrow/safesignal/testing';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

test('my transport satisfies the security contract', async () => {
  await assertTransportContract(
    createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  );
});
```

The helper intercepts `globalThis.fetch` and `navigator.sendBeacon` for
the duration of each check and asserts the bad-shapes that T-S1..T-S5
forbid. It throws on the first violation with a diagnostic message
naming the failing clause.

## Federated / module-federation deployments

The host application owns `configureLogging()` by convention;
federated modules call `createLogger({ module })` against the
host's already-configured runtime. Duplicate physical copies of
the package on a page are **isolated** by design — each copy
maintains its own runtime, with no globalThis registry — and
consumers who want cross-copy sharing configure their bundler's
module-federation singleton.

The full federated story is in
[`docs/safe-logging.md`](docs/safe-logging.md):
"Configuration ownership in federated deployments", "Duplicate
package copies", and "Vendor neutrality".

## Examples

- [`examples/host-app/`](examples/host-app/) — single-app consumer;
  uses the first-party `createBeaconTransport` from
  `@tallyrow/safesignal/transport-beacon` for body-only
  HTTPS delivery.
- [`examples/federated-module/`](examples/federated-module/) —
  federated module consumer; demonstrates `createLogger({ module })`
  against a host-configured runtime, with security guidance for
  module authors (no host secrets, no ambient state, no full host
  state). See its [README](examples/federated-module/README.md) for
  pointers into the federated docs.

## Where to learn more

- `specs/001-structured-logging-core/spec.md` — feature specification
- `specs/001-structured-logging-core/plan.md` — implementation plan
- `specs/001-structured-logging-core/contracts/` — public API, transport,
  log-event, logger-config, failure-safety, redaction, sanitization contracts
- `specs/001-structured-logging-core/quickstart.md` — consumer onboarding tour
- [`docs/safe-logging.md`](docs/safe-logging.md) — full DO/DON'T sweep,
  documented drops/transforms/bounded behaviors, configuration
  ownership for federated deployments, duplicate-copy classification,
  vendor neutrality
- `.specify/memory/constitution.md` — governing principles (v1.2.0)
