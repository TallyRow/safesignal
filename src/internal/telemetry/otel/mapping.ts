/**
 * Bidirectional mapping between the package's canonical `LogEvent` and the
 * OpenTelemetry Logs API's `LogRecord`.
 *
 * Strategy: pass the entire post-pipeline `LogEvent` through as a JSON
 * string under a single well-known attribute key. The `body`,
 * `severityNumber`, `severityText`, and `timestamp` on the emitted record
 * are also populated so OTel-native processors (future OTLP exporters,
 * collectors) see a useful record without our bridge — but our bridge
 * recovers the exact original `LogEvent` from the pass-through attribute,
 * so the round-trip is lossless.
 *
 * This file is one of the THREE places `@opentelemetry/*` imports are
 * permitted. The source-tree boundary test in T014 fails the build if any
 * other source file imports from `@opentelemetry/*`.
 */

import { type LogRecord, SeverityNumber } from '@opentelemetry/api-logs';
import type { SdkLogRecord } from '@opentelemetry/sdk-logs';

import type { LogEvent, LogLevel } from '../../../api/types.js';

/**
 * Attribute key used to pass the full `LogEvent` through the OTel pipeline
 * intact. Namespaced to avoid collision with consumer attributes.
 */
export const FLSDK_EVENT_KEY = 'frontend-logging-sdk.event';

const LEVEL_TO_SEVERITY: Readonly<Record<LogLevel, SeverityNumber>> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

const SEVERITY_TO_LEVEL: Readonly<Record<number, LogLevel>> = {
  [SeverityNumber.DEBUG]: 'debug',
  [SeverityNumber.INFO]: 'info',
  [SeverityNumber.WARN]: 'warn',
  [SeverityNumber.ERROR]: 'error',
};

/**
 * Translate our `LogEvent` to an OTel `LogRecord` ready for
 * `Logger.emit(...)`. Always populates body / severity / timestamp so the
 * record is usable by OTel-native processors even without our bridge.
 */
export function toLogRecord(event: LogEvent): LogRecord {
  return {
    timestamp: parseTimestampMs(event.timestamp),
    severityNumber: LEVEL_TO_SEVERITY[event.level],
    severityText: event.level.toUpperCase(),
    body: event.message,
    attributes: {
      [FLSDK_EVENT_KEY]: JSON.stringify(event),
    },
  };
}

/**
 * Recover a `LogEvent` from the SDK `LogRecord` instance delivered to a
 * `LogRecordProcessor.onEmit(...)`. Tries the pass-through attribute
 * first; falls back to a best-effort reconstruction from body / severity
 * so the bridge still produces *something* if the record was emitted by a
 * source other than our `OtelLogsBackend`.
 */
export function fromLogRecord(record: SdkLogRecord): LogEvent {
  const attrs = record.attributes;
  const passthrough = attrs[FLSDK_EVENT_KEY];
  if (typeof passthrough === 'string') {
    try {
      const parsed = JSON.parse(passthrough) as unknown;
      if (isLogEventShape(parsed)) {
        return parsed;
      }
    } catch {
      // fall through to best-effort reconstruction
    }
  }
  return reconstruct(record);
}

function reconstruct(record: SdkLogRecord): LogEvent {
  const severity = record.severityNumber;
  const level: LogLevel =
    (severity !== undefined ? SEVERITY_TO_LEVEL[severity] : undefined) ??
    'info';

  const body = record.body;
  const message =
    typeof body === 'string' ? body : body !== undefined ? String(body) : '';

  return {
    timestamp: hrTimeToIso(record.hrTime),
    level,
    message,
    attributes: {},
    context: {},
  };
}

function parseTimestampMs(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function hrTimeToIso(hrTime: readonly [number, number]): string {
  // hrTime = [seconds, nanoseconds]
  const seconds = hrTime[0];
  const nanos = hrTime[1];
  const ms = seconds * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(ms).toISOString();
}

function isLogEventShape(value: unknown): value is LogEvent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.timestamp === 'string' &&
    typeof v.level === 'string' &&
    typeof v.message === 'string' &&
    typeof v.attributes === 'object' &&
    v.attributes !== null &&
    typeof v.context === 'object' &&
    v.context !== null
  );
}
