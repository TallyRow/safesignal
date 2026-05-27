/**
 * Public logger factories and root configuration flow.
 *
 *   - `configureLogging(config)` — install (or replace) the package's
 *     module-scoped configuration. Atomic: shuts down the previous
 *     backend, then installs the new config in a single assignment so
 *     existing logger references keep working without modification.
 *   - `createLogger(options?)` — return a `Logger` whose context layers
 *     on top of the current root configuration.
 *   - `getRootLogger()` — singleton root logger created on first access.
 *
 * Behavior before `configureLogging()` is called is identical to a
 * `configureLogging({})` invocation: env-unknown defaults (`warn`+),
 * a single `NoopTransport`, and the documented internal backend
 * initialized against that empty config. All emissions return
 * synchronously and never throw.
 *
 * Pipeline status: T016 calls `backend.handle(event)` directly with an
 * inline-built `LogEvent`. T017 extracts event construction into
 * `src/pipeline/event-builder.ts` and `src/pipeline/level-filter.ts`,
 * and T018 introduces `src/pipeline/dispatcher.ts` with named
 * pass-through seams for the security stages that land in Phase 5.
 */

import { mergeContexts } from '../context/context-merge.js';
import type { TelemetryBackend } from '../internal/telemetry/backend.js';
import { OtelLogsBackend } from '../internal/telemetry/otel/otel-backend.js';
import { safeNotify, wrapAsPackageError } from '../internal/errors/internal-errors.js';
import { dispatch } from '../pipeline/dispatcher.js';
import { buildLogEvent } from '../pipeline/event-builder.js';
import { passesLevelFilter } from '../pipeline/level-filter.js';
import {
  type ConfiguredRuntime,
  buildConfiguredRuntime,
  shutdownRuntime,
} from '../runtime/configured-runtime.js';
import {
  getActiveRuntime,
  installRuntime,
} from '../runtime/runtime-ref.js';
import type {
  Attributes,
  CreateLoggerOptions,
  LogContext,
  Logger,
  LoggerConfig,
  LogLevel,
} from './types.js';

/**
 * Transitional companion to the active-runtime slot exported from
 * `src/runtime/runtime-ref.ts`. The runtime slot is the single
 * source of truth for `ConfiguredRuntime`; this companion holds the
 * `TelemetryBackend` instance that the dispatcher still needs as a
 * `backend.handle()` target until T066 refactors the dispatcher to
 * direct `SafeTransport[]` fan-out.
 *
 * T058 keeps backend out of `ConfiguredRuntime` (per plan.md's
 * "Vendor-Neutral Core Architecture") while preserving the existing
 * runtime behavior. T066 drops this slot entirely.
 */
let backendSlot: TelemetryBackend | undefined;
let rootLogger: Logger | undefined;

/**
 * Build a fresh `ConfiguredRuntime` from `config`, install it as the
 * active runtime, build + init the companion backend, and shut down
 * the previously-active runtime + backend in the background. The
 * runtime-slot swap is atomic: retained `Logger` references that
 * read through `getActiveRuntime()` at emit time see the new
 * runtime immediately.
 */
function installState(config: LoggerConfig): ConfiguredRuntime {
  const runtime = buildConfiguredRuntime(config);

  // Atomic active-runtime swap. After this assignment retained
  // Logger references see the new runtime; the old runtime's
  // transports continue to flush + shutdown in the background.
  const previousRuntime = installRuntime(runtime);
  const previousBackend = backendSlot;

  const backend: TelemetryBackend = new OtelLogsBackend();
  backend.init(runtime.config);
  backendSlot = backend;

  // Fire-and-forget teardown of the previous state. Each transport's
  // flush/shutdown is already isolated by SafeTransport; the backend's
  // own shutdown has internal try/catch. The `.then(undefined, …)` is
  // a final unhandled-rejection swallow per the no-throw invariant.
  if (previousRuntime !== undefined) {
    void shutdownRuntime(previousRuntime).then(undefined, () => undefined);
  }
  if (previousBackend !== undefined) {
    void previousBackend.shutdown().then(undefined, () => undefined);
  }
  return runtime;
}

/** Lazily install safe defaults so pre-configure emissions just work. */
function ensureState(): { runtime: ConfiguredRuntime; backend: TelemetryBackend } {
  let runtime = getActiveRuntime();
  if (runtime === undefined || backendSlot === undefined) {
    runtime = installState({});
  }
  // Non-null assertion: `installState` always sets `backendSlot`.
  return { runtime, backend: backendSlot! };
}

/**
 * Install or replace the package's configuration. Safe to call multiple
 * times — the previous runtime's transports are flushed + shut down and
 * the previous backend is shut down (both fire-and-forget) and the new
 * configuration is installed via an atomic active-runtime-slot swap, so
 * existing logger references continue to work without re-acquisition.
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
    const { runtime, backend } = ensureState();
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

    const event = buildLogEvent({
      level,
      message,
      attributes,
      context,
      errorValue,
    });

    // Route through the locked pipeline order in src/pipeline/dispatcher.ts:
    //   Sanitize → URLScrub → Redact → ControlCharGuard → Freeze → backend.
    // The dispatcher owns its own try/catch around every stage and around
    // backend.handle, so no error can escape into this caller. T066 will
    // drop the `backend` argument once the dispatcher fans events out
    // directly to the wrapped transports stored on `runtime.transports`.
    dispatch(event, cfg, backend);
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
