/**
 * T011 [US2] — Unit tests for `normalizeTraceContext` (TC-4, research D4).
 *
 * Fail-closed: require BOTH valid ids; individually omit invalid optional
 * parts; never throw.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_TRACESTATE_LEN,
  normalizeTraceContext,
} from '../../../src/trace/validate.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';

describe('normalizeTraceContext', () => {
  it('accepts a well-formed trace context', () => {
    expect(
      normalizeTraceContext({ traceId: TRACE_ID, spanId: SPAN_ID }),
    ).toEqual({ traceId: TRACE_ID, spanId: SPAN_ID });
  });

  it('keeps valid traceFlags and traceState', () => {
    expect(
      normalizeTraceContext({
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: 1,
        traceState: 'vendor=abc',
      }),
    ).toEqual({
      traceId: TRACE_ID,
      spanId: SPAN_ID,
      traceFlags: 1,
      traceState: 'vendor=abc',
    });
  });

  it('drops the whole trace when traceId is wrong length / non-hex / uppercase', () => {
    expect(
      normalizeTraceContext({ traceId: 'abc', spanId: SPAN_ID }),
    ).toBeUndefined();
    expect(
      normalizeTraceContext({
        traceId: TRACE_ID.toUpperCase(),
        spanId: SPAN_ID,
      }),
    ).toBeUndefined();
    expect(
      normalizeTraceContext({ traceId: `${'g'.repeat(32)}`, spanId: SPAN_ID }),
    ).toBeUndefined();
  });

  it('drops the whole trace when spanId is invalid (require both ids)', () => {
    expect(
      normalizeTraceContext({ traceId: TRACE_ID, spanId: 'xy' }),
    ).toBeUndefined();
    expect(normalizeTraceContext({ traceId: TRACE_ID })).toBeUndefined();
  });

  it('drops all-zero ids', () => {
    expect(
      normalizeTraceContext({ traceId: '0'.repeat(32), spanId: SPAN_ID }),
    ).toBeUndefined();
    expect(
      normalizeTraceContext({ traceId: TRACE_ID, spanId: '0'.repeat(16) }),
    ).toBeUndefined();
  });

  it('omits an out-of-range or non-integer traceFlags but keeps the ids', () => {
    for (const bad of [-1, 256, 1.5, Number.NaN, '1' as unknown]) {
      expect(
        normalizeTraceContext({
          traceId: TRACE_ID,
          spanId: SPAN_ID,
          traceFlags: bad,
        }),
      ).toEqual({ traceId: TRACE_ID, spanId: SPAN_ID });
    }
  });

  it('omits an over-bound traceState but keeps the ids', () => {
    const big = 'x'.repeat(MAX_TRACESTATE_LEN + 1);
    expect(
      normalizeTraceContext({
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceState: big,
      }),
    ).toEqual({ traceId: TRACE_ID, spanId: SPAN_ID });
  });

  it('returns undefined for non-object input and never throws', () => {
    for (const v of [undefined, null, 'x', 42, [], true]) {
      expect(() => normalizeTraceContext(v)).not.toThrow();
      expect(normalizeTraceContext(v)).toBeUndefined();
    }
  });
});
