# Quickstart: SafeSignal

**Phase**: 1 (Design & Contracts)
**Feature**: [003-rename-safesignal/spec.md](./spec.md)
**Plan**: [003-rename-safesignal/plan.md](./plan.md)

Five-minute path for a new consumer to install **SafeSignal**, wire
it into a browser application, and emit a first structured log
event. This document is the post-rename canonical quickstart and
will be the model for the README's quickstart section after the
rename lands.

For migration from the legacy `@your-org/frontend-logging-sdk`
identity, see [contracts/migration-note.md](./contracts/migration-note.md)
and the README migration block that ships with this feature.

## Install

```bash
npm install @tallyrow/safesignal
```

The package publishes under the `@tallyrow/` scope (TallyRow is the
publishing organization). The product is **SafeSignal** — a
browser-first structured logging facade and safety boundary for
host applications and federated frontend modules.

## Configure the runtime (host-owned, once per page)

The host application configures the SafeSignal runtime once during
boot. Federated modules import loggers but never configure the
runtime themselves.

```ts
// host-app boot
import { configureLogging, ConsoleTransport } from '@tallyrow/safesignal';

configureLogging({
  appName: 'my-host-app',
  environment: 'production',
  level: 'info',
  transports: [ConsoleTransport],
});
```

This wires the runtime, applies the secure-by-default redactor
pipeline (token / cookie / authorization-header / known-PII
scrubbing) and the URL scrubber, and sets the level filter. All
subsequent `createLogger` / `getRootLogger` calls share this
runtime — federated modules included.

## Emit a first event

```ts
import { createLogger } from '@tallyrow/safesignal';

const log = createLogger({ module: 'checkout' });

log.info('cart_submitted', {
  cartId: '7a2…',
  itemCount: 3,
  totalCents: 1599,
});
```

The event flows through the redactor (token / cookie / known-PII
fields stripped), through the bounded sanitizer (depth / size /
key-count limits applied), and through every configured transport.
The default `ConsoleTransport` writes a structured object to
`console.info`.

## Ship logs over HTTPS (optional)

Use the dedicated subpath for the beacon transport. The subpath is
unchanged from pre-rename — only the package-name segment moves.

```ts
import { configureLogging } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

const beacon = createBeaconTransport({
  endpoint: 'https://logs.example.com/ingest',
  onInternalError: (err) => {
    // Optional: surface beacon-internal errors for telemetry.
    // The transport never throws back into the emit call site;
    // failures are dropped fail-closed.
    console.warn('[beacon] internal error', err);
  },
});

configureLogging({
  appName: 'my-host-app',
  environment: 'production',
  level: 'info',
  transports: [beacon],
});
```

The beacon transport prefers `navigator.sendBeacon` and falls back
to `fetch({ keepalive: true })`. It enforces HTTPS (with a loopback
allowlist for local development), drops events over 64 KiB
(`oversized_event`), and lazily installs a `pagehide` listener so
in-flight batches drain on tab close.

## Quickstart from the testing helper subpath

For consumer test suites that need to assert SafeSignal contract
behavior on a custom transport, import the testing harness from the
`/testing` subpath (also unchanged from pre-rename):

```ts
import { assertTransportContract } from '@tallyrow/safesignal/testing';
import { MyTransport } from './my-transport';

assertTransportContract({
  createTransport: () => MyTransport,
});
```

The helper verifies idempotent shutdown, fail-closed handling, and
the never-throw boundary on `send()`. It does not require
SafeSignal's own runtime to be configured.

## What you get out of the box

- **Structured event shape** with bounded depth and bounded size.
- **Fail-closed redactor pipeline** — token / cookie / authorization
  header / known-PII fields are stripped by default; a failed
  redactor drops the field rather than emitting an unredacted value.
- **URL scrubber** — query-string secret patterns (`token`,
  `access_token`, `id_token`, `code`, `state`, `nonce`, `session_id`,
  custom keys) are scrubbed before any URL appears in a log.
- **Never-throw boundary** — no error from a transport, redactor, or
  sanitizer propagates into the consumer's emit call site.
- **Lightweight `Logger` instances** — `createLogger` /
  `child()` / `withContext()` are constant-cost.
- **Federated runtime discipline** — host owns the runtime; modules
  import loggers without re-configuring; duplicate-copy
  classification is **isolated** per copy.

For the full contract — redaction defaults, sanitizer limits,
transport security contract (T-S1..T-S5), federated-deployment
guidance, level-filter behavior, log-integrity guarantees — see
`docs/safe-logging.md`.

## Where to go next

- `docs/safe-logging.md` — the full DO / DON'T sweep, pipeline-order
  detail, transport-security contract, and federated-deployments
  guidance.
- `examples/host-app/` — single-app consumer example end-to-end.
- `examples/federated-module/` — federated module consumer example
  demonstrating the host-owns-runtime contract.
- README's migration note — if you previously installed the package
  under its legacy `@your-org/frontend-logging-sdk` identity.
