# Contract: `./framework-vue` — `createErrorHandler`, `safesignalErrorHandler`, `loggerKey`, `useLogError`, `useErrorCapture`

**Spec**: ../spec.md · **Plan**: ../plan.md · **Constitution**: v1.5.0 (IV, VIII, III, V, VII, XI)

Public surface of the new opt-in `./framework-vue` subpath. Behavior is normative; the exact TypeScript
types are settled here and implemented in `src/framework-vue/index.ts`. This is the Vue counterpart of
`./framework-react` (feature 018, `contracts/framework-react.md`).

## Exports

```ts
import {
  createErrorHandler,
  safesignalErrorHandler,
  loggerKey,
  useLogError,
  useErrorCapture,
} from '@tallyrow/safesignal/framework-vue';
import type {
  SafesignalErrorHandlerOptions,
  UseErrorCaptureOptions,
  VueErrorHandler,
} from '@tallyrow/safesignal/framework-vue';
```

- `vue` is an **optional peer dependency** (`>=3.0.0`), provided by the consumer and externalized from
  the bundle. The core `.` entry and every other subpath remain Vue-free.

## Signatures (normative)

```ts
import type { App, InjectionKey, Plugin } from 'vue';
import type { Attributes, Logger } from '@tallyrow/safesignal';

/** The Vue app-level error handler signature (matches app.config.errorHandler). */
export type VueErrorHandler = (err: unknown, instance: unknown, info: string) => void;

/** Vue injection key carrying the consumer's Logger for an app/subtree. */
export const loggerKey: InjectionKey<Logger>;

/**
 * Side-effect-free factory: returns a handler for `app.config.errorHandler`.
 * Emits one error-level event per call via `logger.error`; never throws.
 */
export function createErrorHandler(logger: Logger): VueErrorHandler;

export interface SafesignalErrorHandlerOptions {
  /** The consumer's configured Logger; provided to descendants and used by the app handler. */
  logger: Logger;
}
/** Vue plugin: sets app.config.errorHandler = createErrorHandler(logger) AND app.provide(loggerKey, logger). */
export const safesignalErrorHandler: Plugin<SafesignalErrorHandlerOptions>;

/**
 * Stable manual-report callback for errors Vue's handler cannot catch (async, try/catch, native
 * listeners). Resolved logger = loggerOverride ?? inject(loggerKey). Safe no-op when none resolves.
 * Identity is stable for a fixed resolved logger.
 */
export function useLogError(
  loggerOverride?: Logger,
): (error: unknown, attributes?: Attributes) => void;

export interface UseErrorCaptureOptions {
  /** Explicit logger; falls back to inject(loggerKey). */
  logger?: Logger;
  /** Optional consumer hook, invoked fail-safe AFTER logging. */
  onError?: (error: unknown, info: string) => void;
  /** Keep propagating to ancestor/app handlers after logging. Default: false (stop). */
  propagate?: boolean;
}
/** Subtree boundary: wraps onErrorCaptured; logs descendant errors once via the resolved logger. */
export function useErrorCapture(options?: UseErrorCaptureOptions): void;
```

## Behavioral guarantees (FR-V#)

- **FR-V1 (app-level adapter)**: `createErrorHandler(logger)` returns a `(err, instance, info) => void`.
  Each invocation emits one `error`-level event via `logger.error(message, attributes, err)` with
  `attributes['safesignal.source'] = 'vue-error-handler'`. It is side-effect-free at creation (attaches
  nothing) and never throws. (spec FR-V1)
- **FR-V2 (plugin install)**: `app.use(safesignalErrorHandler, { logger })` sets
  `app.config.errorHandler` to `createErrorHandler(logger)` **and** calls `app.provide(loggerKey,
  logger)`; it performs no other side effects (no globals, no timers, no listeners). (spec FR-V2)
- **FR-V3 (useLogError)**: `useLogError(loggerOverride?)` returns a callback that emits an `error`-level
  event via the resolved logger with `attributes['safesignal.source'] = 'vue-use-log-error'` and
  consumer attributes merged. Identity is **stable** across re-renders for a fixed resolved logger.
  (spec FR-V3)
