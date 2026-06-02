/**
 * Public logger factories and root configuration flow.
 *
 *   - `configureLogging(config)` — install (or replace) the package's
 *     module-scoped configuration. Atomic: the new runtime is built
 *     and installed in a single slot swap, then the previously-active
 *     runtime is torn down in the background so existing logger
 *     references keep working without modification.
 *   - `createLogger(options?)` — return a `Logger` whose context layers
 *     on top of the current root configuration.
 *   - `getRootLogger()` — singleton root logger created on first access.
 *
 * Behavior before `configureLogging()` is called is identical to a
 * `configureLogging({})` invocation: env-unknown defaults (`warn`+),
 * a single `NoopTransport`, and direct transport fan-out from the
 * dispatcher. All emissions return synchronously and never throw.
 *
 * Vendor-neutrality: this module imports no observability-vendor SDK.
 * The dispatcher fans sanitized + redacted events directly to the
 * `SafeTransport`-wrapped consumer transports stored on the active
 * `ConfiguredRuntime`. There is no telemetry backend in the v1
 * default path; future vendor adapters are peer transports.
 */

import {
  breadcrumbFail,
  CAUSES_KEY,
  extractCauseChain,
  MAX_CAUSE_DEPTH,
} from '../breadcrumbs/breadcrumb-buffer.js';
import { mergeContexts } from '../context/context-merge.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';
import { dispatch } from '../pipeline/dispatcher.js';
import { buildLogEvent } from '../pipeline/event-builder.js';
import { passesLevelFilter } from '../pipeline/level-filter.js';
import {
  buildConfiguredRuntime,
  type ConfiguredRuntime,
  shutdownRuntime,
} from '../runtime/configured-runtime.js';
import { getActiveRuntime, installRuntime } from '../runtime/runtime-ref.js';
import { normalizeTraceContext } from '../trace/validate.js';
import type {
  Attributes,
  CreateLoggerOptions,
  LogContext,
  Logger,
  LoggerConfig,
  LogLevel,
} from './types.js';

let rootLogger: Logger | undefined;

/**
 * Build a fresh `ConfiguredRuntime` from `config`, install it as the
 * active runtime, and shut down the previously-active runtime's
 * transports in the background. The runtime-slot swap is atomic:
 * retained `Logger` references that read through `getActiveRuntime()`
 * at emit time see the new runtime immediately.
 */
function installState(config: LoggerConfig): ConfiguredRuntime {
  const runtime = buildConfiguredRuntime(config);

  // Atomic active-runtime swap. After this assignment retained
  // Logger references see the new runtime; the old runtime's
  // transports continue to flush + shutdown in the background.
  const previousRuntime = installRuntime(runtime);

  // Fire-and-forget teardown of the previous runtime. Each transport's
  // flush/shutdown is already isolated by SafeTransport; the
  // `.then(undefined, …)` is a final unhandled-rejection swallow per
  // the no-throw invariant.
  if (previousRuntime !== undefined) {
    void shutdownRuntime(previousRuntime).then(undefined, () => undefined);
  }
  return runtime;
}

/** Lazily install safe defaults so pre-configure emissions just work. */
function ensureState(): ConfiguredRuntime {
  let runtime = getActiveRuntime();
  if (runtime === undefined) {
    runtime = installState({});
  }
  return runtime;
}

/**
 * Install or replace the package's configuration. Safe to call multiple
 * times — the previous runtime's transports are flushed + shut down
 * (fire-and-forget) and the new configuration is installed via an
 * atomic active-runtime-slot swap, so existing logger references
 * continue to work without re-acquisition.
 *
 * Per FR-031 / SC-012, the swap is observable to any subsequent emit
 * from a retained `Logger` reference: emit reads through
 * `getActiveRuntime()` at the time of the call, so the new runtime is
 * live for the very next emission.
 *
 * Per FR-032 the call is the single explicit named API for installing
 * a runtime. There is no implicit module-load side effect that
 * replaces the runtime; only an explicit `configureLogging()`
 * invocation can swap it.
 */
export function configureLogging(config: LoggerConfig): void {
  installState(config);
}

/**
 * Create a logger whose context layers on top of the current root
 * configuration. The returned logger holds no captured state — every
 * emission reads the *current* module-scoped configuration, so calling
 * `configureLogging()` later affects loggers already created.
 */
export function createLogger(options: CreateLoggerOptions = {}): Logger {
  return makeLogger(options, []);
}

