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
- **Lightweight**: ~8 KB gzipped default entry; structured events with bounded depth and bounded size; the core installs no global listeners and reads no ambient state (an opt-in host subpath may install one — see Roadmap), and `Logger` creation does no per-instance backend init.

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
  transport, the `./transport-otlp` subpath to ship OTLP/HTTP+JSON
  to any OTLP backend, or implement `Transport` yourself for a
  custom delivery primitive.
- Read `process.env.NODE_ENV`, `import.meta.env`, `location`, or
  `document.cookie` — pass `environment` explicitly.
- Touch globals from the **core** or from `createLogger()` — the
  core installs no global listeners and reads no ambient state. The
  **one opt-in exception** is host-owned: a host may install a
  single global **error** capturer via the
  [`./capture` subpath](#catch-uncaught-errors--capture-subpath) —
  explicit, opt-in, routed through the same secure pipeline;
  federated modules never install it. View tracking, web vitals,
  and network instrumentation remain out of scope — SafeSignal is
  not a RUM product.
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

## Ship logs to OTLP — `./transport-otlp` subpath

To deliver SafeSignal's events to **any OTLP-compatible backend**
(Datadog, Honeycomb, Grafana, an OpenTelemetry Collector,
ClickHouse, …), import `createOtlpTransport` from the
`./transport-otlp` subpath. It emits standard **OTLP/HTTP+JSON**
logs — vendor-neutral, with zero new runtime dependencies and no
`@opentelemetry/*` in the bundle.

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [
    createOtlpTransport({
      endpoint: 'https://otlp.example.com/v1/logs', // full OTLP logs URL, HTTPS
      headers: { 'x-api-key': process.env.OTLP_API_KEY! }, // sent only on the wire
      batching: { maxBatchSize: 20, maxBatchAgeMs: 5000 },
    }),
  ],
});

getRootLogger().info('checkout.started', { cartId: 'c_123', itemCount: 3 });
```

What it guarantees:

- **OTLP/HTTP+JSON** `LogRecord`s with your application/module/
  environment identity mapped to the OTLP `Resource`
  (`service.name`, `service.version`, `deployment.environment`;
  `module.*` per-record). Levels map to OTLP severity
  (`debug`→5, `info`→9, `warn`→13, `error`→17).
- **Fail-safe**: `fetch` with `keepalive` delivery, **no retry** —
  a down/slow/erroring backend never throws into your code and
  never breaks the page. Failed batches are dropped with one
  rate-limited `onInternalError` notice per failure class
  (`oversized_event`, `buffer_overflow`, `delivery_unavailable`,
  `send_failed`, `partial_rejection`, `serialize_failed`,
  `shutdown_failed`).
- **Secure**: events are already redacted before the transport
  sees them; auth headers are sent only on the request and never
  appear in payloads, diagnostics, or the bundle. HTTPS-only
  (loopback `http://` requires explicit `allowInsecureLoopback`).
- **Lightweight & federated**: the transport is configured once at
  the runtime level; the host owns it, federated modules do not
  replace it, and duplicate package copies are **isolated**. Local
  collectors: `endpoint: 'http://localhost:4318/v1/logs'` with
  `allowInsecureLoopback: true`.

## Correlate logs with traces — W3C trace context

Supply a **W3C Trace Context** and SafeSignal carries `trace_id` / `span_id`
on every event; when shipped via `./transport-otlp`, they populate the OTLP
`LogRecord`'s standard `traceId` / `spanId` / `flags` fields, so any backend
joins each log to its trace. SafeSignal is **carry-only** — it never mints ids.

```ts
import { configureLogging, getRootLogger, parseTraceparent } from '@tallyrow/safesignal';

// From a header string the app already holds (e.g. SSR-injected):
const trace = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  context: trace ? { trace } : {},
  // …or dynamically, per emit, from your tracer's active span:
  correlation: () => {
    const s = myTracer.activeSpan();
    return s ? { trace: { traceId: s.traceId, spanId: s.spanId, traceFlags: 1 } } : {};
  },
});

getRootLogger().info('payment.authorized', { amount: 4200 });
```

