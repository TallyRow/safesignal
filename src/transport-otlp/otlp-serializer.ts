/**
 * Pure `LogEvent[]` → OTLP/HTTP+JSON logs payload serializer (OP-1..OP-6).
 *
 * This is the heart of the subpath. It hand-builds the OTLP logs JSON
 * shape with ZERO runtime dependencies and NO `@opentelemetry/*` import
 * (research D1, TO-7): severity numbers are literal constants matching the
 * OTel `SeverityNumber` ranges (and the in-repo
 * `src/internal/telemetry/otel/mapping.ts` table), reused conceptually but
 * never imported.
 *
 * **Encoding seam (FR-015)**: `serializeBatch(...)` builds the encoder-
 * neutral `OtlpLogsRequest` object; `encode(...)` turns it into the wire
 * body. Today the only encoder is JSON; a future protobuf encoder slots in
 * behind `encode(...)` without changing the object model or the public
 * surface.
 *
 * Specs: `specs/007-transport-otlp/contracts/otlp-payload.md`.
 */

import type { LogContext, LogEvent, LogLevel } from '../api/types.js';

import { type AnyValue, type KeyValue, toKeyValues } from './attributes.js';
import { buildResource } from './resource.js';

/** Constant instrumentation-scope name for every emitted ScopeLogs. */
export const SCOPE_NAME = '@tallyrow/safesignal';

/**
 * OTLP `SeverityNumber` base value per SafeSignal level (OP-3 / D2). These
 * are the canonical OTLP range bases (DEBUG 5, INFO 9, WARN 13, ERROR 17)
 * and match `LEVEL_TO_SEVERITY` in the internal OTel seam.
 */
const LEVEL_TO_SEVERITY_NUMBER: Readonly<Record<LogLevel, number>> = {
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
};

const LEVEL_TO_SEVERITY_TEXT: Readonly<Record<LogLevel, string>> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

// ---------------------------------------------------------------------------
// OTLP wire shapes (JSON encoding)
// ---------------------------------------------------------------------------

export interface OtlpLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: AnyValue;
  attributes: KeyValue[];
  /** W3C trace correlation — present only when `event.context.trace` is set. */
  traceId?: string;
  spanId?: string;
  flags?: number;
}

export interface OtlpScopeLogs {
  scope: { name: string };
  logRecords: OtlpLogRecord[];
}

export interface OtlpResourceLogs {
  resource: { attributes: KeyValue[] };
  scopeLogs: OtlpScopeLogs[];
}

export interface OtlpLogsRequest {
  resourceLogs: OtlpResourceLogs[];
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Convert one `LogEvent` to an OTLP `LogRecord`. Never mutates the input
 * (T-S4). Per-record attributes are: event attributes, then merged context
 * attributes under a `context.` prefix, then per-logger `module.*`
 * identity, then `exception.*` when an error is present (OP-4).
 *
 * `fallbackTimeMs` is a single resolved time used when `event.timestamp`
 * is unparseable, so the mapping never throws on a bad timestamp (OP-3).
 */
export function toLogRecord(
  event: LogEvent,
  fallbackTimeMs: number,
): OtlpLogRecord {
  const ms = toEpochMs(event.timestamp, fallbackTimeMs);
  const nano = String(ms * 1_000_000);

  const attributes: KeyValue[] = toKeyValues(event.attributes);

  const context = event.context;
  if (context.attributes !== undefined) {
    attributes.push(...toKeyValues(context.attributes, 'context.'));
  }
  pushModuleIdentity(attributes, context);
  pushException(attributes, event);

  const record: OtlpLogRecord = {
    timeUnixNano: nano,
    observedTimeUnixNano: nano,
    severityNumber: LEVEL_TO_SEVERITY_NUMBER[event.level],
    severityText: LEVEL_TO_SEVERITY_TEXT[event.level],
    body: { stringValue: event.message },
    attributes,
  };

  // W3C trace correlation → OTLP standard top-level fields (OP/OT contracts).
  // The structured ids are already lowercase-hex (validated upstream), so they
  // are the OTLP/JSON encoding as-is — no base64, no @opentelemetry import.
  const trace = context.trace;
  if (trace !== undefined) {
    record.traceId = trace.traceId;
    record.spanId = trace.spanId;
    if (trace.traceFlags !== undefined) {
      record.flags = trace.traceFlags;
    }
  }

  return record;
}

/**
 * Build the encoder-neutral OTLP logs request object for a batch. The
 * Resource is derived from the first event's runtime-global identity; if
 * the batch is empty, an empty Resource is used.
 */
export function serializeBatch(
  batch: ReadonlyArray<LogEvent>,
  fallbackTimeMs: number,
): OtlpLogsRequest {
  const first = batch[0];
  const resource = buildResource(first ? first.context : ({} as LogContext));
  const logRecords = batch.map((e) => toLogRecord(e, fallbackTimeMs));
  return {
    resourceLogs: [
      {
        resource,
        scopeLogs: [{ scope: { name: SCOPE_NAME }, logRecords }],
      },
    ],
  };
}

/**
 * Encoding seam (FR-015). Turns the request object into the wire body.
 * The only encoding in this feature is JSON; protobuf is a roadmap
 * follow-up that slots in here without touching callers.
 */
export function encode(request: OtlpLogsRequest): string {
  return JSON.stringify(request);
}

/**
 * Convenience: build + JSON-encode a batch in one call. Pure; never
 * mutates inputs.
 */
export function serializeOtlpJson(
  batch: ReadonlyArray<LogEvent>,
  fallbackTimeMs: number,
): string {
  return encode(serializeBatch(batch, fallbackTimeMs));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEpochMs(iso: string, fallbackMs: number): number {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function pushModuleIdentity(out: KeyValue[], context: LogContext): void {
  const mod = context.module;
  if (mod === undefined) return;
  if (typeof mod.name === 'string' && mod.name.length > 0) {
    out.push({ key: 'module.name', value: { stringValue: mod.name } });
  }
  if (typeof mod.version === 'string' && mod.version.length > 0) {
    out.push({ key: 'module.version', value: { stringValue: mod.version } });
  }
}

function pushException(out: KeyValue[], event: LogEvent): void {
  const err = event.error;
  if (err === undefined) return;
  out.push({ key: 'exception.type', value: { stringValue: err.name } });
  out.push({ key: 'exception.message', value: { stringValue: err.message } });
  if (typeof err.stack === 'string' && err.stack.length > 0) {
    out.push({
      key: 'exception.stacktrace',
      value: { stringValue: err.stack },
    });
  }
}
