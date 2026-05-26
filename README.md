# @your-org/frontend-logging-sdk

A reusable browser-first structured logging package for web applications,
including federated host/module architectures.

> **Status**: in development. This README is a scaffold; consumer-facing
> sections are filled in as user stories land (see
> `specs/001-structured-logging-core/tasks.md`).

## What this package gives you

- A stable public `Logger` API (`debug | info | warn | error`) with structured
  attributes.
- Production-safe defaults: `warn` and `error` are the baseline; `debug` and
  `info` are opt-in.
- A pluggable transport boundary — bring your own HTTP/beacon/file delivery.
- Secure-by-default sanitization and redaction applied **before** any transport
  sees an event.
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

See `specs/001-structured-logging-core/quickstart.md` for the full tour.
Minimal example (lands in T020 / T022):

```ts
// Code example will be filled in once T016–T022 implement the public API.
// Until then, see specs/001-structured-logging-core/quickstart.md.
```

## Logging safely

See `docs/safe-logging.md` (filled in by T050) for DO/DON'T patterns,
`scrubUrl()` usage, custom redactors, and the full enumeration of every
behavior that drops or transforms events.

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
