# Subpaths

SafeSignal ships a small core entry point. Every subpath is **opt-in** — import
only what you need, and your bundler tree-shakes the rest. Each subpath routes
through the same secure pipeline (sanitization → redaction → transport) as any log.

## Transport: Beacon (`./transport-beacon`)

Body-only HTTPS delivery via `navigator.sendBeacon` with `fetch`+`keepalive`
fallback. Satisfies the [T-S1..T-S5 transport security contract](../contracts/transport.md)
by construction.

```ts
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

const transport = createBeaconTransport({
  endpoint: 'https://logs.example.com/ingest',
  onInternalError: (err) => myReporter.captureException(err),
});
```

**Behavior:**
- Refuses non-HTTPS endpoints at construction time (loopback dev endpoints opt
  in via `allowInsecureLoopback: true`).
- Prefers `navigator.sendBeacon`; falls back once to `fetch` with
  `keepalive: true` and `credentials: 'same-origin'`.
- Installs a single `pagehide` listener lazily on first `send()`; removes it on
  `shutdown()`.
- Supports opt-in batching for high-volume pages (`maxBatchSize × per-event-size
  < 64 KiB`). See [`safe-logging.md`](safe-logging.md#beacon-transport-batching-opt-in).

**Error codes:** `oversized_event`, `transport_send_failed`, `beacon_batch_drop`,
`beacon_unavailable`, `transport_shutdown_failed`. Wire `onInternalError` to
**both** the transport and `configureLogging()` for full coverage.

## Transport: OTLP (`./transport-otlp`)

Delivers events to **any OTLP-compatible backend** (Datadog, Honeycomb, Grafana,
OpenTelemetry Collector, ClickHouse, …) as standard OTLP/HTTP+JSON logs. Zero
new runtime dependencies — no `@opentelemetry/*` in the bundle.

```ts
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

const transport = createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  headers: { 'x-api-key': process.env.OTLP_API_KEY! },
  batching: { maxBatchSize: 20, maxBatchAgeMs: 5000 },
});
```

**Guarantees:**
- **OTLP/HTTP+JSON** `LogRecord`s with application/module/environment identity
  mapped to the OTLP `Resource` (`service.name`, `service.version`,
  `deployment.environment`; `module.*` per-record). Levels map to OTLP severity
  (`debug`→5, `info`→9, `warn`→13, `error`→17).
- **Fail-safe**: `fetch` with `keepalive` delivery, **no retry** — a down/slow/
  erroring backend never throws into your code and never breaks the page.
- **Secure**: events are already redacted before the transport sees them; auth
  headers are sent only on the request and never appear in payloads, diagnostics,
  or the bundle. HTTPS-only (loopback `http://` requires explicit
  `allowInsecureLoopback`).
- **Federated**: configured once at the runtime level; host owns it, federated
  modules do not replace it. Duplicate package copies are **isolated**.

**Error codes:** `oversized_event`, `buffer_overflow`, `delivery_unavailable`,
`send_failed`, `partial_rejection`, `serialize_failed`, `shutdown_failed`.

### Protobuf encoding (opt-in)

Add `encoding: 'protobuf'` to switch from JSON to OTLP protobuf binary —
30–60% smaller payloads, wider collector compatibility. Hand-built,
zero-dependency, same endpoint/auth/batching surface.

```ts
const transport = createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  headers: { 'x-api-key': process.env.OTLP_API_KEY! },
  encoding: 'protobuf',
  batching: { maxBatchSize: 20 },
});
```

## W3C Trace Context

SafeSignal is **carry-only** — it never mints trace IDs. Supply a W3C Trace
Context and it carries `trace_id` / `span_id` on every event; when shipped
via `./transport-otlp`, they populate the OTLP `LogRecord`'s standard
`traceId` / `spanId` / `flags` fields.

```ts
import { configureLogging, getRootLogger, parseTraceparent } from '@tallyrow/safesignal';

const trace = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  context: trace ? { trace } : {},
  // Or dynamically, per emit, from your tracer's active span:
  correlation: () => {
    const s = myTracer.activeSpan();
    return s ? { trace: { traceId: s.traceId, spanId: s.spanId, traceFlags: 1 } } : {};
  },
});
```

**Guarantees:**
- **Carry-only / fail-safe**: no supplied context ⇒ no trace fields; a malformed
  `traceparent`, wrong-length/all-zero id, or oversized `tracestate` is dropped
  fail-closed — the event still ships, no throw.
- **Secure**: trace ids are identifiers, not secrets; `tracestate` is bounded;
  existing redaction is unaffected.
- **Vendor-neutral**: pure W3C — works with any tracer; the `./transport-otlp`
  bundle stays `@opentelemetry`-free.

### Tag delivery requests with `traceparent`

The `./transport-otlp` transport can also set a W3C `traceparent` (and
`tracestate`) **request header** on the delivery request. **Off by default** —
opt in per transport with `injectTraceparent: true`. A delivery request carries
the header **only when every event in the flushed batch shares one valid trace
context**; a mixed-trace, trace-less, or empty batch sends no header. Only
`./transport-otlp` supports it — `navigator.sendBeacon` cannot set custom
request headers.

## Global Error Capture (`./capture`)

Uncaught exceptions and unhandled promise rejections normally vanish — they never
reach your configured transports. The opt-in `./capture` subpath lets a **host**
route them through the same secure pipeline as every other log.

```ts
import { installGlobalErrorCapture } from '@tallyrow/safesignal/capture';

// Host installs once — returns a disposer.
const dispose = installGlobalErrorCapture(getRootLogger());
```

It emits an `error`-level event (`'Uncaught exception'` /
`'Unhandled promise rejection'`) carrying the serialized error and
`safesignal.source` / `safesignal.errorType` markers, redacted + sanitized
like any log.

**Guarantees:**
- **Host-owned, opt-in** (Principle VIII): never a side effect of
  `createLogger()`; a **federated module never installs it** — only the host
  that owns the runtime does.
- **Fail-safe** (Principle III): never throws into the page and never breaks
  rendering/navigation; a failing transport is swallowed to `onInternalError`.
- **Additive**: chains via `addEventListener` — your existing
  `window.onerror`/handlers keep firing; never `preventDefault()`s.
- **Errors only**: no view tracking, web vitals, or network instrumentation
  (RUM — out of scope). Duplicate package copies are **isolated**.

## React Error Boundary (`./framework-react`)

When a React component throws during render, the default outcome is a blank
screen and an error that never reaches your transports. The opt-in
`./framework-react` subpath is the **no-globals, per-component** counterpart to
`./capture`. `react` is a **peer dependency** (`>=16.8`).

```tsx
import { LoggerProvider, LogErrorBoundary, useLogError }
  from '@tallyrow/safesignal/framework-react';

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
'react-error-boundary'`. For errors a boundary **cannot** catch — event handlers,
async/`Promise` callbacks, effects — use the `useLogError()` hook.

**Guarantees:**
- **No globals** (Principle VIII): patches nothing, attaches no `window`
  listeners — the explicit contrast with `./capture`.
- **Fail-safe** (Principle III): a logging (or `onError`) failure is swallowed
  and the fallback still renders.
- **Fail-closed** (Principle V): errors route through the same redaction pipeline
  as any log.
- **Explicit logger**: via `<LoggerProvider>`, `logger` prop, or
  `useLogError(logger)` argument. With no logger resolvable, helpers are a
  **safe no-op**. Duplicate package copies are **isolated**.

## Vue Error Handler (`./framework-vue`)

The Vue 3 counterpart to `./framework-react`. Routes Vue component-tree errors
through your existing `Logger`. `vue` is a **peer dependency** (`>=3.0`).

```ts
import { safesignalErrorHandler } from '@tallyrow/safesignal/framework-vue';

createApp(App)
  .use(safesignalErrorHandler, { logger: log })
  .mount('#app');
```

A framework error emits an `error`-level event (`'Vue error'`) carrying the
serialized error and best-effort Vue context (`safesignal.vue.info`,
`safesignal.vue.componentName`), with `safesignal.source: 'vue-error-handler'`.
To wire it yourself: `app.config.errorHandler = createErrorHandler(log)`.

For errors Vue's handler can't catch (async/`try`-`catch`, native listeners),
use `useLogError()`; to contain and recover a subtree, use `useErrorCapture()`.

**Guarantees:**
- **No globals** (Principle VIII): patches nothing, attaches no `window` listeners.
- **Fail-safe** (Principle III): a logging (or `onError`) failure is swallowed
  and the app keeps running; no error loop.
- **Fail-closed** (Principle V): errors route through the same redaction pipeline.
- **Explicit logger**: via the plugin, `useLogError(logger)`, or
  `useErrorCapture({ logger })`. With no logger resolvable, helpers are a
  **safe no-op**. Duplicate package copies are **isolated**.

## Readable Error Stacks (`./stacks`)

A raw browser error stack is a wall of minified, framework-internal noise. The
opt-in `./stacks` subpath parses an error's stack into **trimmed, structured
frames** (function / file / line / column), and — when you supply a synchronous
source-map resolver — maps minified production frames back to original source
positions. **Off by default.**

```ts
import { createStackNormalizer } from '@tallyrow/safesignal/stacks';

const resolver = (f) => mySourceMaps.lookup(f.file, f.line, f.column) ?? null;

configureLogging({
  // …
  normalizeStack: createStackNormalizer({ resolver, maxFrames: 30 }),
});
```

The delivered **error** event gains `attributes['safesignal.stack']` — an ordered
array of `{ function?, file?, line?, column?, original? }` (the raw `error.stack`
string is preserved unchanged). Other events are untouched.

**Guarantees:**
- **Trimmed**: `node_modules`, engine-internal, and boilerplate frames are
  removed by default; bounded to `maxFrames` (default 30, max 100).
- **Source-mapped**: with a synchronous `resolver`, resolvable frames carry
  `original`. SafeSignal does **no** async work or `.map` fetching — you load
  your maps; SafeSignal calls a fast sync lookup.
- **Safe**: frames ride in `attributes`, so a secret in a frame URL's query is
  scrubbed by the pipeline. Off by default, fail-safe, runtime-level (no
  per-`Logger` cost), **no new dependency**.

## Error Breadcrumbs

When an error is logged, the hardest debugging question is "what happened *just
before* this?" Enable **opt-in error breadcrumbs** and every error log
automatically carries a bounded trail of the most recent events plus the error's
cause chain. **Off by default.**

```ts
configureLogging({
  // …
  breadcrumbs: true,  // or { maxEvents: 30 } — default 20, max 100
});
```

The delivered **error** event gains two documented, machine-parseable attribute
fields (other events are untouched):
- `attributes['safesignal.breadcrumbs']` — the recent events, oldest→newest,
  each `{ ts, level, message, app?, module?, attributes? }`.
- `attributes['safesignal.errorCauses']` — the error's nested cause chain,
  outermost→root, each `{ name, message }`.

**Guarantees:**
- **Bounded & cheap**: a single runtime-level ring buffer — constant memory
  (≤ `maxEvents`), constant-cost recording, **no** per-`Logger` cost.
- **Safe**: breadcrumbs carry only the post-redaction event; the cause chain
  runs through the same redaction. Never mutates other events, never throws
  into the page. Duplicate package copies are **isolated**.

## Dev Console (`./dev-console`)

A pretty, **development-only** console renderer. Renders the *same* already
sanitized + redacted event as a collapsed, level-styled group. Select it only
in development so your bundler tree-shakes it out of production entirely.

```ts
import { DevConsoleTransport } from '@tallyrow/safesignal/dev-console';

configureLogging({
  transports: [
    import.meta.env.DEV
      ? DevConsoleTransport({ traceUrl: ({ traceId }) => `https://trace.example/${traceId}` })
      : ConsoleTransport(),
  ],
});
```

**Guarantees:**
- **Genuine zero production cost**: the dev branch is dead-code-eliminated from
  your production build, so the renderer ships **0 bytes** there.
- **Runtime-gated + defensive**: renders pretty only when the event's
  `environment === 'development'`; in any other environment — or where rich
  console features are absent — it behaves exactly like `ConsoleTransport`.
- **Structured-only & safe**: renders only the post-pipeline event, attaches
  **no** globals, reads no ambient state, and never throws into the page.

## Testing (`./testing`)

Ships `assertTransportContract` — a contract-test helper that runs T-S1..T-S5
against any consumer-supplied transport. Use it in your own test suite, not in
production code.

```ts
import { assertTransportContract } from '@tallyrow/safesignal/testing';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

test('my transport satisfies the security contract', async () => {
  await assertTransportContract(
    createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  );
});
```

The helper intercepts `globalThis.fetch` and `navigator.sendBeacon` for the
duration of each check and asserts the bad-shapes that T-S1..T-S5 forbid. It
throws on the first violation with a diagnostic message naming the failing
clause.

## Level Configuration

In `production`, `debug` and `info` are dropped by default. Raise the threshold
per environment:

```ts
configureLogging({
  environment: 'production',
  level: { production: 'info', development: 'debug', test: 'warn' },
  transports: [ConsoleTransport()],
});
```

## Federated / Module-Federation Deployments

The host application owns `configureLogging()` by convention; federated modules
call `createLogger({ module })` against the host's already-configured runtime.

Duplicate physical copies of the package on a page are **isolated** by design —
each copy maintains its own runtime, with no `globalThis` registry — and
consumers who want cross-copy sharing configure their bundler's
module-federation singleton.

Full federated story: [`safe-logging.md`](safe-logging.md) — "Configuration
ownership in federated deployments", "Duplicate package copies", and "Vendor
neutrality".
