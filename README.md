# @your-org/frontend-logging-sdk

A reusable browser-first structured logging package for web applications,
including federated host/module architectures.

> **Status**: in development. US1 is functional end-to-end (public API,
> level filtering, pluggable transports, failure isolation). US3
> (sanitization, redaction, URL scrubbing, control-char escaping) lands
> in Phase 5; until then the security pipeline stages are documented
> pass-through stubs. See `specs/001-structured-logging-core/tasks.md`.

## What this package gives you

- A stable public `Logger` API (`debug | info | warn | error`) with structured
  attributes.
- Production-safe defaults: `warn` and `error` are the baseline; `debug` and
  `info` are opt-in.
- A pluggable transport boundary — bring your own HTTP/beacon/file delivery.
- Secure-by-default sanitization and redaction applied **before** any transport
  sees an event _(US3, Phase 5)_.
- Failure isolation: a misbehaving transport never breaks the host app.

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
npm install @your-org/frontend-logging-sdk
```

## Quickstart

```ts
import {
  configureLogging,
  createLogger,
  ConsoleTransport,
} from '@your-org/frontend-logging-sdk';

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

The plan and `docs/safe-logging.md` cover the full enumeration of `DO`/
`DON'T` patterns, the sanitizer's bounded-input rules, the redactor's
default denylist, `scrubUrl()` usage, and every behavior that drops or
transforms events.

## Examples

- `examples/host-app/` — single-app consumer
- `examples/federated-module/` — federated module consumer

Both share a canonical body-only beacon transport at
`examples/shared/beacon-transport.ts` (created in T029).

## Where to learn more

- `specs/001-structured-logging-core/spec.md` — feature specification
- `specs/001-structured-logging-core/plan.md` — implementation plan
- `specs/001-structured-logging-core/contracts/` — public API, transport,
  log-event, logger-config, failure-safety, redaction, sanitization contracts
- `specs/001-structured-logging-core/quickstart.md` — consumer onboarding tour
- `.specify/memory/constitution.md` — governing principles (v1.1.0)
