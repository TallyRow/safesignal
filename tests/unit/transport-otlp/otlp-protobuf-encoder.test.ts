/**
 * T005 [US1] — Unit tests for the hand-built OTLP protobuf encoder
 * (PE-1..PE-7, R1, R5).
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent } from '../../../src/api/types.js';
import { encodeProtobuf } from '../../../src/transport-otlp/otlp-protobuf-encoder.js';
import type {
  OtlpLogRecord,
  OtlpLogsRequest,
} from '../../../src/transport-otlp/otlp-serializer.js';
import { serializeBatch } from '../../../src/transport-otlp/otlp-serializer.js';

const FALLBACK = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: {},
    ...overrides,
  };
}

/** Build a minimal valid OtlpLogsRequest with one LogRecord. */
function minimalRequest(overrides?: Partial<LogEvent>): OtlpLogsRequest {
  return serializeBatch([event(overrides)], FALLBACK);
}

/** Build a bare LogRecord manually (independent of serializeBatch). */
function bareRecord(overrides: Partial<OtlpLogRecord> = {}): OtlpLogRecord {
  return {
    timeUnixNano: String(FALLBACK * 1_000_000),
    observedTimeUnixNano: String(FALLBACK * 1_000_000),
    severityNumber: 9,
    severityText: 'INFO',
    body: { stringValue: 'test' },
    attributes: [],
    ...overrides,
  };
}

