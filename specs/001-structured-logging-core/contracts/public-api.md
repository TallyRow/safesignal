# Contract: Public API Surface

This contract enumerates every export from the package root (and the
`/testing` subpath). Implementations MUST match these names and signatures
exactly. Contract tests verify each item.

## Module entries

- `.` (package root) — runtime API for application code.
- `./testing` — test helpers (must NOT be imported by runtime code).

Subpath imports into compiled `internal/`, `pipeline/`, `transport/`,
`config/`, `context/` directories are NOT exported and MUST NOT be added
later without a major version bump.

## Root exports

### Functions

```ts
export function createLogger(options?: CreateLoggerOptions): Logger;
export function configureLogging(config: LoggerConfig): void;
export function getRootLogger(): Logger;
export function createRedactor(rules?: RedactionRule[]): Redactor;
export function scrubUrl(url: string, options?: ScrubUrlOptions): string;
```

### Values (transport factories)

```ts
export const ConsoleTransport: TransportFactory;
export const NoopTransport: TransportFactory;
```

### Types (re-exported)

```ts
export type {
  Logger,
  LogLevel,
  LogEvent,
  LogContext,
  AppIdentity,
  ModuleIdentity,
  Attributes,
  AttributeValue,
  ErrorInfo,
  LoggerConfig,
  CreateLoggerOptions,
  LevelMap,
  SanitizerLimits,
  Transport,
  TransportFactory,
  Redactor,
  RedactionRule,
  ScrubUrlOptions,
};
```

## `./testing` exports

```ts
export function assertTransportContract(t: Transport): Promise<void>;
export function makeSecretFixture(): Record<string, string>;
```

## Forbidden in the public surface

- Anything from `@opentelemetry/*`. A contract test scans the generated
  `.d.ts` for `opentelemetry` / `@opentelemetry`; the test fails if either
  string is present.
- Internal types: `TelemetryBackend`, `NormalizedConfig`, `SafeTransport`,
  `EventBuilder`, `LevelFilter`, `Sanitizer`, `ControlCharGuard`,
  `Dispatcher`, anything under `src/internal/**`.
- Concepts named "span", "trace", "tracer", "meter", "exporter", "processor"
  in any public name.
- Any function or method that accepts a single arbitrary `unknown` payload
  as the primary log input (no `logger.dump`, `logger.raw`, `logger.log(obj)`).
  The only `unknown` in the public surface is the optional `error` argument
  of `logger.error()`.

## Stability guarantees

- Names and signatures listed here are SemVer-stable.
- Adding new optional fields to `LoggerConfig`, `CreateLoggerOptions`,
  `SanitizerLimits`, `RedactionRule`, `ScrubUrlOptions`, `LogEvent.context`,
  or `Attributes` is a minor-version change.
- Adding new transport factories, new public functions, or new `/testing`
  helpers is a minor-version change.
- Loosening the security default of any built-in (e.g., removing entries
  from the default redaction denylist) requires a major-version change and
  documented migration.

## Tested behavior

| ID | Behavior |
|----|----------|
| PA-1 | All listed names are exported from the package root and `/testing` |
| PA-2 | Each listed function has the documented arity and return type |
| PA-3 | `Logger` instances from `createLogger()` have all six methods |
| PA-4 | `ConsoleTransport()` and `NoopTransport()` return a `Transport` |
| PA-5 | Published `.d.ts` contains no `opentelemetry` / `@opentelemetry` strings |
| PA-6 | Public surface does not expose any name from the "Forbidden" list |
| PA-7 | `Logger` methods accept `message: string` only; passing `object` to `message` is a TypeScript error |
| PA-8 | `logger.error` accepts an optional third `unknown` argument and reduces it to `ErrorInfo` before any transport sees it |
| PA-9 | `/testing` helpers are not reachable through the root entry |
