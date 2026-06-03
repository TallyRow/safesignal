# Phase 0 Research: Vue Error-Handling Adapter (`./framework-vue`)

All Technical-Context unknowns resolved below. **Decision / Rationale / Alternatives.** This feature
mirrors the shipped `./framework-react` adapter (feature 018); decisions reuse that proven shape and
only diverge where Vue's model differs from React's.

## R1 — Which Vue capture mechanisms to wrap

- **Decision**: Wrap two Vue-native, per-app/per-component hooks: (a) **`app.config.errorHandler`**
  (app-wide capture of render/lifecycle/watcher/template-handler errors) via `createErrorHandler` +
  the plugin; (b) **`onErrorCaptured`** (subtree boundary) via `useErrorCapture`. Add
  **`useLogError`** for the manual-report gap (async/try-catch, native `addEventListener` callbacks)
  that neither hook observes.
- **Rationale**: These are Vue 3's own published error entry points — conforming to them (Principle IV)
  rather than inventing capture. `app.config.errorHandler` is the issue's headline ask; `onErrorCaptured`
  is the true parallel of React's `<LogErrorBoundary>`; `useLogError` parallels React's `useLogError`.
- **Alternatives**: Global `window.onerror`/`unhandledrejection` (rejected — that is `./capture`'s
  job, and it violates the no-globals stance). A custom render-wrapper component (rejected — heavier,
  non-idiomatic; `onErrorCaptured` already exists).

## R2 — App-level adapter: factory + plugin (both)

- **Decision**: Ship a side-effect-free **factory** `createErrorHandler(logger)` returning
  `(err, instance, info) => void` for `app.config.errorHandler`, **and** a thin **Vue plugin**
  `safesignalErrorHandler` (`install(app, { logger })`) that sets `app.config.errorHandler =
  createErrorHandler(logger)` and `app.provide(loggerKey, logger)`.
- **Rationale**: The factory is the pure primitive (composes with a consumer's own handler, zero side
  effects); the plugin is the idiomatic Vue install and also wires provide so composables resolve the
  logger. User chose **both** in pre-spec Q&A.