/** Singleton root logger created on first access. */
export function getRootLogger(): Logger {
  if (rootLogger === undefined) {
    rootLogger = createLogger();
  }
  return rootLogger;
}

function makeLogger(
  options: CreateLoggerOptions,
  chainedContexts: ReadonlyArray<Partial<LogContext>>,
): Logger {
  // Per-logger context, including the optional `module` shortcut. If both
  // `options.module` and `options.context.module` are set, the explicit
  // `options.module` shortcut wins because it is appended last to the
  // merge precedence chain.
  const loggerContextLayers: ReadonlyArray<Partial<LogContext>> = [
    options.context ?? {},
    options.module !== undefined ? { module: options.module } : {},
  ];

  function emit(
    level: LogLevel,
    message: string,
    attributes?: Attributes,
    errorValue?: unknown,
  ): void {
    const runtime = ensureState();
    const cfg = runtime.config;

    // Level filter — runs first so a filtered-out emission performs no
    // work beyond a constant-time numeric comparison.
    if (!passesLevelFilter(level, options.level, cfg.level)) {
      return;
    }

    // Root identity carried at the LoggerConfig top level becomes the
    // lowest-precedence layer; per-logger / child / correlation override.
    const rootIdentity: Partial<LogContext> = {};
    if (cfg.application !== undefined) {
      rootIdentity.application = cfg.application;
    }
    if (cfg.module !== undefined) {
      rootIdentity.module = cfg.module;
    }
    if (cfg.environment !== undefined) {
      rootIdentity.environment = cfg.environment;
    }

    // Invoke correlation() inside a guard so a throwing callback drops
    // its contribution for this event but does not drop the event.
    let correlation: Partial<LogContext> | undefined;
    if (cfg.correlation !== undefined) {
      try {
        correlation = cfg.correlation();
      } catch (err) {
        safeNotify(
          cfg.onInternalError,
          wrapAsPackageError(
            'correlation_failed',
            'correlation() callback threw; its output is dropped for this event.',
            err,
          ),
        );
      }
    }

    // Documented merge precedence (data-model.md, contracts/logger-config.md
    // LC-7): root → per-logger → child chain → correlation. The prior code
    // had `chainedContexts` BEFORE `loggerContextLayers`, which caused a
    // per-logger `module` identity to win over a `.child({ module: ... })`
    // override (locked as a regression by T053).
    const context = mergeContexts(
      rootIdentity,
      cfg.context,
      ...loggerContextLayers,
      ...chainedContexts,
      correlation,
    );

    // Fail-closed trace-context validation (once per emit, before sanitize/
    // redact). Invalid/absent trace ⇒ no `trace` field; never throws.
    if (context.trace !== undefined) {
      const normalized = normalizeTraceContext(context.trace);
      if (normalized === undefined) {
        delete context.trace;
      } else {
        context.trace = normalized;
      }
    }

    const event = buildLogEvent({
      level,
      message,
      attributes,
      context,
      errorValue,
    });

    // Error-breadcrumbs cause chain (Feature 016) — opt-in, off by default.
    // Write the bounded, cycle-safe cause chain into attributes BEFORE dispatch
    // so the existing sanitizer + redactor process it like any attribute.
    if (
      cfg.breadcrumbs !== undefined &&
      level === 'error' &&
      errorValue !== undefined
    ) {
      try {
        const causes = extractCauseChain(errorValue, MAX_CAUSE_DEPTH);
        if (causes.length > 0) {
          event.attributes[CAUSES_KEY] =
            causes as unknown as Attributes[string];
        }
      } catch (err) {
        breadcrumbFail(cfg.onInternalError, err);
      }
    }

    // Route through the locked pipeline order in src/pipeline/dispatcher.ts:
    //   Sanitize → URLScrub → Redact → ControlCharGuard → Freeze →
    //   direct transport fan-out. The dispatcher owns its own try/catch
    //   around every stage and around every transport.send() call, so no
    //   error can escape into this caller.
    dispatch(event, cfg);
  }

  return {
    debug(message, attributes) {
      emit('debug', message, attributes);
    },
    info(message, attributes) {
      emit('info', message, attributes);
    },
    warn(message, attributes) {
      emit('warn', message, attributes);
    },
    error(message, attributes, errorValue) {
      emit('error', message, attributes, errorValue);
    },
    child(context) {
      return makeLogger(options, [...chainedContexts, context]);
    },
    withContext(context) {
      return makeLogger(options, [...chainedContexts, context]);
    },
  };
}
