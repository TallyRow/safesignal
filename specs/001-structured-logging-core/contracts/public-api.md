# Contract: Public API Surface

This contract enumerates every export from the package root. Implementations
MUST match these names and signatures exactly. Contract tests verify each item.

## Module entry

The only public entry is the package root (`./` in `package.json` `exports`).
Subpath imports into compiled `internal/`, `pipeline/`, or `transport/`
directories are NOT exported and MUST NOT be added later without a major version
bump.

## Exports

### Functions

```ts
export function createLogger(options?: CreateLoggerOptions): Logger;
export function configureLogging(config: LoggerConfig): void;
export function getRootLogger(): Logger;
export function createRedactor(rules?: RedactionRule[]): Redactor;
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
  Transport,
  TransportFactory,
  Redactor,
  RedactionRule,
};
```

## Forbidden in the public surface

- Anything from `@opentelemetry/*`. A contract test scans the generated `.d.ts`
  for the strings `opentelemetry` and `@opentelemetry`; the test fails if either
  is present.
- Internal types: `TelemetryBackend`, `NormalizedConfig`, `SafeTransport`,
  `EventBuilder`, `LevelFilter`, `Dispatcher`, anything under `src/internal/**`.
- Any concept named "span", "trace", "tracer", "meter", "exporter", "processor"
  in a public name.

## Stability guarantees

- Names and signatures listed here are SemVer-stable. Removals or signature
  changes require a major version bump and a migration note.
- Adding new optional fields to `LoggerConfig`, `CreateLoggerOptions`,
  `LogEvent.context`, or `Attributes` is a minor-version change.
- Adding new transport factories or new public functions is a minor-version
  change.

## Tested behavior

| ID | Behavior |
|----|----------|
| PA-1 | All listed names are exported from the package root |
| PA-2 | Each listed function has the documented arity and return type |
| PA-3 | `Logger` instances from `createLogger()` have all six methods (`debug`, `info`, `warn`, `error`, `child`, `withContext`) |
| PA-4 | `ConsoleTransport()` and `NoopTransport()` return a `Transport` |
| PA-5 | Published `.d.ts` contains no `opentelemetry` / `@opentelemetry` strings |
| PA-6 | Public surface does not expose any name from the "Forbidden" list |
