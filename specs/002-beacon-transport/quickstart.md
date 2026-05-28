# Quickstart — Beacon Transport

**Feature**: 002-beacon-transport · **Spec**: [spec.md](./spec.md)
· **Plan**: [plan.md](./plan.md)

This is a consumer-facing quickstart for the new
`@your-org/frontend-logging-sdk/transport-beacon` subpath. The
five-minute path: install, import, configure, ship.

## Five-minute path (single application)

```ts
// 1. Configure the runtime once at app boot.
import { configureLogging, createLogger } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

configureLogging({
  application: { name: 'payments', version: '2.4.1' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
    }),
  ],
});

// 2. Emit events from anywhere. Every warn/error reaches the endpoint.
const logger = createLogger();
logger.warn('payment retry exceeded threshold', { attemptCount: 4 });
logger.error('payment processor returned 5xx', { orderId: 'ord_9f3' }, new Error('upstream timeout'));
```

What this gets you:
- HTTPS body-only delivery via `navigator.sendBeacon` (falling back
  to `fetch` keepalive if `sendBeacon` refuses or is unavailable).
- Page-unload-safe: a `pagehide` listener is installed lazily on the
  first `send()` and removed on `shutdown()`.
- Zero retry loop, zero amplification on transient backend failures.
- Every drop surfaces through `onInternalError` with a documented
  code (see the drop-notice section below).

## Federated module pattern

The host application owns the transport. Federated modules emit
through the host's runtime and never touch the transport:

```ts
// Host application — bootstraps the runtime once.
import { configureLogging } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

configureLogging({
  application: { name: 'shell', version: '1.0.0' },
  environment: 'production',
  transports: [
    createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  ],
});
```

```ts
// Federated module — does NOT configure logging. Just emits.
import { createLogger } from '@your-org/frontend-logging-sdk';

const logger = createLogger({
  module: { name: 'cart-module', version: '0.7.0' },
});

logger.warn('cart checkout retried', { retryAttempt: 2 });
```

The host's beacon transport receives the cart module's event with
`context.module.name === 'cart-module'`. No duplicate transport
configuration; no module-level network setup; no cross-module
interference.

## Opt-in batching (high-volume telemetry)

If your app produces hundreds of events per page and you'd prefer
fewer network calls, opt into batching:

```ts
createBeaconTransport({
  endpoint: 'https://logs.example.com/ingest',
  batching: {
    maxBatchSize: 50,        // flush when 50 events accumulate
    maxBatchAgeMs: 10_000,   // ...or after 10 seconds, whichever first
  },
});
```

The wire body becomes:

```json
{ "events": [/* up to maxBatchSize LogEvents in emission order */] }
```

Tune `maxBatchSize` against your average event size to stay under
the browser's ~64 KiB per-request budget. A batch of 50 events at
1 KB each = 50 KB → safe. A batch of 500 events at 200 bytes each
= 100 KB → the envelope will exceed the budget and the flush will
drop with a `beacon_batch_drop` notice.

**Default is no batching**. Existing v1 consumers who add the
beacon transport without a `batching` field get one network call
per event.

## Local development

The transport refuses non-HTTPS endpoints at construction by
default. For local development against a localhost ingestion
endpoint, opt in explicitly:

```ts
createBeaconTransport({
  endpoint: 'http://localhost:4318/ingest',
  allowInsecureLoopback: true,
});
```

The flag is the only escape from HTTPS at construction time. It
permits `http://` for `localhost`, `127.0.0.1`, and `[::1]` only —
every other `http://` host still throws. The flag is never read
from `NODE_ENV`, build-tool env vars, or any ambient source;
your code makes the opt-in visible at the call site.

A production build should not ship with this flag set. Recommended
pattern: guard the transport instantiation by a build-time literal
your bundler substitutes.

```ts
// Vite / Webpack / esbuild substitute `import.meta.env.DEV` (or similar) at build.
createBeaconTransport({
  endpoint: import.meta.env.DEV
    ? 'http://localhost:4318/ingest'
    : 'https://logs.example.com/ingest',
  allowInsecureLoopback: import.meta.env.DEV,
});
```

## Multiple endpoints (multi-instance)

A single runtime can carry multiple beacon transports against
different endpoints. Each delivers every event the pipeline emits:

```ts
configureLogging({
  application: { name: 'payments' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs-primary.example.com/ingest',
      name: 'logs-primary',
    }),
    createBeaconTransport({
      endpoint: 'https://logs-audit.example.com/ingest',
      name: 'logs-audit',
    }),
  ],
});
```

Each instance:
- Carries its own buffer (when batching).
- Installs its own `pagehide` listener.
- Has its own drop-notice rate-limit flags.
- Is named distinctly in any drop notice via
  `PackageError.transportName`.

