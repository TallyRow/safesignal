# Phase 0 Research: Core Structured Logging API

This document resolves the technical unknowns for the core structured logging
package and records the decisions, rationales, and rejected alternatives that
inform Phase 1 (data model, contracts, quickstart) and Phase 2 (tasks).

All `NEEDS CLARIFICATION` items from Technical Context are resolved below.

---

## R1. Internal foundation for structured logging

**Decision**: Use `@opentelemetry/api-logs` + `@opentelemetry/sdk-logs` as the
internal foundation, hidden behind a `TelemetryBackend` interface and never
exposed in public types.

**Rationale**:
- Provides a well-defined structured log record shape (severity, body,
  attributes, instrumentation scope, timestamps) that maps cleanly to our
  canonical `LogEvent`.
- Opens a future path to OTLP-based ingestion, trace correlation, and existing
  OTel processors without a second migration.
- Internal-only use means breaking OTel changes do not break consumers.

**Alternatives considered**:
- *Roll our own emitter only.* Simpler, but forfeits OTel ecosystem reuse and
  forces us to rebuild processor/exporter patterns ourselves. Rejected.
- *`pino` browser build.* Designed for Node, awkward for browsers, no native
  structured context model that matches OTel semantic conventions. Rejected.
- *`loglevel` + custom plugin layer.* Too thin; we would re-invent everything
  the SDK already gives us. Rejected.

---

## R2. Isolating the experimental OTel Logs API

**Decision**: Restrict all `@opentelemetry/*` imports to
`src/internal/telemetry/otel/**`. Enforce with a test that scans the source
tree, and a `d.ts` contract test that fails if `opentelemetry` appears in the
public type declaration output.

**Rationale**:
- Single chokepoint means breaking OTel API changes touch one directory.
- A `NoopBackend` fallback keeps the package fully functional if OTel init
  fails or if the package is consumed without the OTel deps loaded.

**Alternatives considered**:
- *Document the boundary informally.* Too easy to break; rejected in favor of
  an automated guard test.
- *Make OTel a peer dependency.* Increases consumer burden and exposes them
  to OTel version churn. Rejected; ship as a direct internal dependency.

---

## R3. Public API shape

**Decision**: One `Logger` interface with `debug|info|warn|error|child|withContext`.
Two factory functions: `createLogger(options?)` and `configureLogging(config)`.
Built-in `ConsoleTransport` and `NoopTransport`. `LogLevel` is a string union
(`'debug' | 'info' | 'warn' | 'error'`), not an enum, to keep the published
type artifact small and tree-shakeable.

**Rationale**:
- Mirrors widely understood logger patterns (`console`, `pino`, `winston`).
- Avoids OTel naming (`SeverityNumber`, `LoggerProvider`, etc.).
- `child()` matches a familiar convention for derived context loggers.

**Alternatives considered**:
- *Class-based `Logger`.* Less ergonomic for tree-shaking and harder to mock.
  Rejected in favor of an interface implemented by a small internal class.
- *Numeric severity model.* Better for OTel mapping but worse for DX.
  Rejected; internal mapping handles the translation.

---

## R4. Environment-aware level defaults

**Decision**: Production-safe defaults baked into a table:

| Environment   | Default minimum level |
|---------------|------------------------|
| `production`  | `warn`                 |
| `development` | `debug`                |
| `test`        | `warn`                 |
| unknown       | `warn`                 |

Resolution: explicit `level` (single or per-environment map) → env default →
hard fallback `warn`.

**Rationale**: Spec FR-004 and SC-005 require `warn`/`error` baseline in
production with lower levels configurable. Treating unknown as `warn` is the
safest default for a package that cannot infer the environment.

**Alternatives considered**:
- *Auto-read `process.env.NODE_ENV` / `import.meta.env.MODE`.* Couples the
  package to specific bundlers. Rejected; require explicit `environment`.

---

## R5. Identity and correlation flow

**Decision**: Three fixed slots on `LogContext` —
`application: { name, version? }`, `module: { name, version? }`, plus a free
`attributes: Record<string, unknown>` slot for correlation values (trace ids,
user pseudonymous ids, route name). A `correlation()` callback is invoked on
every emit for dynamic data.

**Rationale**:
- Three explicit slots cover the spec's distinct concerns (host app, federated
  module, environment) without inviting consumers to invent ad-hoc keys for
  the same concept.
- A free `attributes` slot keeps correlation extensible.
- A callback (not just static config) lets consumers attach per-emit data such
  as the current route or trace id.

**Alternatives considered**:
- *Flat string keys only.* Less self-documenting; rejected.
- *Required `userId` slot.* Privacy hazard; rejected.

---

## R6. Sensitive-data redaction strategy

