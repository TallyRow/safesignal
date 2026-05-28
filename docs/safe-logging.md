# Logging Safely

The package is **secure by default**: every event flows through a fixed
security pipeline before any transport sees it. This document
enumerates the DO and DON'T patterns that keep you on the safe path,
the package's documented automatic transformations, the extension
points (`createRedactor()`, `scrubUrl()`, `sanitizerLimits`), and the
complete list of every documented behavior that drops, transforms, or
otherwise bounds an event before delivery (Principle VI).

## Logging safely

### DO

```ts
// Fixed-string message + structured attributes. Each value stays
// reviewable downstream and can be searched by exact key.
log.info('order placed', {
  orderId: order.id,
  total:   order.total,
  currency: order.currency,
});

log.warn('payment declined', { reason: 'insufficient_funds', code: 'PD-12' });
```

```ts
// Extract the SPECIFIC fields you mean to log — never the whole object.
log.info('user.registered', {
  userId: user.id,
  plan:   user.plan,    // 'free' | 'pro' | 'enterprise' — known shape
});
```

```ts
// Use scrubUrl() before logging any URL you don't fully control.
import { scrubUrl } from '@your-org/frontend-logging-sdk';

log.info('navigation', {
  from: scrubUrl(previousUrl),
  to:   scrubUrl(nextUrl),
});
```

```ts
// Use child loggers for per-request / per-operation context. Parents
// are not mutated; the child layer is additive.
const requestLog = log.child({
  attributes: { requestId: 'r-92f1', route: '/checkout' },
});
requestLog.info('fetching cart');
```

### DON'T

```ts
// 1. Don't pass whole objects — class instances and DOM/framework
//    objects are type-tagged by the sanitizer rather than recursed.
//    The sanitizer is designed to be conservative; a dump like this
//    produces zero useful data AND risks pulling fields you didn't
//    intend to log if the object turns out to be a plain object after
//    all (e.g., an API response).
log.info('order placed', { order });               // BAD
log.info('order placed', { orderId: order.id });   // GOOD
```

```ts
// 2. Don't interpolate untrusted values into the message string.
//    Interpolated values disappear into the message — they cannot be
//    indexed by structured search, redacted by key, or shape-matched
//    accurately. The Bearer/JWT shape rules apply to whole strings,
//    not to substrings inside prose.
log.info(`order placed by ${user.email}`);   // BAD
log.info('order placed', { userId: user.id }); // GOOD
```

```ts
// 3. Don't log DOM nodes, Events, Promises, Maps, or framework
//    objects. The sanitizer reduces them to type tags — readable but
//    useless for debugging — so extract the fields you actually want.
log.error('click handler failed', { event });   // becomes "[Event:click]"
log.error('reducer failed',       { state });   // may include tokens

// GOOD: pluck the fields explicitly.
log.error('click handler failed', {
  type:    event.type,
  targetId: (event.target as HTMLElement | null)?.id,
});
```

```ts
// 4. Don't log raw URLs — they may carry tokens / session IDs / auth
//    codes in the query or fragment. Use scrubUrl().
log.info('redirected', { to: window.location.href });           // BAD
log.info('redirected', { to: scrubUrl(window.location.href) }); // GOOD
```

```ts
// 5. Don't put secrets in attribute keys NOT covered by the default
//    denylist. The package masks values for the documented sensitive
//    KEY names (password, token family, authorization, cookie,
//    secret, api_key, session_id, ssn, credit_card, etc.). For
//    project-specific sensitive keys, extend the redactor.
log.info('event', { x_internal_secret: value });  // NOT masked by default
// GOOD: extend the redactor.
configureLogging({
  redactor: createRedactor([
    { key: /internal[_-]?secret/i },
  ]),
});
```

```ts
// 6. Don't disable redaction or sanitizer limits in production code.
//    If you need looser bounds for debugging, gate it on environment
//    explicitly and confirm in code review.
configureLogging({
  sanitizerLimits: { maxDepth: 16, maxStringLength: 65536 }, // upper bounds
});
// (The package clamps any value above the documented Max anyway —
// see "Documented drops, transforms, and bounded behavior" below.)
```

## What the package does for you automatically

Every `Logger.{debug,info,warn,error}` call routes through a fixed
**locked-order** security pipeline before any `Transport.send()` sees
the event:

```
LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor →
ControlCharGuard → Freeze(dev) → Dispatcher → SafeTransport[]
```

Each stage is documented in the contract files under
`specs/001-structured-logging-core/contracts/`. The order is locked by
`tests/security/pipeline-order.security.test.ts` and cannot be bypassed
by any transport, custom redactor, or future vendor adapter.

| Stage | What it does | Where it's documented |
|-------|-------------|----------------------|
| `LevelFilter` | Drops the emission entirely before any event allocation when the call's level is below the resolved minimum. | `contracts/logger-config.md` LC-1..LC-11 |
| `EventBuilder` | Builds the canonical `LogEvent` (timestamp, level, message, attributes, context, optional error). The timestamp is package-assigned; consumer-supplied timestamps are ignored. | `contracts/log-event.md` LE-1..LE-11 |
| `Sanitizer` | Bounded depth/size/count coercion; type-tags class instances, DOM nodes, framework objects WITHOUT recursing into them. Never throws. | `contracts/sanitization.md` S-1..S-10 |
| `URLScrubber` | Strips sensitive query/fragment params from URL-shaped string values. Returns input unchanged for non-http(s) URLs. | `contracts/redaction.md` (URL section) |
| `Redactor` | Masks values for documented sensitive KEY names and for documented value SHAPES (JWT, Bearer). Fail-closed: throws or non-event returns drop the event. | `contracts/redaction.md` R-1..R-10 |
| `ControlCharGuard` | Escapes ASCII control characters (`\x00`–`\x1F` except `\t`/`\n`/`\r`) and U+2028/U+2029 in every string. | `contracts/log-event.md` row 4 |
| `Freeze(dev)` | In dev builds, deep-`Object.freeze`s the post-pipeline event so a misbehaving transport cannot mutate it. In production builds the body is dead-code-eliminated. | `contracts/log-event.md` (Immutability) |

