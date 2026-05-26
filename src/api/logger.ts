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
 * a single `NoopTransport`, and `OtelLogsBackend` initialized against
 * that empty config. All emissions return synchronously and never throw.
 *
 * Pipeline status: T016 calls `backend.handle(event)` directly with an
 * inline-built `LogEvent`. T017 extracts event construction into
 * `src/pipeline/event-builder.ts` and `src/pipeline/level-filter.ts`,
 * and T018 introduces `src/pipeline/dispatcher.ts` with named
 * pass-through seams for the security stages that land in Phase 5.
 */

import { normalizeConfig, type NormalizedConfig } from '../config/config.js';
import { mergeContexts } from '../context/context-merge.js';
import type { TelemetryBackend } from '../internal/telemetry/backend.js';
import { OtelLogsBackend } from '../internal/telemetry/otel/otel-backend.js';
import { wrapAsPackageError } from '../internal/errors/internal-errors.js';
import { dispatch } from '../pipeline/dispatcher.js';
import { buildLogEvent } from '../pipeline/event-builder.js';
import { passesLevelFilter } from '../pipeline/level-filter.js';
import { NoopTransport } from '../transport/noop-transport.js';
import { SafeTransport } from '../transport/safe-transport.js';
import type {
  Attributes,
  CreateLoggerOptions,
  LogContext,
  Logger,
  LoggerConfig,
  LogLevel,
  Transport,
} from './types.js';

interface ModuleState {
  readonly config: NormalizedConfig;
  readonly backend: TelemetryBackend;
}

let state: ModuleState | undefined;
let rootLogger: Logger | undefined;

/** Install (or replace) the package's module-scoped state. */
function installState(config: LoggerConfig): ModuleState {
  const normalized = normalizeConfig(config);

  // Wrap every configured transport in SafeTransport so a misbehaving
  // transport can never escape into a consumer call site (FS-1, FS-2,
  // FS-11, FS-12). Empty list → NoopTransport per the contract default.
  const sourceTransports: ReadonlyArray<Transport> =
    normalized.transports.length === 0 ? [NoopTransport()] : normalized.transports;

  const wrapped: ReadonlyArray<Transport> = sourceTransports.map(
    (t) => new SafeTransport(t, normalized.onInternalError),
  );

  const installedConfig: NormalizedConfig = { ...normalized, transports: wrapped };

  const backend: TelemetryBackend = new OtelLogsBackend();
  backend.init(installedConfig);

  return { config: installedConfig, backend };
}

/** Lazily install safe defaults so pre-configure emissions just work. */
function ensureState(): ModuleState {
  if (state === undefined) {
    state = installState({});
  }
  return state;
}

/**
 * Install or replace the package's configuration. Safe to call multiple
 * times — the previous backend is shut down (fire-and-forget) and the
 * new configuration is installed in a single atomic assignment, so
 * existing logger references continue to work.
 */
export function configureLogging(config: LoggerConfig): void {
  const previous = state;
  // Atomic swap.
  state = installState(config);
  if (previous !== undefined) {
    // Fire-and-forget; failures route through the previous config's
    // onInternalError via SafeTransport / backend's own try/catch.
    void previous.backend.shutdown().then(undefined, () => undefined);
  }
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
    const current = ensureState();

    // Level filter — runs first so a filtered-out emission performs no
    // work beyond a constant-time numeric comparison.
    if (!passesLevelFilter(level, options.level, current.config.level)) {
      return;
    }

    // Root identity carried at the LoggerConfig top level becomes the
    // lowest-precedence layer; per-logger / child / correlation override.
    const rootIdentity: Partial<LogContext> = {};
    if (current.config.application !== undefined) {
      rootIdentity.application = current.config.application;
    }
    if (current.config.module !== undefined) {
      rootIdentity.module = current.config.module;
    }
    if (current.config.environment !== undefined) {
      rootIdentity.environment = current.config.environment;
    }

    // Invoke correlation() inside a guard so a throwing callback drops
    // its contribution for this event but does not drop the event.
    let correlation: Partial<LogContext> | undefined;
    if (current.config.correlation !== undefined) {
      try {
        correlation = current.config.correlation();
      } catch (err) {
        current.config.onInternalError(
          wrapAsPackageError(
            'correlation_failed',
            'correlation() callback threw; its output is dropped for this event.',
            err,
          ),
        );
      }
    }

    const context = mergeContexts(
      rootIdentity,
      current.config.context,
      ...chainedContexts,
      ...loggerContextLayers,
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
    // backend.handle, so no error can escape into this caller.
    dispatch(event, current.config, current.backend);
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
