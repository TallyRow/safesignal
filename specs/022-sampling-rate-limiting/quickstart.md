# Quickstart: Sampling / Rate-Limiting

**Feature**: 022-sampling-rate-limiting
**Date**: 2026-06-07

## Head-Based Sampling (Config-Level)

```ts
import { configureLogging, createLogger, ConsoleTransport } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web', version: '2025.06.0' },
  environment: 'production',
  transports: [ConsoleTransport()],
  sampling: {
    type: 'head',
    rate: 0.1, // Ship 10% of events
    onDrop: (drop) => {
      // drop.level, drop.message, drop.timestamp, drop.reason, drop.samplerName
      console.debug('sampled out', drop);
    },
  },
});

const log = createLogger();
log.info('order placed', { orderId: 'abc' });
// ~10% chance this event reaches the console transport
```

## Rate-Limit Sampling (Config-Level)

```ts
configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  transports: [ConsoleTransport()],
  sampling: {
    type: 'rateLimit',
    rate: 10, // Max 10 events/second
    onDrop: (drop) => {
      console.debug('rate limited', drop);
    },
  },
});
```

## Transport-Level Wrapping (Advanced)

```ts
import { HeadSampler, ConsoleTransport } from '@tallyrow/safesignal';

const sampled = HeadSampler({
  transport: ConsoleTransport(),
  rate: 0.25,
  onDrop: (drop) => console.debug('dropped', drop),
});

configureLogging({
  transports: [sampled],
});
```

## Per-Transport Override

```ts
configureLogging({
  sampling: {
    type: 'head',
    rate: 0.1,
    onDrop: (drop) => metrics.increment('logs.dropped', { reason: drop.reason }),
  },
  transports: [
    ConsoleTransport(), // Samples at 10% (global default)
    {
      transport: BeaconTransport({ url: '/log' }),
      sampling: false, // Opt out — ship 100% to this backend
    },
    {
      transport: OtlpTransport({ endpoint: '...' }),
      sampling: { type: 'rateLimit', rate: 50, onDrop: myOtlpDropHandler }, // Override
    },
  ],
});
```

## What Happens When...

**You don't configure sampling?** Nothing — all events pass through to all
transports. Zero overhead. Sampling is off by default.

**You forget `onDrop`?** `configureLogging()` throws with a clear error:
`"sampling.onDrop is required — no silent drops"`.

**The sampler breaks?** The event passes through to the transport (fail-open).
Better to ship an event than silently swallow it.

**The `onDrop` callback throws?** The error is caught and reported through
`onInternalError` exactly once per session. Subsequent drops fire silently.

**You chain multiple samplers?** Each layer operates independently. The
outermost sampler's drop is final — inner samplers never see already-dropped
events.

## Security

Drop callbacks receive only metadata (`level`, `message`, `timestamp`, `reason`,
`samplerName`). They NEVER receive `attributes`, `context`, or `error` objects —
no secrets, tokens, or PII can leak through sampling.
