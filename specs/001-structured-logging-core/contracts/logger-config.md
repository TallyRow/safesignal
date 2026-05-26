# Contract: LoggerConfig & Environment Behavior

## Shapes

```ts
interface LoggerConfig {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;
  level?: LogLevel | LevelMap;
  context?: Partial<LogContext>;
  correlation?: () => Partial<LogContext>;
  transports?: Array<Transport | TransportFactory>;
  redactor?: Redactor;
  onInternalError?: (err: Error) => void;
}

type LevelMap = Partial<Record<'production' | 'development' | 'test', LogLevel>>;

interface CreateLoggerOptions {
  name?: string;
  module?: ModuleIdentity;
  context?: Partial<LogContext>;
  level?: LogLevel;
}
```

## Environment defaults

| `environment`         | Default minimum level |
|-----------------------|------------------------|
| `'production'`        | `warn` |
| `'development'`       | `debug` |
| `'test'`              | `warn` |
| any other string      | `warn` |
| `undefined`           | `warn` |

The package does NOT read environment from `process.env`, `import.meta.env`, or
any global; consumers MUST pass `environment` explicitly. Calls that occur
before `configureLogging()` runs use safe defaults (`warn`+, `NoopTransport`,
environment-unknown).

## Level resolution

Given an emission at runtime, the effective minimum level is determined by:

1. If `CreateLoggerOptions.level` is set on the calling logger, use it.
2. Else if `LoggerConfig.level` is a `LogLevel`, use it.
3. Else if `LoggerConfig.level` is a `LevelMap`, look up
   `LevelMap[environment]`. If present, use it.
4. Else use the environment default table above.
5. Hard fallback: `warn`.

## Transports

- `transports: undefined` or `[]` → `[NoopTransport()]` automatically installed.
- Each entry may be a `Transport` instance or a `TransportFactory`. Factories
  are invoked once at `configureLogging()` time.
- Transports may be replaced by calling `configureLogging()` again. Existing
  logger references continue to work without change.

## Reconfiguration

- `configureLogging(newConfig)` MUST be safe to call multiple times.
- It MUST shut down the previous telemetry backend (call `shutdown()` on each
  previous transport's `shutdown` if defined) before installing the new config.
- It MUST NOT throw if `shutdown()` fails; failures route through
  `onInternalError`.

## Tested behavior

| ID | Behavior |
|----|----------|
| LC-1 | `production` env defaults to `warn`; `info`/`debug` calls are dropped |
| LC-2 | `development` env defaults to `debug`; all levels pass |
| LC-3 | `LevelMap` overrides per-environment defaults |
| LC-4 | Per-logger `level` overrides root config |
| LC-5 | Emission before `configureLogging()` uses safe defaults and never throws |
| LC-6 | Re-calling `configureLogging()` swaps transports without breaking existing logger references |
| LC-7 | `application`, `module`, `environment`, and `context.attributes` all flow into `LogEvent.context` |
| LC-8 | `correlation()` is invoked once per emission; its result is merged last (before per-call attributes) |
| LC-9 | The package never reads `process.env` or `import.meta.env` |