## Customizing redaction and sanitization

### Extending the redactor

A `LoggerConfig.redactor` value **fully replaces** the default ruleset.
To extend the defaults with project-specific rules, **compose**:

```ts
import { configureLogging, createRedactor } from '@your-org/frontend-logging-sdk';

const base = createRedactor();
const extra = createRedactor([
  { key: /internal[_-]?secret/i },
  { key: 'email', replacement: '[email]' },
  // Optional value-shape rule (matches WHOLE strings only):
  { shape: /^cust_[A-Za-z0-9]{20,}$/ },
]);

configureLogging({
  redactor: (event) => {
    const after = base(event);
    return after === null ? null : extra(after);
  },
});
```

Rule semantics (see `contracts/redaction.md` for the full table):

- `key` matches **the immediate property name**, case-insensitive,
  full-name only — never a substring of a non-key value.
- `shape` matches **whole leaf string values**, anchored. A regex
  without `^` and `$` anchors still tests against the entire string
  (JavaScript's `RegExp.test` returns true for partial matches; use
  `^` and `$` if you want exact-string semantics).
- `replacement` defaults to `'[REDACTED]'`. Override per rule.
- A rule with BOTH `key` and `shape` matches on EITHER.
- Fail-closed: if your redactor throws or returns a value that is
  neither a `LogEvent` nor `null`, the dispatcher drops the affected
  event and invokes `onInternalError`. No partial emission.

### Pre-scrubbing URLs in attributes

```ts
import { scrubUrl } from '@your-org/frontend-logging-sdk';

scrubUrl('https://example.com/api?token=abc&page=2');
// → 'https://example.com/api?token=%5BREDACTED%5D&page=2'

// extraParams adds project-specific param names (string or RegExp):
scrubUrl('https://x/?xCustom=secret', {
  extraParams: ['xCustom', /internal[_-]?secret/i],
});

// fragment: false skips the hash-fragment scrub:
scrubUrl('https://x/?safe=ok#token=abc', { fragment: false });
// → 'https://x/?safe=ok#token=abc' (fragment untouched)
```

The pipeline calls `scrubUrl()` automatically on every URL-shaped
string value in `event.message`, `event.attributes`,
`event.context.attributes`, and `event.error.{message,stack}`. The
public helper is for **pre-scrubbing** URLs you want to log
intentionally (e.g., a redirect destination).

### Tightening sanitizer limits

Consumers MAY **tighten** the documented limits — useful for memory-
constrained hosts or stricter debuggability. Values **above** the
documented Max are clamped to Max and emit one `onInternalError`
notice per `configureLogging()` call; values **below** Min clamp to
Min the same way. Consumers cannot disable bounds.

```ts
configureLogging({
  sanitizerLimits: {
    maxDepth:           4,     // default 8, min 1, max 16
    maxStringLength:    2048,  // default 8192, min 64, max 65536
    maxArrayLength:     200,   // default 1000, min 1, max 10000
    maxAttributeCount:  64,    // default 256, min 1, max 4096
  },
});
```

## Transport-boundary security requirements

Consumer transports MUST follow `contracts/transport.md` clauses
T-S1..T-S5. These rules exist because URLs leak through more channels
than most teams realize — proxy access logs, CDN edge logs, browser
history, the `Referer` header, third-party analytics scripts that scrape
the address bar, and APM dashboards that index by path. The package's
pipeline does no good if you then funnel its output through a query
string.

### The five rules

| ID | Rule | Why it matters |
|----|------|----------------|
| T-S1 | **No event data in URLs.** No part of a `LogEvent` may appear in the URL path, query string, or fragment. | URLs are the most leaked surface in browser HTTP traffic. Even `/log?event=...` ends up in CDN logs and the page's `Referer` header. |
| T-S2 | **Body-only delivery.** Use `navigator.sendBeacon(url, blob)` with a JSON `Blob`, or `fetch(url, { method: 'POST' \| 'PUT' \| 'PATCH', body, keepalive: true })`. | The body of a same-origin POST is not logged by intermediate proxies the way URLs are. |
| T-S3 | **HTTPS for cross-origin.** Absolute URLs MUST use `https://`. Same-origin relative URLs inherit the page's scheme. | A `Mixed Content` warning is the *symptom*. The *cause* is that an `http://` log endpoint exposes every event in plain text to every network hop. |
| T-S4 | **Treat events as immutable.** Don't mutate the `LogEvent` the transport receives. | Multi-transport delivery and the `__DEV__` freeze rely on this — a mutating transport corrupts events for the next transport in the chain. |
| T-S5 | **Idempotent `flush()` / `shutdown()`.** Both are optional and safe to call more than once. | Reconfigure-then-shutdown and SPA navigation both call these hooks more than once; non-idempotent implementations leak resources or throw. |

