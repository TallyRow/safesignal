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
  transports: [ConsoleTransport()],    // optional in dev; required for any real delivery
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

## Use in a federated module

A federated module attaches its own `module` identity so its events stay
distinguishable from host events:

```ts
import { createLogger } from '@your-org/frontend-logging-sdk';

const moduleLog = createLogger({
  module: { name: 'product-recommendations', version: '0.4.2' },
});

moduleLog.info('recommendations rendered', { count: 6 });
```

The host and module use the same package contract; events differ only by
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
      traceId: window.__currentTraceId,    // your tracing of choice
      route:    location.pathname,
    },
  }),
});
```

`correlation()` runs on every emit. Keep it cheap.

## Bring your own transport

A transport is any object matching the documented `Transport` interface. Below
is a minimal HTTP transport using `navigator.sendBeacon`:

```ts
import {
  configureLogging,
  type Transport,
  type LogEvent,
} from '@your-org/frontend-logging-sdk';

const httpTransport: Transport = {
  name: 'http',
  send(event: LogEvent) {
    const body = JSON.stringify(event);
    navigator.sendBeacon('/_ingest/logs', body);
  },
};

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  transports: [httpTransport],
});
```

If your transport throws or rejects, the package isolates the failure and the
emit site is unaffected.

## Redaction

A default redactor masks common sensitive keys (`password`, `token`,
`authorization`, `cookie`, `secret`, `apiKey`, `sessionId`, etc.) in
attributes and context. To customize:

```ts
import { configureLogging, createRedactor } from '@your-org/frontend-logging-sdk';

configureLogging({
  redactor: createRedactor([
    { key: /email/i, replacement: '[email]' },
    { key: 'phone' },                 // uses default '[REDACTED]'
  ]),
});
```

If you provide your own `Redactor` function, you replace the default entirely.
A redactor that throws causes the event to be dropped (fail-closed).

## Diagnostics

Internal failures (transport errors, init failures) are silent by default. Opt
in with:

```ts
configureLogging({
  onInternalError: (err) => {
    // your error reporting
  },
});
```

The hook fires at most once per failing transport per session.

## What the package does NOT do (in v1)

- Ship an HTTP/OTLP transport. Implement `Transport` yourself.
- Read `process.env.NODE_ENV` or `import.meta.env`. Pass `environment` explicitly.
- Install global listeners or singletons. Each loaded copy is self-contained.
- Persist events. All transport buffering is in-memory and transport-defined.

## Where to learn more

- `contracts/public-api.md` — exact public surface
- `contracts/log-event.md` — shape and sanitization rules of every emitted event
- `contracts/transport.md` — transport interface and isolation guarantees
- `contracts/failure-safety.md` — what happens when things go wrong
- `contracts/logger-config.md` — configuration and environment behavior