- **Carry-only / fail-safe**: no supplied context ⇒ no trace fields; a malformed
  `traceparent`, wrong-length/all-zero id, or oversized `tracestate` is dropped
  fail-closed — the event still ships, no throw.
- **Secure**: trace ids are identifiers, not secrets; `tracestate` is bounded;
  existing redaction is unaffected.
- **Vendor-neutral**: pure W3C — works with any tracer; the `./transport-otlp`
  bundle stays `@opentelemetry`-free. Trace context layers through the same
  context-merge precedence (root → logger chain → `correlation()`); host and
  federated modules each contribute without per-`Logger` cost.

### Tag the delivery request with `traceparent`

Beyond the per-`LogRecord` trace fields above, the `./transport-otlp` transport
can also set a W3C `traceparent` (and `tracestate`) **request header** on the
delivery request itself, so a backend or collector can join the ingest request
to its trace. It is **off by default** — opt in per transport:

```ts
const transport = createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  headers: { authorization: `Bearer ${token}` }, // sent only on the wire
  injectTraceparent: true, // ← opt in
});
```

A delivery request carries the header **only when every event in the flushed
batch shares one valid trace context** (the common case for a burst of logs in
one span); a mixed-trace, trace-less, or empty batch sends no header — never an
arbitrary "representative" one. `tracestate` rides along only when it is
identical across the batch (and within the 512-char bound).

- **Carry-only / fail-safe**: built from the events' existing `context.trace`;
  no ids are minted, header construction never throws into a logging call or
  blocks delivery, and the event payload is byte-identical either way.
- **Secure**: the header carries only trace identifiers + bounded `tracestate`;
  it never overwrites, duplicates, or exposes your auth/secret `headers`
  (a consumer-supplied `traceparent` wins). Only `./transport-otlp` supports it
  — `navigator.sendBeacon` cannot set custom request headers, so
  `./transport-beacon` is out of scope.

## Catch uncaught errors — `./capture` subpath

Uncaught exceptions and unhandled promise rejections normally vanish —
they never reach your configured transports. The **opt-in** `./capture`
subpath lets a **host** route them through the same secure pipeline as
every other log:

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
import { installGlobalErrorCapture } from '@tallyrow/safesignal/capture';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' })],
});

// Host installs once — returns a disposer.
const dispose = installGlobalErrorCapture(getRootLogger());
// …on teardown: dispose();
```

It emits an `error`-level event (`'Uncaught exception'` /
`'Unhandled promise rejection'`) carrying the serialized error and a
`safesignal.source` / `safesignal.errorType` marker, redacted +
sanitized like any log.

- **Host-owned, opt-in** (Principle VIII): it is **never** a side effect
  of `createLogger()`; a **federated module never installs it** — only the
  host that owns the runtime does. Pass it the host's `Logger`
  (`getRootLogger()` or `createLogger({ module })`).
- **Fail-safe**: it never throws into the page and never breaks
  rendering/navigation; a failing transport is swallowed to
  `onInternalError`.
- **Additive**: it chains via `addEventListener` — your existing
  `window.onerror`/handlers keep firing; it never `preventDefault()`s.
- **Errors only** — no view tracking, web vitals, or network
  instrumentation (that is RUM; see Roadmap). Duplicate package copies are
  **isolated** (each capturer uses the `Logger` from its own copy).

## Catch React errors — `./framework-react` subpath

When a React component throws during render, the default outcome is a blank
screen and an error that never reaches your transports. The **opt-in**
`./framework-react` subpath is the **no-globals, per-component** counterpart to
`./capture`: a `<LogErrorBoundary>` and a `useLogError()` hook that route React
errors through your existing `Logger` and render a graceful fallback. `react` is
a **peer dependency** (`>=16.8`) — the core and every other subpath stay
React-free.

```tsx
import { configureLogging, createLogger } from '@tallyrow/safesignal';
import { LoggerProvider, LogErrorBoundary, useLogError }
  from '@tallyrow/safesignal/framework-react';