## Drop notices

Every dropped event surfaces through `LoggerConfig.onInternalError`:

```ts
configureLogging({
  // ...
  transports: [createBeaconTransport({ endpoint: '...' })],
  onInternalError(err) {
    // err is an Error instance carrying a discriminating .code
    // and a .transportName so you can route by transport.
    myErrorReporter.captureException(err);
  },
});
```

Codes the beacon transport may emit:

| `err.code`               | When                                                                                |
|--------------------------|--------------------------------------------------------------------------------------|
| `oversized_event`        | A single event's serialized body exceeds ~64 KiB. The event is dropped.              |
| `transport_send_failed`  | (Default mode) `sendBeacon` returned `false` AND the `fetch` keepalive fallback rejected. |
| `beacon_batch_drop`      | (Batch mode) A batch flush failed (sendBeacon refused, fetch fallback rejected, OR envelope > 64 KiB). |
| `beacon_unavailable`     | Neither `navigator.sendBeacon` nor `fetch` is available. (Vanishingly rare.)         |
| `transport_shutdown_failed` | The shutdown-flush attempt threw unexpectedly.                                    |

Each code fires **at most once per transport per session**, per
feature 001's FS-12 rate-limit. If your transport drops persistently,
you see the first drop and nothing more — instrument at the application
level if you need per-occurrence metrics.

The notice payload is **structural** — no event content, no `attrs`,
no `error`, no `context`. The notice's purpose is to tell you the
class of failure, not to deliver the dropped event by another channel.

## Safe-logging anti-patterns to avoid

The beacon transport itself is safe by construction (body-only,
HTTPS-only, no header injection). Anti-patterns to avoid are on the
**consumer** side, where the event is created:

- **Don't put secrets in attribute values that look like URLs.** The
  core's URL scrubber handles `?token=...` and `?session_id=...` in
  values that parse as URLs, but if you base64-encode a URL or
  hand-roll a stringify, the scrubber can't reach inside.

  ```ts
  // OK — URL scrubber redacts ?token in the value
  logger.info('callback url', { url: 'https://app.example.com/cb?token=abc' });

  // NOT OK — opaque blob; consumer must scrub manually
  logger.info('callback', { encoded: btoa('https://app.example.com/cb?token=abc') });
  ```

- **Don't ship raw Authorization headers as attributes.** Defaults
  redact `authorization`, `cookie`, `set-cookie`, `x-api-key`, but
  not custom names like `x-internal-token`. Audit your attribute key
  vocabulary or extend the redactor:

  ```ts
  import { createRedactor } from '@your-org/frontend-logging-sdk';

  const redactor = createRedactor([{ key: /^x-internal-/i }]);
  configureLogging({ /* ... */ redactor });
  ```

- **Don't construct beacon transports inside federated modules in
  production.** The host owns the runtime; modules emit. A module that
  constructs its own beacon transport AND calls `configureLogging()`
  replaces the host's runtime — this is explicit (not silent) per
  feature 001, but it's almost certainly not what you want.

## Verifying your configuration

The package's `./testing` subpath ships
`assertTransportContract(transport)` for any transport — including the
first-party beacon transport. Use it in your own tests if you wrap or
extend the transport:

```ts
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

await assertTransportContract(
  createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
);
```

The assertion runs the full T-1..T-9 (behavioral) and T-S1..T-S5
(security) contract battery. It uses test-double `sendBeacon` and
`fetch` so no real network is needed.

## Migration from `examples/shared/beacon-transport.ts`

Consumers who previously copy-pasted the example beacon transport
into their own codebase can replace it with the first-party transport
at a pace they control. The migration is one import line:

```ts
// Before (your own copy of examples/shared/beacon-transport.ts):
import { makeBeaconTransport } from './shared/beacon-transport';
const transport = makeBeaconTransport({ endpoint: '...' });

// After:
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';
const transport = createBeaconTransport({ endpoint: '...' });
```

The first-party transport adds: lazy lifecycle listeners, optional
batching, oversized-event detection with `onInternalError` routing,
construction-time scheme validation with documented errors, and
multi-instance safety. None of these change the wire shape — your
existing ingestion endpoint sees the same JSON.

## Bundle impact

- The default entry (`@your-org/frontend-logging-sdk`) is bit-
  identical or smaller than its v1 size. Adding the beacon transport
  to your dependencies has no impact on the default-entry bundle.
- The new subpath bundle (`@your-org/frontend-logging-sdk/transport-beacon`)
  is under 5 KiB gzipped.
- Tree-shaking: the package's `"sideEffects": false` declaration is
  preserved. A consumer who imports `createBeaconTransport` but never
  calls it produces a built bundle that does not include the
  transport's runtime code (modern bundlers eliminate the unused
  factory).
