/**
 * Internal error type with a non-enumerable symbol marker so the dispatcher
 * can distinguish package-internal errors from consumer-thrown errors
 * without losing stack info. Never exported from the public surface.
 */

const PACKAGE_ERROR_MARKER = Symbol('frontend-logging-sdk/package-error');

/**
 * Discriminator for which internal failure mode produced a `PackageError`.
 * Categorizes errors routed through `LoggerConfig.onInternalError`.
 */
export type PackageErrorCode =
  | 'transport_send_failed'
  | 'transport_init_failed'
  | 'transport_shutdown_failed'
  | 'redactor_failed'
  | 'correlation_failed'
  | 'backend_init_failed'
  | 'backend_handle_failed'
  | 'sanitizer_limit_clamped'
  | 'no_transport_configured';

export interface PackageErrorOptions {
  /** The underlying error that caused this one, if any. */
  cause?: unknown;
  /** Transport name when the failure is transport-scoped. */
  transportName?: string;
}

/**
 * Internal error class carrying a structured `code`, optional cause, and
 * optional transport name. Extends the standard `Error` so it satisfies the
 * public `onInternalError: (err: Error) => void` signature without leaking
 * any of these internal fields' types into the public surface.
 */
export class PackageError extends Error {
  readonly code: PackageErrorCode;
  readonly transportName?: string;
  // ES2022 standard Error.cause — declared so this typechecks regardless of
  // the current `lib` setting in tsconfig.
  declare cause?: unknown;

  constructor(code: PackageErrorCode, message: string, options: PackageErrorOptions = {}) {
    super(message);
    this.name = 'PackageError';
    this.code = code;
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options.transportName !== undefined) {
      this.transportName = options.transportName;
    }
    // Non-enumerable marker so `Object.keys(err)` and JSON serialization
    // don't expose the internal sentinel.
    Object.defineProperty(this, PACKAGE_ERROR_MARKER, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * Type guard for `PackageError` instances. Detects errors created by this
 * package even across realm boundaries (different bundler outputs sharing
 * the same `Symbol.for(...)` registry — note we use a module-local Symbol
 * deliberately to scope detection to instances created by *this* loaded
 * copy of the package, not other copies in module-federated environments).
 */
export function isPackageError(value: unknown): value is PackageError {
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<symbol, unknown>)[PACKAGE_ERROR_MARKER] === true;
}

/**
 * Wrap an arbitrary caught value as a `PackageError`. If `cause` is already
 * a `PackageError`, it is returned as-is so we don't lose the original
 * `code` / `transportName` from a deeper layer.
 */
export function wrapAsPackageError(
  code: PackageErrorCode,
  message: string,
  cause: unknown,
  transportName?: string,
): PackageError {
  if (isPackageError(cause)) return cause;
  const options: PackageErrorOptions = { cause };
  if (transportName !== undefined) {
    options.transportName = transportName;
  }
  return new PackageError(code, message, options);
}

/**
 * Invoke a consumer-supplied `onInternalError` callback inside an isolating
 * try/catch. Required by the constitution and the failure-safety contract:
 * NO path inside the package may propagate a throw to a consumer logging
 * call site — including throws from the diagnostics hook itself.
 *
 * This is the single helper every internal site must use when notifying
 * `onInternalError`; bare invocations are a hazard.
 */
export function safeNotify(
  onInternalError: (err: Error) => void,
  err: PackageError,
): void {
  try {
    onInternalError(err);
  } catch {
    // Consumer-supplied onInternalError threw. Nothing further we can do
    // without violating the no-throw invariant — swallow.
  }
}