configureLogging({ application: { name: 'checkout-web' }, environment: 'production', transports: [/* … */] });
const log = createLogger({ module: 'checkout' });

function App() {
  return (
    <LoggerProvider logger={log}>
      <LogErrorBoundary fallback={<p>Something went wrong.</p>}>
        <Checkout />
      </LogErrorBoundary>
    </LoggerProvider>
  );
}
```

A boundary-caught error emits an `error`-level event (`'React render error'`)
carrying the serialized error and the React **component stack**
(`safesignal.react.componentStack`), with `safesignal.source:
'react-error-boundary'`, redacted + sanitized like any log. For the errors a
boundary **cannot** catch — event handlers, async/`Promise` callbacks, effects —
use the hook:

```tsx
function SaveButton() {
  const logError = useLogError(); // stable callback; resolves the logger from context
  const onClick = async () => {
    try { await save(); } catch (err) { logError(err, { 'safesignal.action': 'save' }); }
  };
  return <button onClick={onClick}>Save</button>;
}
```

- **No globals** (Principle VIII): patches nothing, attaches no `window`
  listeners — the explicit contrast with `./capture`'s host-level install. The
  two are complementary and can be used together.
- **Fail-safe** (Principle III): a logging (or `onError`) failure is swallowed
  and the fallback still renders; React semantics keep it loop-free.
- **Fail-closed** (Principle V): errors route through the same redaction
  pipeline as any log; if redaction fails the event is dropped.
- **Explicit logger**: provide it via `<LoggerProvider>` or a `logger` prop /
  `useLogError(logger)` argument. With no logger resolvable, the helpers are a
  **safe no-op** (never throw). `<LogErrorBoundary>` also accepts `onError`,
  `resetKeys`, and a render-prop `fallback={(error, reset) => …}` for recovery.
  Duplicate package copies are **isolated** (each routes through the logger it is
  handed).

## Readable error stacks — `./stacks` subpath

A raw browser error stack is a wall of minified, framework-internal noise. The
**opt-in** `./stacks` subpath parses an error's stack into **trimmed, structured
frames** (function / file / line / column), and — when you supply a **synchronous
source-map resolver** — maps minified production frames back to original source
positions. **Off by default.**

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createStackNormalizer } from '@tallyrow/safesignal/stacks';

// Optional: a SYNCHRONOUS resolver over source maps you have already loaded.
const resolver = (f) => mySourceMaps.lookup(f.file, f.line, f.column) ?? null;

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [/* … */],
  normalizeStack: createStackNormalizer({ resolver, maxFrames: 30 }), // OFF unless set
});

getRootLogger().error('checkout failed', { orderId: 'ord_9f3' }, new Error('boom'));
```

The delivered **error** event gains `attributes['safesignal.stack']` — an ordered
array of `{ function?, file?, line?, column?, original? }` (the raw `error.stack`
string is preserved unchanged). Other events are untouched.

- **Trimmed**: `node_modules`, engine-internal, and boilerplate frames are removed
  by default (`includeNodeModules` / `includeInternal` opt back in); bounded to
  `maxFrames` (default 30, max 100).
- **Source-mapped**: with a **synchronous** `resolver`, resolvable frames carry
  `original`; an unmappable frame is left as-is. SafeSignal does **no** async work
  or `.map` fetching — you load your maps; SafeSignal calls a fast sync lookup.
- **Safe**: frames ride in `attributes`, so a secret in a frame URL's query is
  scrubbed by the pipeline (whole-value guarantee). Off by default, fail-safe
  (a throwing parser/resolver never breaks the page — the error is always
  delivered), runtime-level (no per-`Logger` cost), and **no new dependency**.

## Error breadcrumbs — recent-event context on errors

When an error is logged, the hardest debugging question is "what happened *just
before* this?" Enable **opt-in error breadcrumbs** and every error log
automatically carries a bounded trail of the most recent events plus the error's
cause chain — built only from SafeSignal's own already sanitized + redacted
events. **Off by default.**

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [/* … */],
  breadcrumbs: true,          // or { maxEvents: 30 } — default 20, max 100
});