/** Build a request from one or more LogRecords with empty resource. */
function requestFromRecords(records: OtlpLogRecord[]): OtlpLogsRequest {
  return {
    resourceLogs: [
      {
        resource: { attributes: [] },
        scopeLogs: [
          { scope: { name: '@tallyrow/safesignal' }, logRecords: records },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('encodeProtobuf', () => {
  // ---- PE-7 / basic shape ----

  it('returns Uint8Array for an empty request', () => {
    const bytes = encodeProtobuf({ resourceLogs: [] });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(0);
  });

  it('returns non-empty Uint8Array for a single LogRecord', () => {
    const bytes = encodeProtobuf(minimalRequest({ message: 'hello' }));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('produces more bytes for two records than one', () => {
    const req = serializeBatch(
      [event({ message: 'a' }), event({ message: 'b' })],
      FALLBACK,
    );
    const req1 = serializeBatch([event({ message: 'a' })], FALLBACK);
    expect(encodeProtobuf(req).length).toBeGreaterThan(
      encodeProtobuf(req1).length,
    );
  });

  // ---- Deterministic encoding ----

  it('produces identical bytes for identical input', () => {
    const req = minimalRequest({ message: 'deterministic' });
    const a = encodeProtobuf(req);
    const b = encodeProtobuf(req);
    expect(a).toEqual(b);
  });

  // ---- Never throws (PE-7) ----

  it('never throws with an empty resourceLogs array', () => {
    expect(() => encodeProtobuf({ resourceLogs: [] })).not.toThrow();
  });

  it('never throws with large attributes arrays', () => {
    const attrs: Record<string, number> = {};
    for (let i = 0; i < 500; i++) attrs[`k${i}`] = i;
    const req = minimalRequest({ attributes: attrs });
    expect(() => encodeProtobuf(req)).not.toThrow();
    expect(encodeProtobuf(req).length).toBeGreaterThan(0);
  });

  it('never throws on NaN timestamp (graceful handling)', () => {
    const r = bareRecord({ timeUnixNano: String(NaN) });
    const req = requestFromRecords([r]);
    expect(() => encodeProtobuf(req)).not.toThrow();
  });

  // ---- Severity levels (PE-3) ----

  it('encodes all four severity levels', () => {
    const levels = [
      ['debug', 5, 'DEBUG'],
      ['info', 9, 'INFO'],
      ['warn', 13, 'WARN'],
      ['error', 17, 'ERROR'],
    ] as const;
    for (const [, num, text] of levels) {
      const r = bareRecord({ severityNumber: num, severityText: text });
      const bytes = encodeProtobuf(requestFromRecords([r]));
      expect(bytes.length).toBeGreaterThan(0);
    }
  });

  // ---- Trace correlation (R5) ----

  const VALID_TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
  const VALID_SPAN_ID = '00f067aa0ba902b7';

  it('trace fields increase output size', () => {
    const without = bareRecord();
    const withTrace = bareRecord({
      traceId: VALID_TRACE_ID,
      spanId: VALID_SPAN_ID,
      flags: 1,
    });
    const reqWithout = requestFromRecords([without]);
    const reqWith = requestFromRecords([withTrace]);
    expect(encodeProtobuf(reqWith).length).toBeGreaterThan(
      encodeProtobuf(reqWithout).length,
    );
  });

  it('omits trace fields when traceId/spanId are absent (smaller output)', () => {
    const withTrace = bareRecord({
      traceId: VALID_TRACE_ID,
      spanId: VALID_SPAN_ID,
    });
    const without = bareRecord();
    expect(
      encodeProtobuf(requestFromRecords([withTrace])).length,
    ).toBeGreaterThan(encodeProtobuf(requestFromRecords([without])).length);
  });

  it('handles invalid traceId gracefully (omits field, no throw)', () => {
    const r = bareRecord({ traceId: 'bad', spanId: VALID_SPAN_ID });
    expect(() => encodeProtobuf(requestFromRecords([r]))).not.toThrow();
  });

  it('handles invalid spanId gracefully (omits field, no throw)', () => {
    const r = bareRecord({ traceId: VALID_TRACE_ID, spanId: 'bad' });
    expect(() => encodeProtobuf(requestFromRecords([r]))).not.toThrow();
  });

  // ---- AnyValue discriminators ----

  it('encodes stringValue', () => {
    const r = bareRecord({ body: { stringValue: 'hello world' } });
    const bytes = encodeProtobuf(requestFromRecords([r]));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('encodes boolValue true', () => {
    const r = bareRecord({ body: { boolValue: true } });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes boolValue false', () => {
    const r = bareRecord({ body: { boolValue: false } });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes intValue positive', () => {
    const r = bareRecord({ body: { intValue: '42' } });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes intValue negative', () => {
    const r = bareRecord({ body: { intValue: '-7' } });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes doubleValue', () => {
    const r = bareRecord({ body: { doubleValue: 3.14 } });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes arrayValue with values', () => {
    const r = bareRecord({
      body: {
        arrayValue: { values: [{ stringValue: 'a' }, { intValue: '1' }] },
      },
    });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('encodes kvlistValue with key-value pairs', () => {
    const r = bareRecord({
      body: {
        kvlistValue: {
          values: [
            { key: 'k1', value: { stringValue: 'v1' } },
            { key: 'k2', value: { intValue: '2' } },
          ],
        },
      },
    });
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('handles empty AnyValue object', () => {
    const r = bareRecord({ body: {} });
    expect(() => encodeProtobuf(requestFromRecords([r]))).not.toThrow();
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  // ---- Different AnyValue types produce different outputs ----

  it('produces different output for stringValue vs intValue body', () => {
    const a = encodeProtobuf(
      requestFromRecords([bareRecord({ body: { stringValue: '42' } })]),
    );
    const b = encodeProtobuf(
      requestFromRecords([bareRecord({ body: { intValue: '42' } })]),
    );
    expect(a).not.toEqual(b);
  });

  // ---- Attributes ----

  it('encodes multiple attribute KeyValue pairs', () => {
    const r = bareRecord({
      attributes: [
        { key: 'count', value: { intValue: '42' } },
        { key: 'name', value: { stringValue: 'test' } },
        { key: 'active', value: { boolValue: true } },
      ],
    });
    const bytes = encodeProtobuf(requestFromRecords([r]));
    const noAttrs = encodeProtobuf(requestFromRecords([bareRecord()]));
    expect(bytes.length).toBeGreaterThan(noAttrs.length);
  });

  // ---- Resource attributes ----

  it('includes resource attributes when present', () => {
    const req = serializeBatch(
      [
        event({
          context: { application: { name: 'svc', version: '1.0.0' } },
        }),
      ],
      FALLBACK,
    );
    const bytes = encodeProtobuf(req);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('different resources produce different outputs', () => {
    const reqA = serializeBatch(
      [event({ context: { application: { name: 'svc-a' } } })],
      FALLBACK,
    );
    const reqB = serializeBatch(
      [event({ context: { application: { name: 'svc-b' } } })],
      FALLBACK,
    );
    expect(encodeProtobuf(reqA)).not.toEqual(encodeProtobuf(reqB));
  });

  it('request without resource produces smaller output than with resource', () => {
    const withRes = serializeBatch(
      [event({ context: { application: { name: 'svc' } } })],
      FALLBACK,
    );
    const withoutRes = requestFromRecords([bareRecord()]);
    expect(encodeProtobuf(withRes).length).toBeGreaterThan(
      encodeProtobuf(withoutRes).length,
    );
  });

  // ---- Edge cases ----

  it('handles empty strings gracefully', () => {
    const r = bareRecord({
      body: { stringValue: '' },
      severityText: '',
    });
    expect(() => encodeProtobuf(requestFromRecords([r]))).not.toThrow();
    expect(encodeProtobuf(requestFromRecords([r])).length).toBeGreaterThan(0);
  });

  it('handles records with no attributes', () => {
    const bytes = encodeProtobuf(requestFromRecords([bareRecord()]));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('encodes the full pipeline via serializeBatch', () => {
    const req = serializeBatch(
      [
        event({
          message: 'hello',
          level: 'error',
          attributes: { a: 1, b: true },
          context: {
            application: { name: 'app', version: '2.0.0' },
            environment: 'production',
            trace: {
              traceId: VALID_TRACE_ID,
              spanId: VALID_SPAN_ID,
              traceFlags: 1,
            },
          },
          error: { name: 'E', message: 'boom' },
        }),
      ],
      FALLBACK,
    );
    const bytes = encodeProtobuf(req);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('empty arrayValue with no values is omitted (same as empty AnyValue)', () => {
    const empty = bareRecord({ body: {} });
    const emptyArr = bareRecord({ body: { arrayValue: { values: [] } } });
    expect(encodeProtobuf(requestFromRecords([empty]))).toEqual(
      encodeProtobuf(requestFromRecords([emptyArr])),
    );
  });

  it('empty kvlistValue is omitted (same as empty AnyValue)', () => {
    const empty = bareRecord({ body: {} });
    const emptyKv = bareRecord({ body: { kvlistValue: { values: [] } } });
    expect(encodeProtobuf(requestFromRecords([empty]))).toEqual(
      encodeProtobuf(requestFromRecords([emptyKv])),
    );
  });
});
