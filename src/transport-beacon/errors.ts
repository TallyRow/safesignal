/**
 * Subpath-owned diagnostic error class.
 *
 * Drop notices fired by the beacon transport are `BeaconError` instances
 * (a subclass of `Error`) owned by this subpath. They are NOT
 * `PackageError` instances and do NOT depend on the core's
 * `src/internal/errors/internal-errors.ts` module — preserving the
 * boundary in TB-11 (no runtime imports from `src/internal/**`).
 *
 * The class shape (`.code`, `.transportName`, optional `.cause`) is
 * **by-convention compatible** with `PackageError` so a consumer's
 * diagnostics handler reading `err.code` and `err.transportName` cannot
 * tell the difference between a notice emitted by `SafeTransport`
 * (a `PackageError`) and one emitted by the beacon transport
 * (a `BeaconError`).
 *
 * This module is INTERNAL to the subpath — `src/transport-beacon/index.ts`
 * does NOT re-export `BeaconError` or `BeaconErrorCode`. The
 * `onInternalError` hook receives the instance typed as `Error` per the
 * public callback signature.
 *
 * Specs: `specs/002-beacon-transport/data-model.md` § BeaconError;
 * `specs/002-beacon-transport/contracts/failure-modes.md` F-1..F-10.
 */

/**
 * Documented `BeaconError.code` values. Internal to the subpath; the
 * public consumer surface for these strings is the
 * `BeaconTransportOptions.onInternalError` callback, where the value
 * arrives as `err.code` on an `Error`-shaped argument.
 */
export type BeaconErrorCode =
  | 'oversized_event'
  | 'beacon_batch_drop'
  | 'beacon_unavailable'
  | 'transport_send_failed'
  | 'transport_shutdown_failed';

/**
 * Subclass of `Error` carrying a discriminating `.code`, the originating
 * transport's `.transportName`, and an optional `.cause` chain to the
 * underlying failure (a rejected `fetch` Promise, a thrown
 * `JSON.stringify` error, etc.).
 *
 * Construction-time invariants:
 *   - `.code` is read-only (set via `Object.defineProperty` on the class
 *     side by `readonly` + plain assignment).
 *   - `.transportName` is read-only.
 *   - `.cause` is read-only when provided (set via `Object.defineProperty`
 *     with `writable: false`, `enumerable: true`). When `cause` is
 *     `undefined`, the property is left unset — matching the ES2022
 *     `Error.cause` convention where omitted causes are absent rather
 *     than `undefined`.
 *   - `.name` is `'BeaconError'`.
 */
export class BeaconError extends Error {
  readonly code: BeaconErrorCode;
  readonly transportName: string;
  // ES2022 standard Error.cause — declared as readonly so this
  // typechecks regardless of the current `lib` setting in tsconfig and
  // so the type system reflects the runtime non-writable contract.
  declare readonly cause?: unknown;

  constructor(
    code: BeaconErrorCode,
    transportName: string,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'BeaconError';
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

/**
 * Type guard for `BeaconError` instances. Distinguishes errors created
 * by this subpath from arbitrary errors that flow through the
 * `onInternalError` callback.
 */
export function isBeaconError(value: unknown): value is BeaconError {
  return value instanceof BeaconError;
}