- **FR-V4 (useErrorCapture boundary)**: `useErrorCapture(options?)` registers `onErrorCaptured`; on a
  descendant error it emits one `error`-level event via the resolved logger with
  `attributes['safesignal.source'] = 'vue-error-captured'`, then by **default returns `false`** (stops
  propagation — the app handler does not also log it). With `propagate: true` it returns `undefined`
  (Vue keeps propagating). It calls `options.onError(error, info)` fail-safe AFTER logging. (spec FR-V4)
- **FR-V5 (logger resolution / no-op)**: Resolution is explicit override → `inject(loggerKey)`. When
  neither resolves, every entry point performs **no emission** and never throws; no fallback logger is
  fabricated. (spec FR-V5)
- **FR-V6 (fail-closed)**: All emission goes through `Logger.error` — the **same** sanitize → URL-scrub
  → redact (drop-on-failure) → guard pipeline as any log. No bypass. A secret in the
  message/stack/`info` is masked, or the event dropped, before any transport. (spec FR-V6)
- **FR-V7 (fail-safe)**: A throw inside the logging path (or `onError`) is swallowed and **never**
  escalates the original error or disrupts the app. (spec FR-V7)
- **FR-V8 (no globals)**: The helpers attach **no** global listeners, patch **no** globals
  (`window.onerror`, `addEventListener`, console, etc.), start no timers, and read no ambient state.
  Errors flow only through the resolved logger and Vue's own per-app/per-component error hooks. (spec FR-V8)
- **FR-V9 (source-marked + Vue context)**: Events carry the exact `safesignal.source` marker above, plus
  best-effort `safesignal.vue.info` (Vue's `info`) and `safesignal.vue.componentName` (when derivable;
  omitted otherwise). Consumer `attributes` merge in; props/state are **not** auto-captured. (spec FR-V9)
- **FR-V10 (vue peer, core neutral)**: `vue` is an optional peer, externalized; the core entry imports
  zero Vue and exposes no Vue API; the subpath bundle externalizes `vue` (not inlined) and is
  vendor-neutral. (spec FR-V10)
- **FR-V11 (honest surface)**: `./framework-vue` is added to the documented public-subpath set and the
  parity gate; `dependencies` stays empty and packaged files `["dist"]`. (spec FR-V11)
- **FR-V12 (verification parity)**: Every gate has a fail-closed test (table below), same verdict in CI
  and locally. (spec FR-V12)

## Emitted-event shape (post-pipeline)

```jsonc
{
  "level": "error",
  "message": "Vue error",          // or "Reported error" / "Vue captured error" / consumer message
  "attributes": {
    "safesignal.source": "vue-error-handler",   // or "vue-use-log-error" / "vue-error-captured"
    "safesignal.vue.info": "render function",    // best-effort; omitted if unavailable
    "safesignal.vue.componentName": "MyWidget",  // best-effort; omitted if unavailable
    // ...consumer-supplied attributes (sanitized/redacted/bounded)
  },
  "error": { "name": "…", "message": "<scrubbed>", "stack": "<scrubbed>" }
}
```

## Enforcement (Principle X — every gate has a test)

| Guarantee | Enforcing test |
|-----------|----------------|
| FR-V1/V2/V3/V4/V5/V9 (API + emission + markers + no-op) | `tests/contract/framework-vue.contract.test.ts` |
| FR-V1/V4 end-to-end + propagation (no double-log) + sibling isolation | `tests/integration/framework-vue.integration.test.ts` |
| FR-V6 fail-closed redaction (msg/stack/info) | `tests/security/framework-vue-redaction.security.test.ts` |
| FR-V10/V11 vue externalized + vendor-neutral + default-entry isolation | `tests/security/framework-vue-bundle-shape.security.test.ts` |
| FR-V8/V10 no-globals + only `src/framework-vue/**` imports `vue`; core imports zero Vue | `tests/contract/vue-import-boundary.test.ts` |
| FR-V11 parity + per-entry triple | `tests/contract/distributed-surface.contract.test.ts`, `tests/contract/dependency-pins.test.ts`, `tests/contract/transport-beacon.contract.test.ts` (TB-12) |
| FR-V7 fail-safe (logging/onError throw → app keeps running, no loop) | `tests/integration/framework-vue.integration.test.ts` (failure cases) |