### The canonical sample

The first-party `createBeaconTransport` from
`@your-org/frontend-logging-sdk/transport-beacon` is the body-only
beacon reference both example projects use and the recommended
ingestion path for HTTPS delivery. It implements the security
contract above by construction: prefer `sendBeacon` with a JSON
`Blob`, fall back to `fetch` with `keepalive: true` and a JSON body,
reject non-HTTPS endpoints at construction time, treat the received
event as immutable, and surface every drop through
`onInternalError` with a documented `BeaconErrorCode`.

See the [Beacon transport (first-party HTTPS peer transport)](#beacon-transport-first-party-https-peer-transport)
section below for the complete API surface, drop-notice taxonomy,
and federated-deployment recommendations.

```ts
import { configureLogging } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

configureLogging({
  application: { name: 'my-app' },
  environment: 'production',
  transports: [
    createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  ],
});
```

Consumers who need a different delivery primitive (a custom auth
header on every request, a non-HTTPS internal endpoint that isn't
loopback, a per-event sampling layer, etc.) implement the
`Transport` interface themselves and follow the same T-S1..T-S5
contract above. The first-party beacon transport is the easy
default; it is not the only option.

### Verify with `assertTransportContract`

The package's `./testing` subpath ships a contract-test helper that
exercises T-S1..T-S5 against any consumer-supplied transport. Use it in
your own test suite — never in production code:

```ts
// my-transport.test.ts
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

test('my transport satisfies the security contract', async () => {
  await assertTransportContract(
    createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  );
});
```

The helper intercepts `globalThis.fetch` and `navigator.sendBeacon` for
the duration of each check, drives several probe events through the
transport, and asserts the bad shapes T-S1..T-S5 forbid. It throws on
the first violation with a diagnostic message naming the failing
clause. The probe events include `makeSecretFixture()` values
(passwords, JWTs, bearer tokens, session IDs, etc.) so a transport that
encodes attributes into a URL leaks them and the check catches it.

### Failure-mode contract

Even when a transport passes the contract above, it's still wrapped in
the package's internal `SafeTransport`. The wrapper guarantees:

- A synchronous throw from `send()` is caught (no escape to the emit
  call site). One `onInternalError` notice per transport per session.
- A rejected `Promise` from `send()` is swallowed. No unhandled
  rejection. Same per-session notice budget.
- Repeated failures from the same transport are silent after the first
  notice — no log spam.
- A failing transport never prevents siblings in the same `transports`
  list from receiving the event.

See `contracts/failure-safety.md` (FS-1..FS-17) and the test in
`tests/contract/failure-safety.contract.test.ts` for the full battery.

### Anti-patterns to avoid

- **Don't** put event data in the URL. `fetch('https://x/log?evt=' +
  JSON.stringify(event))` leaks the entire event into proxy logs.
- **Don't** use `GET` for log delivery. Even an empty `?` becomes a
  surface the next "developer" will reach for. Reject GET at the
  transport boundary.
- **Don't** add tokens or session IDs as query params. Auth belongs in
  the request body or in headers, never in the URL.
- **Don't** mutate the event to add a delivery timestamp or sequence
  number. Wrap your payload in an envelope object during serialization
  instead.
- **Don't** install global `unhandledrejection` listeners as a backstop.
  The package's `SafeTransport` already catches everything; a global
  listener silently masks consumer-code bugs unrelated to logging.

## Beacon transport (first-party HTTPS peer transport)

The package ships a first-party body-only HTTPS beacon transport at
the subpath `@your-org/frontend-logging-sdk/transport-beacon`. It
satisfies T-S1..T-S5 above by construction and is the recommended
ingestion path for most consumers. The default entry is
unchanged — the new transport is reachable only via the explicit
subpath import.

```ts
import { configureLogging } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

const onInternalError = (err: Error): void => myReporter.captureException(err);

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      onInternalError, // ← inner hook for async beacon drops
    }),
  ],
  onInternalError,     // ← outer hook for SafeTransport-mediated failures
});
```

### What the factory does for you

- **HTTPS-only at construction.** Any non-HTTPS endpoint string
  throws synchronously at `createBeaconTransport(...)` time, before
  any logger is created or any listener attached. The error names
  the offending endpoint and the violated scheme constraint.
- **Body-only delivery.** Every event is JSON-stringified into the
  request body. URL, query, fragment, and headers carry no event
  content. Locked by T-S1..T-S5 above.
- **Primitive cascade.** `navigator.sendBeacon(endpoint, blob)`
  first; on falsy return or absence, exactly one
  `fetch(endpoint, { method: 'POST', body, keepalive: true,
  credentials: 'same-origin' })` fallback. No retry beyond that.
  Cross-origin requests get NO cookies by default.
- **Lazy lifecycle.** A single `pagehide` listener attaches on the
  first `send()` past the per-event size check, gated against
  double-install. `shutdown()` removes it. Construction is
  side-effect-free — 1,000 transports allocate 1,000 closures and
  attach zero listeners.
- **Multi-instance coexistence.** Two transports against two
  endpoints in the same runtime install independent listeners and
  have independent rate-limit state.

### Local development against `localhost`

`http://localhost`, `http://127.0.0.1`, and `http://[::1]` are
permitted **only** when you opt in explicitly at the call site:

```ts
createBeaconTransport({
  endpoint: 'http://localhost:4318/ingest',
  allowInsecureLoopback: true,
});
```

