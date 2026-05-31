/**
 * `TelemetryBackend` implementation backed by OpenTelemetry Logs SDK.
 *
 * Architecture:
 *   - `init(config)` constructs a `LoggerProvider`, attaches our internal
 *     `EventBridge` as its only `LogRecordProcessor`, and obtains a Logger.
 *   - `handle(event)` maps the canonical `LogEvent` to an OTel `LogRecord`
 *     and calls `logger.emit(record)`. The bridge then forwards the event
 *     to the configured transports.
 *   - **Init failure** falls back to a `NoopBackend` (transports still
 *     receive every event) and reports the failure via `onInternalError`.
 *     This satisfies Principle III (no propagated throws) and the plan's
 *     mitigation #4 for the experimental OTel Logs API.
 *   - **Runtime emission failure** routes the affected event through the
 *     same `NoopBackend` fallback, so a buggy OTel SDK update can't break
 *     downstream delivery.
 *
 * This file is one of the THREE places `@opentelemetry/*` imports are
 * permitted (T014 enforces).
 */

import type { Logger } from '@opentelemetry/api-logs';
import { LoggerProvider } from '@opentelemetry/sdk-logs';

import type { LogEvent } from '../../../api/types.js';
import type { NormalizedConfig } from '../../../config/config.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../../errors/internal-errors.js';
import type { TelemetryBackend } from '../backend.js';
import { NoopBackend } from '../noop-backend.js';
import { EventBridge } from './event-bridge.js';
import { toLogRecord } from './mapping.js';

const LOGGER_NAME = 'frontend-logging-sdk';

export class OtelLogsBackend implements TelemetryBackend {
  private logger: Logger | undefined;
  private provider: LoggerProvider | undefined;
  private bridge: EventBridge | undefined;
  /**
   * Always-initialized fallback. Active when `useFallback` is true (either
   * because init failed, or as a per-event escape hatch on emission error).
   */
  private readonly fallback: NoopBackend = new NoopBackend();
  private useFallback = false;
  private onInternalError: (err: Error) => void = () => undefined;
  private notifiedRuntimeFailure = false;

  init(config: NormalizedConfig): void {
    this.onInternalError = config.onInternalError;
    // Always prime the fallback so a runtime emission error has a working
    // delivery path with zero additional setup cost.
    this.fallback.init(config);

    try {
      this.bridge = new EventBridge(config.transports);
      this.provider = new LoggerProvider();
      this.provider.addLogRecordProcessor(this.bridge);
      this.logger = this.provider.getLogger(LOGGER_NAME);
      this.useFallback = false;
    } catch (err) {
      this.useFallback = true;
      safeNotify(
        this.onInternalError,
        wrapAsPackageError(
          'backend_init_failed',
          'OtelLogsBackend init failed; falling back to NoopBackend.',
          err,
        ),
      );
    }
  }

  handle(event: LogEvent): void {
    if (this.useFallback || this.logger === undefined) {
      this.fallback.handle(event);
      return;
    }
    try {
      this.logger.emit(toLogRecord(event));
    } catch (err) {
      // Per-event fallback. Notify once per session to avoid log spam.
      if (!this.notifiedRuntimeFailure) {
        this.notifiedRuntimeFailure = true;
        safeNotify(
          this.onInternalError,
          wrapAsPackageError(
            'backend_handle_failed',
            'OtelLogsBackend.handle threw; delivering this event directly to transports via the NoopBackend fallback. Future events will retry OTel emission. This notice fires once per session.',
            err,
          ),
        );
      }
      this.fallback.handle(event);
    }
  }

  async shutdown(): Promise<void> {
    // Always shut down the fallback so its (shared) transports are released.
    await this.fallback.shutdown();
    if (this.provider !== undefined) {
      try {
        await this.provider.shutdown();
      } catch (err) {
        safeNotify(
          this.onInternalError,
          wrapAsPackageError(
            'backend_init_failed',
            'OtelLogsBackend.shutdown failed.',
            err,
          ),
        );
      }
    }
    this.logger = undefined;
    this.provider = undefined;
    this.bridge = undefined;
  }
}
