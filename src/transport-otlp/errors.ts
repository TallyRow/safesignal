/**
 * Subpath-owned diagnostic error class + rate-limited notice helper for
 * the OTLP transport.
 *
 * Drop/diagnostic notices fired by the OTLP transport are `OtlpError`
 * instances (a subclass of `Error`) owned by this subpath — by-convention
 * compatible with the core's `PackageError` shape (`.code`,
 * `.transportName`, optional `.cause`) but with NO runtime import from
 * `src/internal/**` (TO-7). This module is INTERNAL to the subpath;
 * `src/transport-otlp/index.ts` does not re-export it. The
 * `onInternalError` hook receives the instance typed as `Error`.
 *
 * **Security (FR-009 / TO-6)**: notice messages MUST NEVER include any
 * configured request-header value. The helpers here only ever build
 * messages from the failure code, the transport name, and an optional
 * non-secret detail string supplied by the caller. Callers MUST NOT pass
 * header values into `detail`.
 *
 * Specs: `specs/007-transport-otlp/data-model.md` § OtlpFailureCode;
 * `contracts/transport-otlp-public-api.md` TO-4/TO-6.
 */

/**
 * Documented `OtlpError.code` values — one per failure class. Surfaced to
 * the consumer as `err.code` on the `Error`-shaped `onInternalError`
 * argument. Each is rate-limited to one notice per class per transport
 * instance per session.
 */
export type OtlpFailureCode =
  | 'oversized_event'
  | 'buffer_overflow'
  | 'delivery_unavailable'
  | 'send_failed'
  | 'partial_rejection'
  | 'serialize_failed'
  | 'shutdown_failed';

/**
 * Subclass of `Error` carrying a discriminating `.code`, the originating
 * transport's `.transportName`, and an optional `.cause` chain. `.name`
 * is `'OtlpError'`. `.cause` follows the ES2022 convention (absent when
 * not provided rather than `undefined`).
 */
export class OtlpError extends Error {
  readonly code: OtlpFailureCode;
  readonly transportName: string;
  declare readonly cause?: unknown;

  constructor(
    code: OtlpFailureCode,
    transportName: string,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'OtlpError';
    this.code = code;
    this.transportName = transportName;
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: cause,
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
  }
}

/** Type guard for `OtlpError` instances. */
export function isOtlpError(value: unknown): value is OtlpError {
  return value instanceof OtlpError;
}

/**
 * Minimal shape the `notifyOnce` helper needs: the transport's name, the
 * consumer error sink, and a per-code "already notified" ledger. The
 * concrete `OtlpTransportState` (data-model) satisfies this.
 */
export interface NotifyContext {
  readonly name: string;
  readonly onInternalError: (err: Error) => void;
  readonly notified: Record<OtlpFailureCode, boolean>;
}

/**
 * Emit at most ONE diagnostic notice per failure `code` per context
 * (instance) per session (FR-010). Subsequent calls with the same code are
 * silently suppressed. The `onInternalError` callback is invoked inside a
 * try/catch so a throwing consumer handler can never propagate back into
 * the transport's hot path (Principle II).
 *
 * `detail` is an optional NON-SECRET human string (e.g. an HTTP status).
 * Callers MUST NOT pass any configured header/secret value here.
 */
export function notifyOnce(
  ctx: NotifyContext,
  code: OtlpFailureCode,
  message: string,
  cause?: unknown,
): void {
  if (ctx.notified[code]) return;
  ctx.notified[code] = true;
  const err = new OtlpError(
    code,
    ctx.name,
    `otlp transport '${ctx.name}': ${message}`,
    cause,
  );
  try {
    ctx.onInternalError(err);
  } catch {
    // A throwing consumer error handler must never reach the caller.
  }
}

/** Build the per-instance "already notified" ledger with all flags false. */
export function freshNotifiedLedger(): Record<OtlpFailureCode, boolean> {
  return {
    oversized_event: false,
    buffer_overflow: false,
    delivery_unavailable: false,
    send_failed: false,
    partial_rejection: false,
    serialize_failed: false,
    shutdown_failed: false,
  };
}
