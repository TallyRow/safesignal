/**
 * Vue error handling — the `./framework-vue` subpath.
 *
 * The **no-globals, Vue-native counterpart** to `./capture` (and the sibling of
 * `./framework-react`): an `app.config.errorHandler` adapter plus composables
 * that route Vue component-tree errors through a consumer-provided `Logger`'s
 * existing secure pipeline (sanitize → URL-scrub → redact → guard → transport)
 * by calling `logger.error(...)`. Where `./capture` is a single host-level
 * *global* install, this is explicit, per-app / per-subtree, and
 * side-effect-free — it patches nothing and attaches no global listeners.
 *
 * Surface:
 *   - `createErrorHandler(logger)` — a side-effect-free factory returning a
 *     handler for `app.config.errorHandler`.
 *   - `safesignalErrorHandler` — a thin Vue plugin that wires the handler AND
 *     `app.provide(loggerKey, logger)`.
 *   - `loggerKey` — the `InjectionKey<Logger>` by which the plugin provides, and
 *     the composables inject, the logger (the Vue parallel of React's context).
 *   - `useLogError(loggerOverride?)` — a stable manual-report callback for errors
 *     Vue's handler cannot catch (async/try-catch, native listeners).
 *   - `useErrorCapture(options?)` — a subtree boundary wrapping `onErrorCaptured`
 *     (parallel of React's `<LogErrorBoundary>`) that logs descendant errors and,
 *     by default, stops propagation so the app-level handler does not double-log.
 *
 * Properties (see `specs/020-vue-error-handler/contracts/framework-vue.md`):
 *   - Fail-closed: emits via `logger.error`, so messages / stacks / the Vue info
 *     string are redacted + sanitized (drop-on-failure) before any transport.
 *   - Fail-safe: a logging (or `onError`) throw is swallowed; the original error
 *     is never escalated and the app keeps running (Principle III).
 *   - No-globals: no `window.onerror`, no `addEventListener`, no monkey-patching,
 *     no timers, no ambient reads (Principle VIII). Errors flow only through the
 *     resolved logger and Vue's own per-app / per-component error hooks.
 *   - Framework-neutral-preserving: `vue` is an externalized **peer** import, so
 *     the core entry and every other subpath stay Vue-free (Principle IV).
 *
 * The only intra-package `src/` import is **type-only** from `../api/types.js`;
 * the single runtime external is `vue` (the consumer-provided peer). No runtime
 * state is shared with the core — the helpers operate solely through the
 * passed/injected `Logger`.
 */

import {
  type App,
  type InjectionKey,
  inject,
  onErrorCaptured,
  type Plugin,
} from 'vue';
import type { Attributes, Logger } from '../api/types.js';

/** `safesignal.source` marker for app-level (`app.config.errorHandler`) errors. */
const SOURCE_HANDLER = 'vue-error-handler';
/** `safesignal.source` marker for errors reported via {@link useLogError}. */
const SOURCE_HOOK = 'vue-use-log-error';
/** `safesignal.source` marker for subtree errors captured by {@link useErrorCapture}. */
const SOURCE_CAPTURED = 'vue-error-captured';

/**
 * Vue injection key carrying the consumer's `Logger` for an app/subtree. When no
 * provider/override resolves a logger the helpers are a safe no-op (they never
 * mint a fallback logger, which would couple this bundle to the core runtime).
 * Vue-scoped, never a global registry.
 */
export const loggerKey: InjectionKey<Logger> = Symbol('safesignal.logger');

/** The Vue app-level error-handler signature (matches `app.config.errorHandler`). */
export type VueErrorHandler = (
  err: unknown,
  instance: unknown,
  info: string,
) => void;

/** Read a non-empty string `name` from an unknown object, else `undefined`. */
function readName(obj: unknown): string | undefined {
  if (obj && typeof obj === 'object') {
    const name = (obj as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) return name;
  }
  return undefined;
}

/**
 * Best-effort component name from a Vue instance (public or internal shape).
 * Wrapped + tolerant: returns `undefined` rather than throwing when the instance
 * is null, exotic, or nameless. Never reads props/state.
 */
function componentNameOf(instance: unknown): string | undefined {
  try {
    if (!instance || typeof instance !== 'object') return undefined;
    const inst = instance as {
      $options?: unknown;
      $?: { type?: unknown };
      type?: unknown;
    };
    return (
      readName(inst.$options) ?? readName(inst.$?.type) ?? readName(inst.type)
    );
  } catch {
    return undefined;
  }
}

