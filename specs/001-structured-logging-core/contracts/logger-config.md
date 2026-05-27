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
  sanitizerLimits?: Partial<SanitizerLimits>;
  onInternalError?: (err: Error) => void;
}

type LevelMap = Partial<Record<'production' | 'development' | 'test', LogLevel>>;

interface SanitizerLimits {
  maxDepth: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxAttributeCount: number;
}

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

The package does NOT read environment from `process.env`, `import.meta.env`,
`location`, `document.cookie`, or any global; consumers MUST pass
`environment` explicitly. Calls before `configureLogging()` use safe defaults
(`warn`+, `NoopTransport`, environment-unknown).

## Level resolution

1. If `CreateLoggerOptions.level` is set on the calling logger, use it.
2. Else if `LoggerConfig.level` is a `LogLevel`, use it.
3. Else if `LoggerConfig.level` is a `LevelMap`, look up
   `LevelMap[environment]`. If present, use it.
4. Else use the environment default table above.
5. Hard fallback: `warn`.

## Sanitizer limits

| Limit                  | Default | Min | Max |
|------------------------|---------|-----|-----|
| `maxDepth`             | 8       | 1   | 16 |
| `maxStringLength`      | 8192    | 64  | 65536 |
| `maxArrayLength`       | 1000    | 1   | 10000 |
| `maxAttributeCount`    | 256     | 1   | 4096 |

- Consumers MAY **tighten** any limit by passing a value below the default.
- Consumers MAY raise a limit up to the documented Max.
- Setting a value above Max **clamps** to Max and emits one
  `onInternalError` notice at `configureLogging()` time.
- Setting a value below Min clamps to Min and emits the same notice.

## Transports

- `transports: undefined` or `[]` → `[NoopTransport()]` automatically installed.
- Entries may be `Transport` instances or `TransportFactory` functions
  invoked once at `configureLogging()` time.
- Transports may be replaced by calling `configureLogging()` again; existing
  logger references continue to work.

## Reconfiguration

- `configureLogging(newConfig)` MUST be safe to call multiple times.
- It MUST shut down the previous telemetry backend and call `shutdown()` on
  each previous transport that defines it, before installing new config.
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
| LC-8 | `correlation()` is invoked once per emission; its result is merged last (before per-call attributes); a throwing callback drops its output but does not drop the event |
| LC-9 | The package never reads `process.env`, `import.meta.env`, `location`, or `document.cookie` |
| LC-10 | `sanitizerLimits` values above documented Max clamp to Max and emit one `onInternalError` notice |
| LC-11 | A custom `redactor` fully replaces the default unless the consumer composes them |