- **Alternatives**: Factory-only (rejected — loses idiomatic `app.use` + provide wiring). Plugin-only
  (rejected — no side-effect-free primitive; can't compose with an existing handler).

## R3 — Logger resolution + provide/inject (parallel of React context)

- **Decision**: Export `loggerKey: InjectionKey<Logger>`. Resolution order at every entry point:
  explicit `loggerOverride`/`options.logger` first, else `inject(loggerKey, undefined)`. No logger ⇒
  **safe no-op** (never mint a fallback logger — that would couple the bundle to the core runtime).
- **Rationale**: Mirrors React's `LoggerContext` + explicit-override precedence and the
  no-fallback-logger rule (keeps bundle isolation; FR-V5). `InjectionKey<Logger>` gives typed inject.
- **Alternatives**: Module-global logger registry (rejected — shared mutable global, breaks isolation
  and Principle VIII). Always require an explicit logger arg on composables (rejected — loses the
  ergonomic provide/inject path the plugin enables).

## R4 — `useErrorCapture` propagation default

- **Decision**: Wrap `onErrorCaptured`; after logging, **return `false` by default** (stop
  propagation) so the same error is not also logged by `app.config.errorHandler`. Opt back in with an
  option (`propagate: true`) which returns `undefined` (Vue then keeps propagating). Support an
  optional fail-safe `onError(error, info)` callback and an explicit `logger` override.
- **Rationale**: Without stop-by-default, a subtree error would be logged twice (boundary + app
  handler). Returning `false` is Vue's documented "handled, stop propagating" signal. The opt-out
  preserves flexibility. (FR-V4)
- **Alternatives**: Propagate-by-default (rejected — double-logging surprises users). Always stop
  (rejected — removes the ability to also surface to a top-level handler when desired).

## R5 — Fail-safe + fail-closed emission

- **Decision**: All three entry points emit only through `logger.error(message, attributes, error)`
  inside a `try/catch` that swallows any throw; consumer callbacks (`onError`) are invoked in their own
  `try/catch`. No bypass of the pipeline; a redaction failure drops the event (existing pipeline
  behavior).
- **Rationale**: Principle III (fail-safe — never escalate into the app) + Principle V (fail-closed —
  no unredacted data). Identical to the React adapter's guarantees (FR-V6/FR-V7).
- **Alternatives**: Direct transport call (rejected — bypasses redaction). Re-throw on logging failure
  (rejected — escalates the original crash).

## R6 — Event shape, source markers, Vue context attributes

- **Decision**: `safesignal.source` ∈ {`'vue-error-handler'`, `'vue-use-log-error'`,
  `'vue-error-captured'`}. Best-effort, fail-safe extras: `safesignal.vue.info` (Vue's `info` string,
  e.g. `"render function"`) and `safesignal.vue.componentName` (derived from the instance via
  `instance?.$options?.name` / `instance?.type?.name` / `getCurrentInstance()` — wrapped, omitted if
  unavailable). Default messages: `'Vue error'` (handler), `'Reported error'` (useLogError, matching
  React), `'Vue captured error'` (useErrorCapture). Props/state NOT auto-captured.
- **Rationale**: Source markers keep Vue events separable from `./capture` and ordinary logs (FR-V9),
  mirroring React's `react.componentStack`. Vue gives `info` (and an instance) rather than a component
  stack string, so we record the Vue-specific equivalents, best-effort.
- **Alternatives**: Capture the full component tree (rejected — Vue doesn't expose a ready stack
  string; walking parents is fragile and risks leaking app data). Auto-dump props (rejected — security).

## R7 — Testing strategy (no `@vue/test-utils` dependency)

- **Decision**: Test with **raw `vue` `createApp(...).mount(container)`** into a happy-dom element,
  using small inline test components (render functions) that throw, plus a capturing fake `Logger` and
  the real pipeline+transport for integration. Shell-free, deterministic. Do **not** add
  `@vue/test-utils`.
- **Rationale**: Principle VI (minimal deps) — `createApp`/`onErrorCaptured`/`app.config.errorHandler`
  are all in `vue` itself; mounting + triggering a throw and asserting on the fake logger needs no test
  harness lib. Mirrors how the React tests used `react-dom/client` directly. happy-dom is already the
  vitest environment.
- **Alternatives**: `@vue/test-utils` (rejected — extra devDep for ergonomics we don't need; only
  revisit if raw mounting proves impractical). jsdom (rejected — repo standardizes on happy-dom).

## R8 — Vue as externalized optional peer; build wiring

- **Decision**: `vue` is an **optional peer** `>=3.0.0` (`peerDependenciesMeta.vue.optional: true`),
  added to tsup `external: [...]` and listed as a devDependency (`^3.x`) for typecheck/tests.
  `dependencies` stays empty. New tsup entry `'framework-vue': 'src/framework-vue/index.ts'`; new
  `exports` triple; add `'./framework-vue'` to the three hardcoded subpath-key lists (sorted, right
  after `'./framework-react'`).
- **Rationale**: Exactly the `./framework-react` pattern (externalized peer keeps the core + other
  subpaths framework-free; FR-V10/FR-V11). The three-list reconciliation is required or a contract test
  fails CI (the documented gotcha).
- **Alternatives**: Bundle `vue` (rejected — bloat, version conflicts, violates Principle IV/XI).
  Vue 2 support (rejected — EOL, different app API).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Which Vue hooks to wrap | `app.config.errorHandler` + `onErrorCaptured` + manual `useLogError` (R1) |
| App-level adapter form | factory `createErrorHandler` + plugin `safesignalErrorHandler` (R2) |
| Logger resolution | explicit override → `inject(loggerKey)`; no logger ⇒ safe no-op (R3) |
| Boundary propagation default | stop (`return false`); opt-out `propagate: true` (R4) |
| Fail-safe / fail-closed | swallow throws; emit only via `logger.error`; pipeline drops on redaction fail (R5) |
| Event shape / markers | `vue-error-handler`/`vue-use-log-error`/`vue-error-captured` + best-effort `vue.info`/`vue.componentName` (R6) |
| Test harness | raw `vue` + happy-dom, no `@vue/test-utils` (R7) |
| Build / peer wiring | `vue` externalized optional peer `>=3.0.0`; tsup entry+external; 3 parity lists (R8) |
