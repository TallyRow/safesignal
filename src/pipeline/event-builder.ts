/**
 * Event builder — packages the inputs that the logger has already merged
 * into the canonical `LogEvent` shape.
 *
 * Responsibilities:
 *   - Assign `timestamp` from `new Date().toISOString()`. Consumer-supplied
 *     timestamps are NOT accepted (per `contracts/log-event.md` LE-11).
 *   - Default `attributes` to `{}`.
 *   - Reduce an `unknown` error value to the documented `ErrorInfo` shape
 *     (`{ name, message, stack? }`) — never holds onto the raw `Error`.
 *
 * The builder does NOT perform sanitization, redaction, URL scrubbing,
 * or control-char escaping. Those are separate pipeline stages that land
 * in Phase 5 (T031, T032, T034, T035).
 */

import type {
  Attributes,
  ErrorInfo,
  LogContext,
  LogEvent,
  LogLevel,
} from '../api/types.js';
import type { ResolvedSerializeErrorsLimits } from '../config/config.js';
import { serializeError } from '../errors/serialize-error.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';

export interface BuildLogEventInput {
  level: LogLevel;
  message: string;
  attributes: Attributes | undefined;
  context: LogContext;
  /** Raw caught value from `logger.error(msg, attrs, err)`; reduced to `ErrorInfo`. */
  errorValue: unknown;
  /**
   * Resolved deep-error-serialization limits (Feature 023), or undefined
   * when the feature is off (default) — in which case `reduceError` runs
   * exactly as before.
   */
  serializeErrors?: ResolvedSerializeErrorsLimits | undefined;
  /** Diagnostics hook for contained serialization failures (Feature 023). */
  onInternalError?: ((err: Error) => void) | undefined;
}

/** Build a canonical `LogEvent` from already-merged inputs. */
export function buildLogEvent(input: BuildLogEventInput): LogEvent {
  const event: LogEvent = {
    timestamp: new Date().toISOString(),
    level: input.level,
    message: input.message,
    attributes: input.attributes ?? {},
    context: input.context,
  };
  if (input.errorValue !== undefined) {
    event.error = reduceErrorWithConfig(input);
  }
  return event;
}

/**
 * Reduce the raw error value: deep serialization (Feature 023) when enabled,
 * else the documented flat `reduceError`. Fail-safe per ES-8: any throw from
 * deep serialization is contained, the event still carries the flat
 * reduction, and `onInternalError` receives `error_serialize_failed`.
 */
function reduceErrorWithConfig(input: BuildLogEventInput): ErrorInfo {
  if (input.serializeErrors === undefined) {
    return reduceError(input.errorValue);
  }
  try {
    return serializeError(
      input.errorValue,
      input.serializeErrors,
      input.onInternalError,
    );
  } catch (err) {
    if (input.onInternalError !== undefined) {
      safeNotify(
        input.onInternalError,
        wrapAsPackageError(
          'error_serialize_failed',
          'deep error serialization threw; event delivered with flat error info.',
          err,
        ),
      );
    }
    return reduceError(input.errorValue);
  }
}

/**
 * Reduce any `unknown` error value to the documented `ErrorInfo` shape.
 * Non-Error inputs are coerced to `{ name: 'NonError', message: String(value) }`.
 * Exported for unit-testability and for any future pipeline stage that
 * needs to re-reduce an error value (the dispatcher does not today).
 */
export function reduceError(value: unknown): ErrorInfo {
  if (value instanceof Error) {
    const info: ErrorInfo = { name: value.name, message: value.message };
    if (value.stack !== undefined) info.stack = value.stack;
    return info;
  }
  return { name: 'NonError', message: String(value) };
}
