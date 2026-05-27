# Federated module example

Standalone consumer project demonstrating the federated/module-
federation usage pattern documented in [`docs/safe-logging.md`'s
"Configuration ownership in federated deployments"
section](../../docs/safe-logging.md#configuration-ownership-in-federated-deployments).

## What this example shows

A **federated module** is a piece of frontend code that's bundled
and deployed independently of the host application, but loaded into
the host's runtime at page time. From the package's perspective, it
shares the host's `window`, `document`, cookies, and origin — and
the host's logging pipeline.

The conventions this example demonstrates:

1. **The module does NOT call `configureLogging()`.** The host owns
   the configured runtime by convention (see FR-031 / FR-032). The
   module reads the host's runtime via `createLogger()` and emits
   structured events through the host's transports.
2. **The module attaches `module.{name, version}`.** Every event
   carries `event.context.module` so the host's transports can
   attribute the event to this module.
3. **The module derives per-feature / per-request context** via
   `child()` / `withContext()` — never mutates a shared logger
   reference.
4. **The module uses the same body-only beacon transport contract**
   documented in [`examples/shared/beacon-transport.ts`](../shared/beacon-transport.ts).
   In normal operation the module does not install transports, but
   if a developer is iterating on the module in isolation
   (Storybook, component playground) the example shows how to
   opt-in to local `configureLogging()` gated against shipping to
   production.

## Run

```bash
cd examples/federated-module
npm install
npm run typecheck
```

`npm run typecheck` validates the example compiles against the
locally-linked package's public surface (`file:../..` dependency in
`package.json`). The example does not run a server — it's a
type-only smoke check.

## Pointers into the docs

- **[Configuration ownership in federated deployments](../../docs/safe-logging.md#configuration-ownership-in-federated-deployments)**
  — Why the host owns `configureLogging()` and what it means when a
  module calls it as a last-resort override.
- **[Duplicate package copies](../../docs/safe-logging.md#duplicate-package-copies)**
  — The package's **isolated** classification for duplicate-copy
  scenarios, and the module-federation singleton-sharing strategy
  to consolidate copies at build time.
- **[Vendor neutrality](../../docs/safe-logging.md#vendor-neutrality)**
  — Why this example does not import an OpenTelemetry / Datadog /
  Sentry SDK. The core is vendor-free; consumers ship their own
  transports.
- **[Logging safely](../../docs/safe-logging.md#logging-safely)** —
  The full DO / DON'T sweep that applies to every consumer,
  including federated modules. Module-specific MUST-NOT callouts
  (host secrets, ambient browser state, full host application
  state) are documented in [`index.ts`](./index.ts) as inline
  guidance.

## Security guidance for federated module authors

A federated module is loaded into a host application's runtime and
shares its sensitive context. Any value the module logs is
potentially visible to every transport configured by the host.
Specifically:

- **Don't log values the module obtained from the HOST** (auth
  tokens from the page's auth header, host-side cookies, host
  framework state, host user identifiers, host CSRF tokens).
- **Don't log ambient browser state** (`location`, `document.cookie`,
  `localStorage`, `navigator.*`).
- **Don't log whole framework objects, raw DOM nodes, or full host
  application state** — the sanitizer will type-tag them but you
  get zero useful data AND you risk dumping fields you didn't
  intend.
- **DO confine module logs to the module's own state** — features
  loaded, items rendered, errors caught inside the module's own
  call stack, performance markers the module owns.

See [`index.ts`](./index.ts) for the full anti-pattern reference
block.

## Files

- [`index.ts`](./index.ts) — the working example, with DO patterns
  in real code and DON'T patterns in commented-out anti-pattern
  references.
- [`package.json`](./package.json) — standalone consumer project
  that depends on the locally-linked package (`file:../..`).
- [`tsconfig.json`](./tsconfig.json) — mirrors the host-app
  example's compile setup; includes `../shared/beacon-transport.ts`
  so the example references the same canonical body-only transport
  the host-app example uses.
