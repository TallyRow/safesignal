/**
 * Internal telemetry-backend interface. The pipeline talks to backends
 * through this contract only — it never imports `@opentelemetry/*` directly.
 *
 * Implementations:
 *   - `NoopBackend`        — pure direct-forward, no telemetry framework.
 *                            Used as the fallback when OTel init fails.
 *   - `OtelLogsBackend`    — translates `LogEvent` ↔ OTel LogRecord and
 *                            routes via a `LoggerProvider`. Lands in T010.
 *
 * Swapping backends MUST NOT weaken security guarantees, because sanitization
 * and redaction live *upstream* of `handle()` in the pipeline (per
 * `plan.md §Security Architecture`).
 */

import type { LogEvent } from '../../api/types.js';
import type { NormalizedConfig } from '../../config/config.js';

export interface TelemetryBackend {
  /**
   * Initialize the backend with the normalized configuration. May be called
   * more than once across the lifetime of a process (re-configuration is
   * permitted by `configureLogging()`). Implementations MUST NOT throw to
   * the caller; failures should be surfaced via `config.onInternalError`.
   */
  init(config: NormalizedConfig): void;

  /**
   * Handle a fully-processed `LogEvent` (sanitized, URL-scrubbed, redacted,
   * control-char-escaped, optionally frozen in dev builds). Implementations
   * SHOULD forward the event to the configured transports. MUST NOT mutate
   * the event. SHOULD NOT throw — the dispatcher provides an outer
   * try/catch, but throwing here causes a fallback delivery path to run.
   */
  handle(event: LogEvent): void;

  /**
   * Release any resources held by the backend. Idempotent. MUST NOT throw
   * to the caller — failures route through `onInternalError`. Called by
   * `configureLogging()` when re-configuring and by an optional public
   * shutdown API in later tasks.
   */
  shutdown(): Promise<void>;
}
