/**
 * Opt-in global error capture — the `./capture` subpath.
 *
 * A **host-level**, opt-in install that routes **uncaught exceptions** and
 * **unhandled promise rejections** through the host `Logger`'s existing secure
 * pipeline (sanitize → URL-scrub → redact → guard → transport). It is the single
 * explicit host-installed runtime-level global handler Principle VIII v1.5.0
 * sanctions — never a side effect of `createLogger()`, never installed by a
 * federated module.
 *
 * Properties (see `specs/013-global-error-capture/contracts/capture-api.md`):
 *   - Fail-closed: emits via `logger.error`, so stacks/messages are redacted +
 *     sanitized (drop-on-failure) before any transport sees them.
 *   - Fail-safe: never throws/rejects into the page; internal failures are
 *     swallowed (routed to `options.onInternalError`).
 *   - Additive: attaches via `addEventListener` — never assigns `window.onerror`
 *     and never calls `preventDefault()`, so existing handlers keep firing.
 *   - Loop-safe: a re-entrancy guard stops an error raised during emit from
 *     re-capturing.
 *   - Errors only: attaches ONLY `error` + `unhandledrejection` (not RUM).
 *
 * The only `src/` import is **type-only** from `../api/types.js`, so this bundle
 * shares no runtime state with the core (it operates through the passed
 * `Logger`, which closes over the host's configured runtime).
 */

import type { Attributes, Logger } from '../api/types.js';

/** Options for {@link installGlobalErrorCapture}. */
export interface GlobalErrorCaptureOptions {
  /** Where to attach listeners. Default: `globalThis`. */
  target?: EventTarget;
  /**
   * Diagnostics hook for the capturer's OWN failures (event-build/dispatch
   * throw). Invoked fail-safe — its own throw is swallowed. Distinct from the
   * runtime's `onInternalError`.
   */
  onInternalError?: (err: Error) => void;
}

/** Removes the installed listeners and stops capture. Idempotent. */
export type GlobalErrorCaptureDisposer = () => void;

const SOURCE = 'global-error-capture';

function noop(): void {
  /* no-op disposer */
}

function safeNotify(
  hook: ((err: Error) => void) | undefined,
  cause: unknown,
): void {
  if (!hook) return;
  try {
    hook(cause instanceof Error ? cause : new Error(String(cause)));
  } catch {
    // A diagnostics hook that itself throws must not break capture.
  }
}

/**
 * Install host-level capture of uncaught exceptions + unhandled promise
 * rejections, routed through `logger`'s configured pipeline. Returns a disposer.
 * Opt-in, host-owned; never a side effect of `createLogger()`. Never throws.
 */
export function installGlobalErrorCapture(
  logger: Logger,
  options: GlobalErrorCaptureOptions = {},
): GlobalErrorCaptureDisposer {
  const target: EventTarget =
    options.target ?? (globalThis as unknown as EventTarget);

  // Safe no-op where the target cannot register listeners (SSR / worker).
  const canListen =
    typeof (target as { addEventListener?: unknown }).addEventListener ===
      'function' &&
    typeof (target as { removeEventListener?: unknown }).removeEventListener ===
      'function';
  if (!canListen) return noop;

  let disposed = false;
  let inFlight = false;

  const emit = (
    message: string,
    errorType: 'uncaught-exception' | 'unhandled-rejection',
    errorValue: unknown,
    extra?: Attributes,
  ): void => {
    if (inFlight) return; // loop-safety: drop a capture raised during emit.
    inFlight = true;
    try {
      const attributes: Attributes = {
        'safesignal.source': SOURCE,
        'safesignal.errorType': errorType,
        ...(extra ?? {}),
      };
      logger.error(message, attributes, errorValue);
    } catch (err) {
      safeNotify(options.onInternalError, err);
    } finally {
      inFlight = false;
    }
  };

  const handleError = (event: Event): void => {
    try {
      const e = event as ErrorEvent;
      const hasError = e.error !== undefined && e.error !== null;
      const extra: Attributes = {};
      if (!hasError) {
        // Cross-origin "Script error." cases carry no error object.
        if (typeof e.filename === 'string') extra.filename = e.filename;
        if (typeof e.lineno === 'number') extra.lineno = e.lineno;
        if (typeof e.colno === 'number') extra.colno = e.colno;
      }
      const errorValue = hasError
        ? e.error
        : typeof e.message === 'string'
          ? e.message
          : 'Uncaught exception';
      emit(
        'Uncaught exception',
        'uncaught-exception',
        errorValue,
        Object.keys(extra).length > 0 ? extra : undefined,
      );
    } catch (err) {
      safeNotify(options.onInternalError, err);
    }
  };

  const handleRejection = (event: Event): void => {
    try {
      const e = event as PromiseRejectionEvent;
      emit('Unhandled promise rejection', 'unhandled-rejection', e.reason);
    } catch (err) {
      safeNotify(options.onInternalError, err);
    }
  };

  target.addEventListener('error', handleError);
  target.addEventListener('unhandledrejection', handleRejection);

  return (): void => {
    if (disposed) return;
    disposed = true;
    target.removeEventListener('error', handleError);
    target.removeEventListener('unhandledrejection', handleRejection);
  };
}