/**
 * Emit one `error`-level event through the resolved logger. Safe no-op when no
 * logger resolves; fail-safe — any throw in the logging path is swallowed so the
 * original error is never escalated.
 */
function emit(
  logger: Logger | undefined,
  source: string,
  message: string,
  error: unknown,
  extra?: Attributes,
  instance?: unknown,
  info?: string,
): void {
  if (!logger) return;
  try {
    const attributes: Attributes = { 'safesignal.source': source };
    if (typeof info === 'string' && info.length > 0) {
      attributes['safesignal.vue.info'] = info;
    }
    const name = componentNameOf(instance);
    if (name) attributes['safesignal.vue.componentName'] = name;
    if (extra) {
      for (const key of Object.keys(extra)) {
        attributes[key] = extra[key] as Attributes[string];
      }
    }
    logger.error(message, attributes, error);
  } catch {
    // Fail-safe: a logging failure must never escalate the original error.
  }
}

/**
 * Side-effect-free factory: given a `Logger`, returns a handler suitable for
 * `app.config.errorHandler`. Each invocation emits one `error`-level event
 * (`safesignal.source: 'vue-error-handler'`) via that logger; it attaches
 * nothing at creation and never throws.
 */
export function createErrorHandler(logger: Logger): VueErrorHandler {
  return (err, instance, info) => {
    emit(logger, SOURCE_HANDLER, 'Vue error', err, undefined, instance, info);
  };
}

/** Options for the {@link safesignalErrorHandler} plugin. */
export interface SafesignalErrorHandlerOptions {
  /** The consumer's configured `Logger`, used by the app handler and provided to descendants. */
  logger: Logger;
}

/**
 * Vue plugin: `app.use(safesignalErrorHandler, { logger })` sets
 * `app.config.errorHandler = createErrorHandler(logger)` **and**
 * `app.provide(loggerKey, logger)`. No other side effects (no globals, no
 * timers, no listeners).
 */
export const safesignalErrorHandler: Plugin<SafesignalErrorHandlerOptions> = {
  install(app: App, options: SafesignalErrorHandlerOptions): void {
    const { logger } = options;
    app.config.errorHandler = createErrorHandler(logger);
    app.provide(loggerKey, logger);
  },
};

/**
 * Returns a callback that logs an error through the resolved logger
 * (`loggerOverride` ?? injected {@link loggerKey}) as an `error`-level event —
 * for the errors a framework handler cannot catch (async/`Promise` callbacks,
 * `try/catch`, native `addEventListener`). Fail-safe; a **safe no-op** when no
 * logger resolves. Call this in `setup()`; the callback identity is stable for
 * the component's lifetime (Vue runs `setup` once).
 */
export function useLogError(
  loggerOverride?: Logger,
): (error: unknown, attributes?: Attributes) => void {
  const logger = loggerOverride ?? inject(loggerKey);
  return (error, attributes) => {
    emit(logger, SOURCE_HOOK, 'Reported error', error, attributes);
  };
}

/** Options for {@link useErrorCapture}. */
export interface UseErrorCaptureOptions {
  /** Explicit logger override; falls back to the injected {@link loggerKey}. */
  logger?: Logger;
  /** Optional consumer hook, invoked fail-safe AFTER logging, with Vue's info string. */
  onError?: (error: unknown, info: string) => void;
  /** Keep propagating to ancestor/app handlers after logging. Default: false (stop). */
  propagate?: boolean;
}

/**
 * Subtree boundary: registers `onErrorCaptured` in the calling component so a
 * descendant error is logged once via the resolved logger
 * (`safesignal.source: 'vue-error-captured'`). By **default it stops
 * propagation** (returns `false`) so the app-level handler does not also log it;
 * pass `{ propagate: true }` to keep it bubbling. The optional `onError` callback
 * is invoked fail-safe after logging. A safe no-op when no logger resolves.
 */
export function useErrorCapture(options: UseErrorCaptureOptions = {}): void {
  const logger = options.logger ?? inject(loggerKey);
  onErrorCaptured((err, instance, info) => {
    emit(
      logger,
      SOURCE_CAPTURED,
      'Vue captured error',
      err,
      undefined,
      instance,
      info,
    );
    try {
      options.onError?.(err, info);
    } catch {
      // Fail-safe: a consumer onError that throws must not disrupt the app.
    }
    return options.propagate ? undefined : false;
  });
}
