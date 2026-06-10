# Data Model: `./framework-vue`

This subpath introduces no persisted data and no new wire format — it produces ordinary `error`-level
log events through the consumer's `Logger`. The "entities" are the public constructs and the structured
event they emit. (Vue counterpart of feature 018's data-model.)

## Entities

### `loggerKey` — `InjectionKey<Logger>`
- **Represents**: the token by which the plugin `provide`s, and composables `inject`, the consumer's
  `Logger` within a Vue app. The Vue parallel of React's `LoggerContext`.
- **Validation/rules**: typed via `InjectionKey<Logger>`; default resolution is `undefined` (no logger)
  → safe no-op. Never holds a fabricated fallback logger.

### `createErrorHandler(logger)` → `VueErrorHandler`
- **Represents**: a pure factory turning a `Logger` into a `(err, instance, info) => void` handler for
  `app.config.errorHandler`.
- **Fields/inputs**: `logger: Logger`. Returns a function closed over that logger.
- **Rules**: side-effect-free at creation; per call emits one `error` event (`safesignal.source =
  'vue-error-handler'`); swallows logging throws; best-effort `vue.info`/`vue.componentName`.

### `safesignalErrorHandler` — Vue `Plugin<SafesignalErrorHandlerOptions>`
- **Represents**: idiomatic install. `install(app, { logger })` sets `app.config.errorHandler =
  createErrorHandler(logger)` and `app.provide(loggerKey, logger)`.
- **Rules**: no side effects beyond those two wirings; no globals/timers/listeners.

### `useLogError(loggerOverride?)` → `(error, attributes?) => void`
- **Represents**: a stable manual-report callback for errors Vue's handler can't catch.
- **Rules**: resolved logger = `loggerOverride ?? inject(loggerKey)`; stable identity per resolved
  logger; emits `safesignal.source = 'vue-use-log-error'` with merged attributes; no-logger ⇒ no-op;
  swallows throws.

### `useErrorCapture(options?)` — subtree boundary
- **Represents**: per-component capture of descendant errors via `onErrorCaptured`. Vue parallel of
  React's `<LogErrorBoundary>`.
- **Fields (`UseErrorCaptureOptions`)**: `logger?` (override), `onError?(error, info)` (fail-safe, after
  logging), `propagate?` (default `false` → return `false` to stop; `true` → return `undefined`).
- **Rules**: logs once per captured error (`safesignal.source = 'vue-error-captured'`); default stops
  propagation so the app handler does not double-log; swallows logging/`onError` throws.

### Caught Vue Error Event (structured, post-pipeline)
- **Represents**: the emitted `error`-level event after the secure pipeline.
- **Fields**: `level: 'error'`; `message` (`'Vue error'` | `'Reported error'` | `'Vue captured error'`
  | consumer message); `attributes` (`safesignal.source` required; best-effort `safesignal.vue.info`,
  `safesignal.vue.componentName`; merged consumer attributes — all sanitized/redacted/bounded);
  serialized `error` (name/message/stack, scrubbed).
- **Rules**: machine-parseable, origin-attributable; no props/state auto-capture; fail-closed (dropped
  if redaction fails).

## Relationships

- `safesignalErrorHandler` **uses** `createErrorHandler` and **provides** `loggerKey`.
- `useLogError` / `useErrorCapture` **inject** `loggerKey` (unless given an explicit logger).
- All four emitters **route through** the consumer's `Logger.error` (the single secure pipeline) — no
  bypass, no new transport.

## State transitions

Only `useErrorCapture` holds transient state implicitly via Vue's reactivity if the consumer renders a
fallback; the composable itself stores no caught state (the consumer owns fallback UI). No other entity
holds state. No persistence anywhere.