**Decision**: A `Redactor` is a pure function
`(event: LogEvent) => LogEvent | null`. Built-in `createRedactor()` returns a
default redactor that masks values for known sensitive keys (case-insensitive
match): `password`, `passwd`, `token`, `accessToken`, `refreshToken`,
`authorization`, `auth`, `cookie`, `set-cookie`, `secret`, `apiKey`, `api_key`,
`sessionId`, `ssn`, `creditCard`, `cardNumber`, `cvv`. Custom redactor wholly
replaces the default unless the consumer composes them.

If a redactor throws, the event is **dropped** (fail-closed).

**Rationale**: Privacy is a constitutional principle. Fail-closed prevents
accidental leakage during failures. A function-typed redactor is the smallest
extensible surface and avoids encoding a DSL.

**Alternatives considered**:
- *Allowlist instead of denylist.* Better safety but worse adoption; consumers
  would have to enumerate every safe key. Rejected for v1; can be added later
  by a custom `Redactor`.
- *Async redactor.* Adds Promise plumbing to a hot path; rejected. Redaction
  must be synchronous.

---

## R7. Transport abstraction

**Decision**: A `Transport` is `{ send(event: LogEvent): void | Promise<void>;
flush?(): Promise<void>; shutdown?(): Promise<void>; name: string }`. All
transports are wrapped by `SafeTransport` which catches sync throws and Promise
rejections. Multiple transports may be configured; they receive the same event.

**Rationale**: Smallest possible delivery contract. Async `send` allows HTTP
delivery without forcing it. `flush`/`shutdown` are optional hooks for batching
transports and page-unload paths.

**Alternatives considered**:
- *Stream-based delivery.* More complex than needed; rejected.
- *Single transport only.* Limits use cases like "console in dev + HTTP in
  prod". Rejected.

---

## R8. Behavior when no transport is configured

**Decision**: `NoopTransport` is installed automatically when `transports`
is undefined or empty. Emission still runs the full pipeline (so tests of the
pipeline behave the same in both modes). A one-time `onInternalError` notice
is emitted in `production` to alert the consumer.

**Rationale**: Matches spec FR-011 (degrade safely) and spec assumption that
logging may be dropped when delivery is unavailable.

**Alternatives considered**:
- *Throw on missing transport.* Violates Browser Resilience principle.
  Rejected.

---

## R9. Federated/module compatibility

**Decision**: The package has no module-level singletons that touch globals.
`configureLogging()` writes to a module-scoped variable; each loaded copy of
the package owns its own root logger. Distinct events from distinct module
copies are still distinguishable via `context.application.name` and
`context.module.name`.

**Rationale**: Module federation often loads the same package multiple times.
A `window`-scoped singleton would force consumers into a sharing strategy we
cannot guarantee.

**Alternatives considered**:
- *Shared singleton via `globalThis`.* Brittle, version-mismatch hazardous.
  Rejected.

---

## R10. Build, packaging, and target

**Decision**:
- Build with `tsup` to produce ESM (`.mjs`) and CJS (`.cjs`) dual outputs plus
  `.d.ts` declarations.
- Target ES2020, browser only (no `node` builtins polyfilled).
- `package.json` `exports` map exposes only the root entry; subpath imports
  into `dist/internal/**` are not exported.
- `sideEffects: false` for tree-shaking.

**Rationale**: Standard, low-friction setup for a TypeScript browser package.
Restricting `exports` prevents consumers from reaching internals.

---

## R11. Testing toolchain

**Decision**: `vitest` with `happy-dom` environment for browser-like tests.
Contract tests import only from `dist/` (or from `src/index.ts` via the
package's published `exports` map) to verify the actual public surface.

**Rationale**: Vitest gives fast TS-first testing with good ESM support.
Importing from the public entry catches accidental internal leaks.

---

## R12. Performance envelope

**Decision**: Emission must be O(1) excluding attribute copy. The hot path is:
synchronous level check → context merge → redact → backend dispatch. Transport
work is deferred (transports decide whether to batch). The package itself does
no batching in v1.

**Rationale**: Spec FR-010 requires no interruption to rendering or
interaction. Keeping the pipeline synchronous and bounded matches that.

---

## R13. Documentation and examples scope (for Phase 1)

**Decision**: Phase 1 produces a `quickstart.md` (consumer onboarding) and
`contracts/*.md` (machine-readable-enough contracts for the public API,
transport, log event, config, and failure safety). Two example projects
(`examples/host-app`, `examples/federated-module`) are scaffolded at Phase 2.

**Rationale**: Quickstart aligns docs with actual API; contracts give
downstream task generators a structured input.

---

All open clarifications resolved. Phase 1 proceeds.
