/**
 * `ConfiguredRuntime` — the shared package-level runtime resource
 * produced by `configureLogging()`.
 *
 * Architectural role (per `plan.md` "Runtime Scale Architecture" and
 * constitution v1.2.0 Principle VII): every `Logger` handle reads
 * this runtime at emit time. Logger handles are cheap, side-effect-
 * free context objects; the expensive state (normalized config,
 * already-wrapped `SafeTransport[]`, redactor, sanitizer limits,
 * `onInternalError` sink, correlation hook) lives once here and is
 * shared across every logger derived from a single
 * `configureLogging()` invocation.
 *
 * Per `plan.md`'s "Vendor-Neutral Core Architecture", this record
 * has **no `backend` field**. The dispatcher (`pipeline/dispatcher.ts`)
 * fans events out directly to the `SafeTransport`-wrapped transports
 * stored here; there is no telemetry-backend indirection on the v1
 * default path. Future vendor adapters are peer transports, not a
 * resurrected backend slot.
 *
 * The build/shutdown helpers here are pure with respect to the
 * `runtime-ref` slot — they construct + tear down a runtime
 * instance but never touch the active-runtime pointer. The slot
 * swap is performed by `runtime-ref.ts::installRuntime()` so the
 * two responsibilities stay separate.
 */

import type {
  LogContext,
  LoggerConfig,
  Redactor,
  SanitizerLimits,
  Transport,
} from '../api/types.js';
import { type NormalizedConfig, normalizeConfig } from '../config/config.js';
import { NoopTransport } from '../transport/noop-transport.js';
import { SafeTransport } from '../transport/safe-transport.js';

export interface ConfiguredRuntime {
  /**
   * The normalized configuration. `transports` here is the same
   * already-wrapped array exposed on this record's top-level
   * `transports` field; keep both pointers stable for future
   * read-paths that prefer one or the other.
   */
  readonly config: NormalizedConfig;

  /**
   * Already-`SafeTransport`-wrapped transports. Each one is isolated
   * for sync throws and rejected Promises (see `SafeTransport`).
   * Empty consumer transport lists are auto-replaced with a single
   * `NoopTransport()` per the documented default in
   * `contracts/failure-safety.md`.
   */
  readonly transports: ReadonlyArray<Transport>;

  /** Custom redactor; `undefined` falls back to the default in the redact stage. */
  readonly redactor: Redactor | undefined;

  /** Effective sanitizer bounds (clamped to documented Min..Max at normalize time). */
  readonly sanitizerLimits: SanitizerLimits;

  /** Diagnostics hook. Always defined (defaults to a no-op silent sink). */
  readonly onInternalError: (err: Error) => void;

  /** Per-emit dynamic context hook. Optional. Synchronous. */
  readonly correlation: (() => Partial<LogContext>) | undefined;
}

/**
 * Build a fresh `ConfiguredRuntime` from a consumer `LoggerConfig`.
 * Normalizes the config (clamps sanitizer limits, resolves level
 * from env defaults, etc.), wraps every consumer transport in
 * `SafeTransport`, and installs the auto-`NoopTransport` fallback
 * for empty transport lists. Pure with respect to the active-
 * runtime slot — call `runtime-ref.ts::installRuntime()` to make
 * the returned record active.
 */
export function buildConfiguredRuntime(
  config: LoggerConfig,
): ConfiguredRuntime {
  const normalized = normalizeConfig(config);

  // Empty consumer transport list → auto-NoopTransport per
  // `contracts/failure-safety.md` "no transport configured" row.
  const sourceTransports: ReadonlyArray<Transport> =
    normalized.transports.length === 0
      ? [NoopTransport()]
      : normalized.transports;

  const wrapped: ReadonlyArray<Transport> = sourceTransports.map(
    (t) => new SafeTransport(t, normalized.onInternalError),
  );

  // Re-build the normalized config with the wrapped transports so
  // downstream code that reads `config.transports` (the dispatcher's
  // direct transport fan-out) sees the wrapped list.
  const installedConfig: NormalizedConfig = {
    ...normalized,
    transports: wrapped,
  };

  return {
    config: installedConfig,
    transports: wrapped,
    redactor: normalized.redactor,
    sanitizerLimits: normalized.sanitizerLimits,
    onInternalError: normalized.onInternalError,
    correlation: normalized.correlation,
  };
}

/**
 * Best-effort teardown of a previously-active `ConfiguredRuntime`.
 * Calls `flush()` then `shutdown()` on every transport, each
 * isolated in its own try/catch so a single transport's failure
 * cannot block sibling teardown. `SafeTransport` already wraps each
 * transport's `flush`/`shutdown` and routes errors through the
 * `onInternalError` sink (with the per-transport notice budget),
 * so the try/catch here is a belt-and-suspenders guard for any
 * residual throw that escapes the wrapper.
 *
 * Pure with respect to the active-runtime slot — the caller is
 * responsible for first swapping the slot via
 * `runtime-ref.ts::installRuntime()` before invoking this
 * function, so retained `Logger` references already see the new
 * runtime when teardown begins.
 */
export async function shutdownRuntime(
  runtime: ConfiguredRuntime,
): Promise<void> {
  for (const transport of runtime.transports) {
    if (transport.flush !== undefined) {
      try {
        await transport.flush();
      } catch {
        // SafeTransport already notified onInternalError.
      }
    }
    if (transport.shutdown !== undefined) {
      try {
        await transport.shutdown();
      } catch {
        // SafeTransport already notified onInternalError.
      }
    }
  }
}
