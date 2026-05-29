# SafeSignal

**SafeSignal** is a browser-first, vendor-neutral structured logging
facade and safety boundary for browser applications and federated
frontend modules. Secure-by-default sanitization, URL scrubbing,
key + shape redaction, control-character escaping, and a pluggable
transport boundary — all applied before any transport sees an event.
Published on npm as `@tallyrow/safesignal` (TallyRow is the
publishing organization; SafeSignal is the product).

## Why SafeSignal

- **Secure-by-default**: token / cookie / authorization-header / known-PII fields stripped before any transport sees an event. Fail-closed redaction — a redactor failure drops the field, never emits unredacted.
- **Never-throw boundary**: no transport, redactor, or sanitizer failure propagates into your `log.info(...)` call site. Logging cannot break rendering, navigation, or state updates.
- **Vendor-neutral transport**: ship to Datadog, Honeycomb, your own ingestion, or the built-in `./transport-beacon` subpath for body-only HTTPS delivery — same API regardless of destination.
- **Federated-runtime aware**: host owns the configured runtime; modules import loggers without re-configuring. Hundreds of `Logger` instances per page stay constant-cost.
- **Lightweight**: ~8 KB gzipped default entry; structured events with bounded depth and bounded size; no global listeners, no ambient state reads, no per-instance backend init.

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

> Previously known as `@your-org/frontend-logging-sdk`? See [Migration history](#migration-history) for the install + import upgrade path.

## What this package does NOT do (in v1)

- Ship an HTTP/beacon transport in the default entry — use the
  `./transport-beacon` subpath for the first-party body-only HTTPS
  transport, or implement `Transport` yourself for a custom
  delivery primitive.
- Read `process.env.NODE_ENV`, `import.meta.env`, `location`, or
  `document.cookie` — pass `environment` explicitly.
- Install global listeners or singletons (RUM-style automatic
  error capture, view tracking, web vitals, network
  instrumentation are forward-looking; see Roadmap below).
- Persist events to IndexedDB or any storage layer.
- Batch, sample, or deduplicate events by default (opt-in
  batching is available via the `./transport-beacon` subpath).

## Ship logs over HTTPS — `./transport-beacon` subpath

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

## Level configuration

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
[`./transport-beacon` subpath](#ship-logs-over-https--transport-beacon-subpath)
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

## Project resources

[![pipeline status](https://gitlab.com/tallyrow/safesignal/badges/main/pipeline.svg)](https://gitlab.com/tallyrow/safesignal/-/commits/main)

Community and legal:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to file issues, send MRs, sign commits (DCO)
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure policy
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1
- [`GOVERNANCE.md`](GOVERNANCE.md) — how project decisions get made
- [`LICENSE`](LICENSE) — MIT license
- [`CHANGELOG.md`](CHANGELOG.md) — version-by-version release notes

Reference docs and design history:

- [`docs/safe-logging.md`](docs/safe-logging.md) — full DO/DON'T sweep,
  documented drops/transforms/bounded behaviors, configuration
  ownership for federated deployments, duplicate-copy classification,
  vendor neutrality
- `specs/001-structured-logging-core/` — core feature spec, plan,
  contracts, quickstart (public API, transport, log-event,
  failure-safety, redaction, sanitization)
- `specs/002-beacon-transport/` — first-party `./transport-beacon`
  feature spec, plan, contracts, quickstart
- `specs/003-rename-safesignal/` — v1.0.0 rename feature
- `.specify/memory/constitution.md` — governing principles (v1.2.0)

## Roadmap

The following are forward-looking items (not shipping today):

- **Trace-context propagation** — W3C Trace Context (`traceparent`,
  `tracestate`) for correlating frontend logs with backend traces.
- **`./transport-otlp` subpath** — OTel-formatted events; ships to
  any OTLP-compatible backend (Datadog, Honeycomb, Grafana
  Tempo + Loki, self-hosted ClickHouse, etc.).
- **RUM features** — Web Vitals, automatic error capture, view
  tracking, network instrumentation (planned as opt-in subpaths
  under `./rum-*`).

A separate sibling project, **`safesignal-server`**, is planned as
a self-hostable monitoring backend that consumes SafeSignal's
OTLP-formatted events. SafeSignal stays a small vendor-neutral
SDK; the server lives in its own repo when it ships.

## Migration history

The v1.0.0 release on 2026-05-28 renamed the project from its
working name (`@your-org/frontend-logging-sdk`) to **SafeSignal**,
published on npm as `@tallyrow/safesignal`. The original rename
notice from that release follows verbatim for consumers arriving
via the legacy package name.

This package was previously developed under the working name
`@your-org/frontend-logging-sdk`. As of v1.0.0 it ships as
**SafeSignal**, published on npm as `@tallyrow/safesignal`.

**Migration**:

```bash
# Install the new package
npm install @tallyrow/safesignal
```

```ts
// Update every import:
// Before
import { createLogger } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';

// After
import { createLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
import { assertTransportContract } from '@tallyrow/safesignal/testing';
```

Subpaths (`/testing`, `/transport-beacon`) are unchanged — only the
package-name segment moves. No runtime behavior, public API,
redaction default, sanitizer limit, URL-scrubber behavior, or
transport-security contract change in this release. Bundle sizes
remain within ±1 KiB of the pre-rename baseline. See
[`CHANGELOG.md`](CHANGELOG.md) for the release entry.
