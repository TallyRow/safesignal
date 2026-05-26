# Quickstart: Frontend Logging SDK

A short tour of the public API. Every example below uses ONLY the package's
public exports. The package's internal OpenTelemetry usage is invisible.

## Install

```bash
npm install @your-org/frontend-logging-sdk
```

## Configure once, log everywhere

```ts
import {
  configureLogging,
  createLogger,
  ConsoleTransport,
} from '@your-org/frontend-logging-sdk';

configureLogging({
  application: { name: 'checkout-web', version: '2025.05.0' },
  environment: 'production',           // 'production' | 'development' | 'test' | string
  transports: [ConsoleTransport()],
});

const log = createLogger();
log.info('checkout opened', { cartItems: 3 });
log.warn('coupon rejected', { code: 'SUMMER25', reason: 'expired' });
log.error('payment failed', { provider: 'acme-pay' }, new Error('declined'));
```

In `production`, `debug` and `info` are dropped by default. Override per
environment:

```ts
configureLogging({
  level: { production: 'info', development: 'debug', test: 'warn' },
});
```

## Logging safely

The package is **secure by default**. Before you ship anything, read this
section.

### DO

```ts
// Structured fields, intentional values, message as a fixed string.
log.info('order placed', {
  orderId: order.id,
  total:   order.total,
  currency: order.currency,
});

log.warn('payment declined', { reason: 'insufficient_funds', code: 'PD-12' });
```

### DON'T

```ts
// 1. Don't dump whole objects — the sanitizer will type-tag class
//    instances, so this won't even produce useful data, and you risk
//    pulling in fields you didn't mean to log.
log.info('order placed', { order });

// 2. Don't interpolate untrusted values into the message — use attributes.
log.info(`order placed by ${user.email}`);   // BAD
log.info('order placed', { userId: user.id }); // GOOD

// 3. Don't pass DOM nodes, Events, Promises, or full state.
log.error('click handler failed', { event });  // event → "[Event:click]"
log.error('reducer failed', { state });        // state may include tokens

// 4. Don't put secrets in URL query strings, and don't log raw URLs that
//    might. Use scrubUrl().
import { scrubUrl } from '@your-org/frontend-logging-sdk';
log.info('redirected', { to: scrubUrl(window.location.href) });
```

### What the package does for you automatically

- **Sanitizes** every attribute and context value: depth ≤ 8, strings ≤ 8192
  chars, arrays ≤ 1000 elements, ≤ 256 total keys per event. Class
  instances, DOM nodes, `Event`, `Promise`, `Map`, `Request`, etc. are
  reduced to type tags — never recursed.
- **Redacts** values for common sensitive keys (`password`, `token`,
  `authorization`, `cookie`, `secret`, `apiKey`, `sessionId`, `ssn`,
  `creditCard`, ...) anywhere in the event tree.
- **Scrubs** URL query/fragment params with sensitive names from any URL-
  shaped string value.
- **Detects** common credential shapes (JWT, Bearer tokens) regardless of
  key name and masks them.
- **Escapes** control characters and line separators in strings so
  user-controlled newlines can't forge log records downstream.
- **Drops** events whose redactor throws (fail-closed) — never partial
  emission.

You can customize:

```ts
import { configureLogging, createRedactor } from '@your-org/frontend-logging-sdk';

configureLogging({
  redactor: createRedactor([
    { key: /email/i, replacement: '[email]' },
    { key: 'phone' },
    { key: /internal[_-]?secret/i },
  ]),
  // tighter limits, e.g. for a memory-constrained host
  sanitizerLimits: { maxDepth: 4, maxStringLength: 2048 },
});
```

If you provide your own `redactor`, it **replaces** the default. To compose:

```ts
const base = createRedactor();
const extra = createRedactor([{ key: /internal[_-]?secret/i }]);
configureLogging({
  redactor: (event) => {
    const after = base(event);
    return after === null ? null : extra(after);
  },
});
```

## Use in a federated module

```ts
import { createLogger } from '@your-org/frontend-logging-sdk';

const moduleLog = createLogger({
  module: { name: 'product-recommendations', version: '0.4.2' },
});

moduleLog.info('recommendations rendered', { count: 6 });
```

Host and module share one package contract; events differ only by
`context.module.name`.

## Child loggers

```ts
const log = createLogger();
const requestLog = log.child({ attributes: { requestId: 'r-92f1' } });

requestLog.info('fetching cart');  // includes requestId on every emit
```

## Dynamic correlation

```ts
configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  transports: [ConsoleTransport()],
  correlation: () => ({
    attributes: {
      traceId: window.__currentTraceId,
      route:    location.pathname,
    },
  }),
});
```

`correlation()` runs on every emit. Keep it cheap and synchronous. If it
throws, its output is dropped for that event; the event still emits.

## Bring your own transport

A transport is any object matching the documented `Transport` interface. The
package contract requires you to send events in the **request body**, never
in a URL. Here is a minimal beacon transport:

```ts
import {
  configureLogging,
  type Transport,
  type LogEvent,
} from '@your-org/frontend-logging-sdk';

const beaconTransport: Transport = {
  name: 'beacon',
  send(event: LogEvent) {
    const body = new Blob([JSON.stringify(event)], { type: 'application/json' });
    // POST body — never put events in the URL query
    navigator.sendBeacon('https://logs.example.com/ingest', body);
  },
};

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  transports: [beaconTransport],
});
```

If your transport throws or rejects, the package isolates the failure and
the emit site is unaffected. Other transports still receive the event.

### Validating your transport

```ts
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';

await assertTransportContract(beaconTransport);
// Throws if your transport puts data in URLs, uses HTTP instead of HTTPS
// cross-origin, mutates events, or has non-idempotent flush/shutdown.
```

## Diagnostics

Internal failures (transport errors, init failures, redactor errors,
sanitizer-limit clamps) are silent by default. Opt in:

```ts
configureLogging({
  onInternalError: (err) => {
    // your error reporting
  },
});
```

The hook fires at most once per failing transport per session, and once
per `configureLogging()` call for limit-clamp warnings.

## What the package does NOT do (in v1)

- Ship an HTTP/beacon transport in the runtime. Implement `Transport`
  yourself; use body delivery only.
- Read `process.env.NODE_ENV`, `import.meta.env`, `location`, or
  `document.cookie`. Pass `environment` explicitly.
- Install global listeners or singletons. Each loaded copy is
  self-contained.
- Persist events. All transport buffering is in-memory and
  transport-defined.
- Batch, sample, or deduplicate events. Every accepted event reaches every
  configured transport.

## Where to learn more

- `contracts/public-api.md` — exact public surface
- `contracts/log-event.md` — shape and sanitization summary of every emitted event
- `contracts/sanitization.md` — full sanitization rules and bounds
- `contracts/redaction.md` — default denylist and redaction rules
- `contracts/transport.md` — transport interface and security requirements
- `contracts/failure-safety.md` — what happens when things go wrong
- `contracts/logger-config.md` — configuration and environment behavior