The flag is a literal boolean passed at construction. The package
**never** reads it from `process.env`, `import.meta.env`,
`window.location`, or any other ambient state — making the opt-in
visible to code review. Any other `http://` host (including
`http://10.0.0.1`, `http://my-dev-server`, or
`http://localhost.example.com`) still throws.

### Drop-notice routing

Every drop the transport recognizes fires `onInternalError` exactly
once per failure class per transport per session (the FS-12 rate-
limit pattern). Wire the hook into **both** `configureLogging` and
`createBeaconTransport`:

- The inner hook (`createBeaconTransport`'s `onInternalError`) is
  the channel for **async** drops — fetch keepalive rejection,
  batch timer flush failure, pagehide-fired flush failure. These
  execute outside the synchronous `send()` boundary that
  `SafeTransport` wraps.
- The outer hook (`configureLogging`'s `onInternalError`) catches
  the residual cases that `SafeTransport` translates from
  synchronous transport throws (rare, since the beacon transport
  never throws).

Wiring the same callback to both means the consumer sees one
notice per failure class. Each notice carries a discriminating
`.code` and `.transportName`:

| `err.code`                  | When                                                                                  |
|-----------------------------|---------------------------------------------------------------------------------------|
| `oversized_event`           | A single event's serialized size exceeds ~64 KiB. In batching mode the event is ejected from the batch; the remaining batch still flushes. |
| `transport_send_failed`     | (Default mode) sendBeacon refused AND the fetch fallback rejected/non-2xx.            |
| `beacon_batch_drop`         | (Batching mode) A batch flush failed (sendBeacon refused, fetch rejected, OR the envelope exceeds ~64 KiB). |
| `beacon_unavailable`        | Neither `navigator.sendBeacon` nor `fetch` is available. Vanishingly rare in 2026 browsers. |
| `transport_shutdown_failed` | The shutdown-flush threw unexpectedly (defense-in-depth — should never fire).         |

Notice payloads are **structural only** — `droppedCount`,
`transport.name`, reason summary. They MUST NOT include the
dropped events' `message`, `attrs`, `error`, or `context` (that
content might be the same payload whose size or shape was the
problem in the first place).

### Migration from the deprecated hand-rolled example

Earlier versions of this package shipped a hand-rolled reference
at `examples/shared/beacon-transport.ts`. That file has been
removed and the first-party transport replaces it. The migration
is a single import line:

```ts
// Before:
import { makeBeaconTransport } from '../shared/beacon-transport.js';
const transport = makeBeaconTransport({ endpoint: '...' });

// After:
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';
const transport = createBeaconTransport({ endpoint: '...' });
```

The first-party transport adds, beyond the hand-rolled version:
construction-time scheme validation with documented errors, lazy
gated listener install, multi-instance safety, oversized-event
detection with `onInternalError` routing, and optional opt-in
batching (see the next section).

## Beacon transport batching (opt-in)

The first-party beacon transport at
`@your-org/frontend-logging-sdk/transport-beacon` supports optional
in-memory batching to reduce network calls on chatty pages. Batching
is **off by default**; pass a `batching` field to opt in:

```ts
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

createBeaconTransport({
  endpoint: 'https://logs.example.com/ingest',
  batching: {
    maxBatchSize: 50,        // flush when 50 events accumulate
    maxBatchAgeMs: 10_000,   // ...or after 10 seconds, whichever first
  },
  onInternalError: (err) => myReporter.captureException(err),
});
```

### Envelope shape

A batched flush carries a single JSON body:

```json
{ "events": [/* up to maxBatchSize LogEvents in emission order */] }
```

The envelope is **exactly** `{ "events": [...] }` — no transport-level
metadata, no `flushedAt`, no `seq`, no `transportName`. Every signal
the ingestion endpoint needs is already inside each `LogEvent`'s
`level` / `timestamp` / `context` fields.

### When to enable

Batching trades a small additional latency (at most `maxBatchAgeMs`
between emit and ship) against fewer network calls. It is **only
worth enabling** on pages that produce dozens to hundreds of
warn/error events. For typical apps with a handful of events per
page, the default (one network call per event) is simpler and has
the same delivery guarantees.

When you enable batching, tune `maxBatchSize` against your average
event size. The browser's `sendBeacon` per-origin queue caps a
single request at **~64 KiB (5120 bytes gzipped)**. The transport
checks the serialized envelope size before every flush attempt:

- **Safe**: `maxBatchSize × avg-event-size < 64 KiB`. A batch of 50
  events at 1 KiB each = 50 KiB → flushes cleanly.
- **Risky**: a batch of 500 events at 200 bytes each = 100 KiB →
  the envelope exceeds the budget and the entire batch is dropped
  with a `beacon_batch_drop` notice. The transport never falls back
  to URL-based delivery (forbidden by T-S1..T-S5) and never falls
  back to non-keepalive `fetch` (it can't survive page unload).

Right-size `maxBatchSize` for your average payload — if you can't
predict it precisely, lower the batch size and accept more network
calls.

### Drop-notice routing

Every dropped batch surfaces through `BeaconTransportOptions.onInternalError`:

```ts
configureLogging({
  // ...
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      batching: { maxBatchSize: 50 },
      onInternalError: (err) => myReporter.captureException(err), // ← inner hook
    }),
  ],
  onInternalError: (err) => myReporter.captureException(err),    // ← outer hook
});
```

**Wire the hook into both places.** The inner hook is the only
channel for **async** drops (fetch keepalive rejection, batch-timer
flush failure, pagehide-fired flush failure). The outer hook
catches `SafeTransport`-mediated failures and applies to every
transport in the runtime. Same callback in both — the consumer
sees one notice per failure class per session, with a discriminating
`.code` and `.transportName`.

`BeaconErrorCode` values the beacon transport may emit:

| Code                       | When (batching mode)                                                    |
|----------------------------|--------------------------------------------------------------------------|
| `oversized_event`          | A single event's serialized size exceeds ~64 KiB. The event is **ejected from the batch** — the remaining batch still flushes normally. |
| `beacon_batch_drop`        | A batch flush failed (sendBeacon refused **and** fetch fallback rejected/non-2xx, **or** the serialized envelope exceeded ~64 KiB). The whole batch is dropped. |
| `beacon_unavailable`       | Neither `navigator.sendBeacon` nor `fetch` is available in the runtime. Vanishingly rare in modern browsers. |
| `transport_send_failed`    | (Default-mode only — won't fire in batching mode.)                       |
| `transport_shutdown_failed`| The shutdown-flush attempt threw unexpectedly (defense-in-depth).        |

Each code fires **at most once per transport per session** (the FS-12
rate-limit pattern from feature 001). If your endpoint is persistently
broken, you see the first drop and nothing more — instrument at the
application level if you need per-occurrence metrics. The notice
payload is **structural only** (event counts, transport name, reason
summary) — **no event content** (no `message`, no `attrs`, no
`error`, no `context`). Including event content in the notice would
risk leaking the same payload whose size or shape was the problem.

### Lifecycle interactions

- **`pagehide` flush**: when the browser is about to unload the
  page, the transport attempts one final synchronous flush of any
  pending batch. If the flush fails, exactly one
  `beacon_batch_drop` notice fires before the page unloads — your
  `onInternalError` callback observes it, but whether your error
  reporter manages to deliver the notice before unload is the
  reporter's problem (no different from any pagehide-time work).
- **`shutdown()` flush**: calling `transport.shutdown()` (e.g.,
  during a `configureLogging()` swap, or in a test cleanup) drains
  the pending batch with one best-effort flush, then removes the
  `pagehide` listener. Idempotent — a second `shutdown()` is a
  no-op.
- **Reconfigure during in-flight batch**: when `configureLogging()`
  swaps in a different transport while the previous beacon transport
  holds a pending batch, the previous transport's `shutdown()` flow
  drives the batch to completion **or** to exactly one
  `beacon_batch_drop` notice — never both, never neither, never
  partial. This is locked by SC-010 and verified end-to-end in
  `tests/integration/transport-beacon-batching.integration.test.ts`.

### Anti-patterns

- **Don't** treat batching as a replacement for sampling. Batching
  reduces network calls; it does not reduce the **events** the
  consumer emits. If your app produces too many events to inspect
  individually, the right fix is server-side sampling on a per-app
  basis, not silently dropping them at the transport.
- **Don't** retry inside your `onInternalError` handler. The
  transport made one best-effort attempt; the events are gone.
  Re-pushing them risks event duplication if the failure was on the
  ingestion side rather than the network side.
- **Don't** use `flush()` from within an event-handling hot path.
  `flush()` is the right primitive for app-shutdown / test-cleanup;
  calling it on every emission defeats the point of batching.
- **Don't** raise `maxBatchSize` above your observed per-event byte
  count's budget headroom. The size check is firm at ~64 KiB; an
  over-aggressive `maxBatchSize` drops batches deterministically
  with a `beacon_batch_drop` notice.

## Configuration ownership in federated deployments

When a single page hosts a host application **plus** one or more
independently deployed federated modules, only one of them owns the
configured runtime. The rule the package enforces is simple, and it
maps directly onto constitution v1.2.0 Principle VII and FR-031 /
FR-032:

> **The host application is the conventional owner of
> `configureLogging()`.** Federated modules call `createLogger({
> module })`, `child()`, and `withContext()` — they do **not** install
> the runtime.

That distinction is a *convention*, not a runtime check — the package
does not refuse a module-side `configureLogging()` call. But every
time a module would even consider calling it, treat the call as a
documented override of the host's setup, with the consequences below.

### Who calls what

| Caller | Recommended API | Effect on the active runtime |
|--------|-----------------|------------------------------|
| Host application (app boot) | `configureLogging({ ... })` | Installs the active `ConfiguredRuntime` — transports, redactor, sanitizer limits, level defaults, correlation hook. |
| Federated module (normal) | `createLogger({ module: { name, version } })` plus `child()` / `withContext()` for per-feature context | Reads the host's configured runtime via the package's internal active-runtime slot. Adds the module's identity to every event's `context.module`. No transport setup, no global listener, no network work. |
| Federated module (last-resort override) | `configureLogging({ ... })` | **Replaces** the host's active runtime through the same single named API. Last call wins. No warning is emitted because the call is always explicit — but this is a non-default pattern that MUST be coordinated with the host. |

### Why a module shouldn't call `configureLogging()` in normal operation

- **Hosts pick the transports.** A module that installs its own
  transports replaces the host's body-only beacon (or whatever) with
  whatever the module ships. If the module ships nothing, the host's
  events go silent — every existing logger reference in the host
  picks up the new active runtime at its next emission (FR-031).
- **Hosts pick the redactor.** A module that swaps the redactor
  replaces the host's project-specific extensions to the denylist.
  Sensitive host-side keys that were masked under the old rule set
  now leak through the new one.
- **Hosts pick the level defaults.** A module that sets `level:
  'debug'` flips on every other module's `debug`/`info` chatter,
  filling the host's transport budget.
- **Race conditions.** If two modules each call `configureLogging()`
  at module-load time, last-call-wins applies — but ordering depends
  on bundler load order, which a single module cannot guarantee. The
  result is non-deterministic from any one module's point of view.

### Early-module-config behavior (clarified 2026-05-27)

The package does NOT distinguish "host" from "module" at runtime. If
a module's `configureLogging()` call lands before the host's, the
module's runtime is active until the host runs. The host's later
call atomically replaces it (per FR-031). This is the
**first-call-installs, last-call-replaces** semantics resolved by
the `/speckit-clarify` session.

If a module needs visible local logging *during isolation
development* (e.g., Storybook, a component playground that has no
host), the conventional fix is the gated block from
`examples/federated-module/index.ts`:

```ts
if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
  configureLogging({
    application: { name: 'product-recs-standalone' },
    environment: 'development',
    level: 'debug',
    transports: [ConsoleTransport(), createBeaconTransport({ endpoint: '...', allowInsecureLoopback: true })],
  });
}
```

The gate is critical: this block MUST NOT ship to production where a
host will configure the runtime.

## Duplicate package copies

When module bundlers ship multiple physical copies of this package
on a single page (e.g., a host bundle and a federated module bundle
each include their own `node_modules/@your-org/frontend-logging-sdk`
build), the **classification this package commits to is isolated**.

### What "isolated" means

- Each physical copy owns an **independent** `ConfiguredRuntime`
  active-runtime slot (a closure-private `let active` in that copy's
  `runtime-ref.js`).
- The package stores no `globalThis` registry, no
  `Symbol.for('...')`-keyed singleton, no `window`/`document`-side
  channel that would let two copies discover each other.
- Each copy must be configured independently. Configuring copy A
  does not affect copy B.
- A logger created from copy A emits **only** through copy A's
  transports — never through copy B's. The two pipelines do not
  cross-route.
- This is the FR-033 contract, locked end-to-end by
  `tests/integration/duplicate-copy-isolation.integration.test.ts`
  (T064).

### Why the package does not provide a runtime sharing back door

A `globalThis` or `Symbol.for(...)` registry that automatically
collapsed duplicate copies into one runtime would be implicit and
silent. Every page that loaded two copies would be coupled through
package internals — a behavior that:
- Is impossible to disable when a consumer specifically wants
  isolation (security boundaries between modules, for example).
- Surprises consumers who expected each module to bring its own
  configuration.
- Couples the package's internal data shape to a public-ish channel
  (the global registry), making backwards-compatible changes harder.
- Cannot be reliably tested against the cross-copy versions that
  could land in production after a `package-lock.json` update.

The package's stance: cross-copy sharing is a **build-time** concern,
not a runtime one.

### Recommended sharing strategy: module-federation singleton

If your deployment requires a single shared runtime across the
host and every federated module on the page, **configure your
bundler's module-federation `shared` map to mark this package as a
singleton**. Webpack 5 example (lives in your application's build
config — not in this package):

```js
// webpack.config.js (host)
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');

module.exports = {
  // ...
  plugins: [
    new ModuleFederationPlugin({
      name: 'host',
      remotes: {
        product_recs: 'product_recs@https://cdn.example.com/recs/remoteEntry.js',
      },
      shared: {
        '@your-org/frontend-logging-sdk': {
          singleton: true,
          requiredVersion: '^1.0.0',
          eager: true,
        },
        // ... other shared deps
      },
    }),
  ],
};

// webpack.config.js (federated module — same `shared` block)
module.exports = {
  // ...
  plugins: [
    new ModuleFederationPlugin({
      name: 'product_recs',
      filename: 'remoteEntry.js',
      exposes: { './ProductRecs': './src/index.ts' },
      shared: {
        '@your-org/frontend-logging-sdk': {
          singleton: true,
          requiredVersion: '^1.0.0',
          // eager: false on the remote so the host wins the singleton race
        },
      },
    }),
  ],
};
```

With this build configuration, Webpack ensures both bundles
load the *same* copy of the package — so there is just one
`runtime-ref` slot on the page and one `configureLogging()` call
suffices.

Rollup, Vite, esbuild, and Turbopack have equivalent
module-federation primitives; the rule is the same: mark this
package as a shared singleton.

### Recommended consumer guidance to put in your federated-module
### documentation

Tell your module's consumers:

1. **The host owns logging configuration.** If you load this module
   on a page that has not configured logging, you will see no
   transport output (the lazy safe-defaults runtime auto-installs
   `NoopTransport`).
2. **If you want one runtime across host + this module**, configure
   your bundler's module-federation singleton sharing as above.
3. **If you accept separate runtimes**, each copy must be configured
   independently. The module's developer-mode block in
   `examples/federated-module/index.ts` shows how to do this in a
   way that is gated against shipping to production.

## Vendor neutrality

The **core** of this package has **zero observability-vendor runtime
dependencies**. Installing the package does not pull in any
OpenTelemetry, Datadog, or Sentry SDK; the built `dist/index.{mjs,
cjs}` does not import any of them.

### What that means in practice

- The default emit path goes `Logger handle → security pipeline
  (LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor →
  ControlCharGuard → Freeze(dev)) → dispatcher → SafeTransport[]`.
  There is no privileged vendor SDK between the dispatcher and the
  transports.
- Built `dist/index.d.ts` contains no vendor-specific identifier
  (`SeverityNumber`, `LoggerProvider`, `Span`, `Tracer*`, `Exporter`,
  `Processor`, `Hub`, etc.) — locked by
  `tests/security/bundle-shape.security.test.ts` (T049).
- `package.json` `dependencies` carries no `@opentelemetry/*`,
  `@datadog/*` / `dd-rum`, `@sentry/*`, or other observability-
  vendor packages — locked by the dependency-pins audit (T070).
- The package's only delivery primitive is the `Transport`
  interface. Consumers either use the first-party
  `createBeaconTransport` from
  `@your-org/frontend-logging-sdk/transport-beacon` or implement
  their own transport against the documented contract; the
  package never makes vendor-specific choices on the consumer's
  behalf.

### Future vendor adapters are peers, not defaults

OpenTelemetry, Datadog, Sentry, and any other observability vendor
the project chooses to integrate later are **future optional
transport adapters**. Each one will ship as either:

- A separate subpath export on this package (e.g., `/otel`,
  `/datadog`, `/sentry`), or — more likely for vendor SDKs with
  significant dependency weight —
- A separately-published companion package the consumer can install
  independently.

Each adapter will have its own per-adapter bundle/performance
budget defined in its own plan, separate from the core's ≤15 KB
target. No adapter will be the "default"; the consumer picks by
passing the adapter's `Transport` in `LoggerConfig.transports`. No
adapter will be allowed to weaken the security pipeline upstream of
the transport boundary — sanitization and redaction will continue
to run before any transport (including a vendor adapter) sees an
event.

### Why this matters for federated deployments

A federated module written by a team that prefers Datadog can ship
its own Datadog-based `Transport` and pass it through the host's
configuration *only with the host's coordination* — because the
host owns `configureLogging()`. The core never picks a vendor on
the host's behalf, so module teams can recommend transports without
the package pre-committing the host to anything.

## Documented drops, transforms, and bounded behavior

Constitution Principle VI requires that any behavior that **drops**,
**transforms**, or **bounds** an event before delivery be documented
so downstream monitoring and forensics can account for it. The
complete enumeration:

### Drops (event never reaches any transport)

| Behavior | Trigger | Diagnostic |
|----------|---------|-----------|
| **Level filter drop** | The call's `LogLevel` is below the resolved minimum (per-logger override → root config level → `LevelMap[environment]` → env default → `warn` fallback). | None — filtered events incur no allocation and no diagnostic. |
| **Fail-closed redactor drop** | The configured redactor throws OR returns a value that is neither a `LogEvent` nor `null`. | One `onInternalError(PackageError('redactor_failed', …))` per affected event. |
| **Explicit null return** | The configured redactor returns `null` to drop the event intentionally. | None — null return is a documented, silent drop. |
| **Sanitizer pathological-input collapse** | A value whose access throws (Proxy traps, getter explosions) is reduced to `"[Unserializable]"` instead of dropping the event. | None — the sanitizer never drops; it always coerces. |

### Transforms (event reaches the transport, but values are altered)

| Behavior | Trigger | Output |
|----------|---------|--------|
| **Sanitizer depth cap** | A value is nested deeper than `maxDepth` (default 8). | The value at the boundary is replaced with `"[MaxDepth]"`. |
| **Sanitizer string truncation** | A string is longer than `maxStringLength` (default 8192). | Truncated to `maxStringLength` chars and suffixed with `"...[truncated]"`. |
| **Sanitizer array truncation** | An array has more than `maxArrayLength` elements (default 1000). | First `maxArrayLength` elements kept; appended `"[Truncated: <N> elements omitted]"` marker. |
| **Sanitizer attribute-count truncation** | The cumulative key count across the whole event exceeds `maxAttributeCount` (default 256). | First `maxAttributeCount` keys kept; one top-level `"__truncated__": "[Truncated: <N> keys omitted]"` marker is attached to the event's attributes. |
| **Sanitizer cycle collapse** | A reference cycle is detected during the walk. | The cyclic reference becomes `"[Circular]"`. |
| **Sanitizer type-tag** | A class instance / DOM node / framework object (`Event`, `Promise`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Request`, `Response`, `Blob`, `FormData`, `URL`, …) is encountered. | Replaced with `"[<TypeTag>]"` (e.g., `"[Element:div]"`, `"[Event:click]"`, `"[Map]"`, `"[<ConstructorName>]"`). Sanitizer never recurses into class instances or DOM/framework objects; getters are never invoked. |
| **Sanitizer primitive coercion** | `NaN`, `Infinity`, or `-Infinity` in a number-typed attribute. | Coerced to `null`. |
| **Sanitizer primitive coercion** | `bigint` value. | Coerced to its `String(value)` representation. |
| **Sanitizer primitive coercion** | `Date` value. | Coerced to its `.toISOString()` representation; Invalid Date becomes `null`. |
| **Sanitizer primitive coercion** | `function` / `symbol` value. | Coerced to `"[Function]"` / `"[Symbol]"`. |
| **Sanitizer undefined handling** | `undefined` value at a top-level attribute key. | The key is dropped (not present in the delivered event). |
| **Sanitizer undefined handling** | `undefined` value inside an array. | Replaced with `null`. |
| **URL scrubber query/fragment replacement** | A query or fragment parameter on an http(s) URL has a name in the default denylist (`token`/`password`/`authorization`/etc.) or in `ScrubUrlOptions.extraParams`. | The parameter's VALUE is replaced with `[REDACTED]` (URL-encoded). The parameter NAME is preserved so downstream observers see "this URL carried a `token` param that got scrubbed". Non-http(s) URLs are returned unchanged. |
| **Redactor key match** | A leaf or container value sits under a property name that matches a default key rule (`password`/`passwd`/`token`-family/`authorization`/`auth`/`cookie`/`set-cookie`/`secret`/`api_key`/`session_id`/`sid`/`ssn`/`credit_card`/`cardNumber`/`cvv`) or a consumer-supplied rule. | The ENTIRE value at that key is replaced with `[REDACTED]` (or the rule's `replacement`). The redactor never recurses into a value whose key matched. |
| **Redactor shape match** | A leaf string value matches a default shape rule (JWT three-part dot-separated form; `^Bearer\s+…$`) or a consumer-supplied shape rule. | Replaced with `[REDACTED]` (or the rule's `replacement`). |
| **Control-character escape** | Any string in `event.message`, `event.attributes`, `event.context.attributes`, or `event.error.{name,message,stack}` contains U+0000–U+0008, U+000B–U+000C, U+000E–U+001F, U+2028, or U+2029. | Each targeted code point is replaced with its `\uXXXX` six-character form. `\t` (U+0009), `\n` (U+000A), `\r` (U+000D) are preserved by design. |
| **Dev-build freeze** | The package is built/run with `__DEV__=true` (default for `tsup`'s dev build and the test suite). | The post-pipeline event is recursively `Object.freeze`d so a misbehaving transport cannot mutate it. In production builds (`__DEV__=false`) the freeze body is dead-code-eliminated; events are NOT frozen — transports are still expected to treat them as immutable per the contract. |

### Bounded behaviors (not exactly a transform, but a documented constraint)

| Behavior | Bound | Trigger |
|----------|-------|---------|
| **Sanitizer-limit clamp on configure** | `sanitizerLimits` values above documented Max clamp to Max; below Min clamp to Min. | Configuration time only. One `onInternalError(PackageError('sanitizer_limit_clamped', …))` per clamped key per `configureLogging()` call. |
| **`NoopTransport` swallowing** | `NoopTransport` is auto-installed when `transports` is `undefined` or `[]`. | At `configureLogging()` time. Events flow through the pipeline normally; the `NoopTransport.send()` accepts and discards each event silently. One `onInternalError(PackageError('no_transport_configured', …))` notice fires when `environment === 'production'`. |
| **`SafeTransport` per-transport notice budget** | One `onInternalError` notice per failing transport per session (no log spam). | First failure (sync throw, rejected Promise, or `flush`/`shutdown` throw). Subsequent failures from the same transport are silent. |
| **Bus-vs-quiet defaults** | In `production` and the unknown-environment fallback, `debug` and `info` are dropped by default. | Per the env-default level table in `contracts/logger-config.md`. |

### Things the package does NOT do (in v1)

These are NOT bugs; they are documented non-features:

- **No batching.** Every accepted event reaches every configured
  transport before `Logger.<level>()` returns. Transports MAY batch
  internally (e.g., a `flush()`-based beacon transport), but the
  package itself does no queueing.
- **No sampling.** Every accepted event is delivered. Consumers who
  want sampling implement it inside a custom transport.
- **No deduplication.** Two identical emissions produce two transport
  calls.
- **No reordering.** Per-emission ordering is preserved; the dispatcher
  iterates `runtime.transports` sequentially for each event.
- **No retry.** A failing transport's events are not re-queued. If
  delivery is critical, the transport itself owns retry/persistence
  semantics.
- **No ambient browser state.** The package never reads
  `process.env`, `import.meta.env`, `location`, `document.cookie`,
  `localStorage`, `sessionStorage`, or `navigator.*` to populate
  context. Pass `environment` and any context attributes explicitly
  via `configureLogging({ environment, context, correlation })`.

If any of these change in a future version, the change WILL be
documented in this section per Principle VI.

## Diagnostics

Internal failures (transport errors, redactor errors, sanitizer-limit
clamps, missing-transport notices) are silent by default. Opt in:

```ts
configureLogging({
  onInternalError: (err) => {
    // Forward to your error-reporting system.
    // `err` is an Error with a `code: PackageErrorCode` field
    // (one of: 'transport_send_failed', 'transport_init_failed',
    // 'transport_shutdown_failed', 'redactor_failed',
    // 'correlation_failed', 'backend_init_failed',
    // 'backend_handle_failed', 'sanitizer_limit_clamped',
    // 'no_transport_configured'). The `code` is part of the
    // diagnostic contract — stable across versions.
    myErrorReporter.report({ scope: 'frontend-logging', err });
  },
});
```

Diagnostic ordering rules:

- **One notice per failing transport per session.** A throwing or
  rejecting transport produces at most one notice; subsequent failures
  from the same transport are silent. This is the no-log-spam
  guarantee.
- **One notice per clamped sanitizer-limit key per `configureLogging()`
  call.** Re-calling `configureLogging()` with new limits resets the
  counter.
- **One `correlation_failed` notice per failing `correlation()`
  call** — the contract is per-event, not per-session, because
  correlation hooks can be intermittently faulty in ways the package
  cannot diagnose.
- **At most one `no_transport_configured` notice per session** when
  the empty-transports default fires in `production`.

The `onInternalError` callback itself is wrapped in a try/catch. A
throwing diagnostic hook cannot crash the host app.
