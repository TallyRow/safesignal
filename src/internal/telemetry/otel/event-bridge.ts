/**
 * Custom `LogRecordProcessor` that bridges OTel-emitted `LogRecord`s back
 * to the package's canonical `LogEvent` and fans them out to the configured
 * transports.
 *
 * This is the seam through which our pipeline output reaches transports
 * when `OtelLogsBackend` is the active backend. Sanitization and redaction
 * have ALREADY happened upstream of `Logger.emit()`, so the bridge receives
 * a record whose pass-through `LogEvent` is safe to forward unmodified.
 *
 * This file is one of the THREE places `@opentelemetry/*` imports are
 * permitted (T014 enforces).
 */

import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';

import type { LogEvent, Transport } from '../../../api/types.js';
import { fromLogRecord } from './mapping.js';

export class EventBridge implements LogRecordProcessor {
  private transports: ReadonlyArray<Transport>;

  constructor(transports: ReadonlyArray<Transport>) {
    this.transports = transports;
  }

  onEmit(logRecord: SdkLogRecord): void {
    const event: LogEvent = fromLogRecord(logRecord);
    for (const transport of this.transports) {
      try {
        const result = transport.send(event);
        if (result instanceof Promise) {
          // SafeTransport (T011) will own this properly; defense-in-depth
          // here keeps FS-11 honored when transports aren't yet wrapped.
          result.then(undefined, () => undefined);
        }
      } catch {
        // Continue to the next transport so a single failure does not
        // suppress delivery to surviving transports (FS-11).
      }
    }
  }

  async forceFlush(): Promise<void> {
    // Nothing to flush — the bridge is pass-through.
  }

  async shutdown(): Promise<void> {
    this.transports = [];
  }
}