const log = getRootLogger();
log.info('checkout opened', { cartItems: 3 });
log.warn('coupon expired');
log.error('checkout failed', { orderId: 'ord_9f3' },
  new Error('checkout failed', { cause: new Error('payment processor 5xx') }));
```

The delivered **error** event gains two documented, machine-parseable attribute
fields (other events are untouched):

- `attributes['safesignal.breadcrumbs']` — the recent events, oldest→newest, each
  `{ ts, level, message, app?, module?, attributes? }` (host vs. federated-module
  origin stays distinguishable).
- `attributes['safesignal.errorCauses']` — the error's nested cause chain,
  outermost→root, each `{ name, message }`.

- **Bounded & cheap**: a single runtime-level ring buffer — constant memory (≤
  `maxEvents`), constant-cost recording, **no** per-`Logger` cost. Duplicate
  package copies are **isolated** (each runtime owns its buffer).
- **Safe**: breadcrumbs carry only the post-redaction event; the cause chain runs
  through the same redaction. It never mutates other (or already-delivered)
  events, and never throws into the page — an error is always delivered, with or
  without the trail.

## Pretty dev logs — `./dev-console` subpath

The built-in `ConsoleTransport` hands devtools the message plus the structured
event object — correct and safe, but a wall of JSON to scan locally. The
**opt-in** `./dev-console` subpath ships `DevConsoleTransport`: a pretty,
**development-only** sibling that renders the *same* already sanitized + redacted
event as a collapsed, level-styled group (icon/color, message, `app · module ·
env`, attributes, error, and a trace link). Select it **only** in development so
your bundler tree-shakes it out of production entirely:

```ts
import { configureLogging, getRootLogger, ConsoleTransport } from '@tallyrow/safesignal';
import { DevConsoleTransport } from '@tallyrow/safesignal/dev-console';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: import.meta.env.DEV ? 'development' : 'production',
  transports: [
    import.meta.env.DEV
      ? DevConsoleTransport({ traceUrl: ({ traceId }) => `https://trace.example/${traceId}` })
      : ConsoleTransport(),
  ],
});

getRootLogger().info('checkout opened', { cartItems: 3 });
```

- **Genuine zero production cost**: the dev branch is dead-code-eliminated from
  your production build, so the renderer ships **0 bytes** there. SafeSignal's
  default `.` entry (and `ConsoleTransport`) is byte-unchanged.
- **Runtime-gated + defensive**: it renders pretty only when the event's
  `environment === 'development'`; in any other environment — or where rich
  console features are absent — it behaves exactly like `ConsoleTransport`
  (`console[level](message, event)`), even if mistakenly used in production.
- **Structured-only & safe**: it renders **only** the post-pipeline event (no
  re-serialization of app objects), attaches **no** globals, reads no ambient
  state, and never throws into the page. The optional `traceUrl` formatter is
  carry-only — built from the event's existing trace ids, no ids minted.

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
diagnostics contract, and — per constitution Principle VII — every
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

[![CI](https://github.com/TallyRow/safesignal/actions/workflows/ci.yml/badge.svg)](https://github.com/TallyRow/safesignal/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@tallyrow/safesignal.svg)](https://www.npmjs.com/package/@tallyrow/safesignal)

Community and legal:

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to file issues, open PRs, sign commits (DCO)
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

- **OTLP/HTTP+protobuf encoding** for the
  [`./transport-otlp`](#ship-logs-to-otlp--transport-otlp-subpath)
  subpath — the subpath ships **JSON** today behind an internal
  encoding seam; a protobuf encoder is an additive follow-up (no
  public-API change).
- **RUM features** — Web Vitals, view tracking, network
  instrumentation, and *automatic* page-level capture (planned as
  opt-in subpaths under `./rum-*`). Note: **explicit, host-installed**
  uncaught-error capture already ships via
  [`./capture`](#catch-uncaught-errors--capture-subpath), and
  **explicit, per-component** React error handling ships via
  [`./framework-react`](#catch-react-errors--framework-react-subpath) —
  both distinct from these future *automatic* RUM signals.

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
