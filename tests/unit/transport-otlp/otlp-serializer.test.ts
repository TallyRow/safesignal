/**
 * T010 [US1] — Unit tests for the OTLP-JSON serializer
 * (OP-1/OP-3/OP-4/OP-6, D2/D4).
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent } from '../../../src/api/types.js';
import {
  SCOPE_NAME,
  serializeBatch,
  toLogRecord,
} from '../../../src/transport-otlp/otlp-serializer.js';

const FALLBACK = 1_700_000_000_000;

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

describe('toLogRecord', () => {
  it('maps levels to the OTLP severity numbers and texts', () => {
    const cases = [
      ['debug', 5, 'DEBUG'],
      ['info', 9, 'INFO'],
      ['warn', 13, 'WARN'],
      ['error', 17, 'ERROR'],
    ] as const;
    for (const [level, num, text] of cases) {
      const r = toLogRecord(event({ level }), FALLBACK);
      expect(r.severityNumber).toBe(num);
      expect(r.severityText).toBe(text);
    }
  });

  it('converts the ISO timestamp to nanoseconds-as-string', () => {
    const ms = Date.parse('2024-05-29T00:00:00.000Z');
    const r = toLogRecord(event(), FALLBACK);
    expect(r.timeUnixNano).toBe(String(ms * 1_000_000));
    expect(r.observedTimeUnixNano).toBe(r.timeUnixNano);
  });

  it('falls back without throwing on an unparseable timestamp', () => {
    const r = toLogRecord(event({ timestamp: 'not-a-date' }), FALLBACK);
    expect(r.timeUnixNano).toBe(String(FALLBACK * 1_000_000));
  });

  it('puts the message in body.stringValue', () => {
    expect(toLogRecord(event({ message: 'hello' }), FALLBACK).body).toEqual({
      stringValue: 'hello',
    });
  });

  it('maps event attributes and prefixes merged context attributes', () => {
    const r = toLogRecord(
      event({
        attributes: { a: 1 },
        context: { attributes: { region: 'eu' } },
      }),
      FALLBACK,
    );
    expect(r.attributes).toEqual([
      { key: 'a', value: { intValue: '1' } },
      { key: 'context.region', value: { stringValue: 'eu' } },
    ]);
  });

  it('attributes module identity per-record', () => {
    const r = toLogRecord(
      event({ context: { module: { name: 'reco', version: '1.1.0' } } }),
      FALLBACK,
    );
    expect(r.attributes).toEqual([
      { key: 'module.name', value: { stringValue: 'reco' } },
      { key: 'module.version', value: { stringValue: '1.1.0' } },
    ]);
  });

  it('maps error to the standard exception.* attributes', () => {
    const r = toLogRecord(
      event({
        error: { name: 'TypeError', message: 'boom', stack: 'at x' },
      }),
      FALLBACK,
    );
    expect(r.attributes).toEqual([
      { key: 'exception.type', value: { stringValue: 'TypeError' } },
      { key: 'exception.message', value: { stringValue: 'boom' } },
      { key: 'exception.stacktrace', value: { stringValue: 'at x' } },
    ]);
  });

  it('does not mutate the input event (T-S4)', () => {
    const e = event({ attributes: { a: 1 } });
    const before = JSON.stringify(e);
    toLogRecord(e, FALLBACK);
    expect(JSON.stringify(e)).toBe(before);
  });
});

describe('serializeBatch', () => {
  it('produces one resourceLogs / one scopeLogs with the package scope name', () => {
    const req = serializeBatch(
      [
        event({
          message: 'a',
          context: { application: { name: 'svc' }, environment: 'production' },
        }),
        event({ message: 'b' }),
      ],
      FALLBACK,
    );
    expect(req.resourceLogs).toHaveLength(1);
    const rl = req.resourceLogs[0]!;
    expect(rl.scopeLogs).toHaveLength(1);
    expect(rl.scopeLogs[0]!.scope).toEqual({ name: SCOPE_NAME });
    expect(rl.scopeLogs[0]!.logRecords).toHaveLength(2);
  });

  it('derives the Resource from the first event identity', () => {
    const req = serializeBatch(
      [
        event({
          context: { application: { name: 'svc', version: '1.0.0' } },
        }),
      ],
      FALLBACK,
    );
    expect(req.resourceLogs[0]!.resource.attributes).toEqual([
      { key: 'service.name', value: { stringValue: 'svc' } },
      { key: 'service.version', value: { stringValue: '1.0.0' } },
    ]);
  });

  it('handles an empty batch with an empty Resource', () => {
    const req = serializeBatch([], FALLBACK);
    expect(req.resourceLogs[0]!.resource.attributes).toEqual([]);
    expect(req.resourceLogs[0]!.scopeLogs[0]!.logRecords).toEqual([]);
  });
});
