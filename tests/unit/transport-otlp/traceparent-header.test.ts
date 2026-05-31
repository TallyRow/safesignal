/**
 * Unit tests for the Feature 009 `traceparent` header builder
 * (`src/transport-otlp/traceparent-header.ts`).
 *
 * Covers the pure decision + formatting + precedence logic:
 *   TI-3 homogeneous-only injection, TI-4 `traceparent` format + flags byte,
 *   TI-5 `tracestate` only when uniform + bounded, TI-6 consumer-headers-win
 *   precedence + same-ref disabled path. Research D3/D4/D5/D6.
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent, TraceContext } from '../../../src/api/types.js';
import {
  buildRequestHeaders,
  decideBatchTraceparent,
} from '../../../src/transport-otlp/traceparent-header.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';
const SPAN_ID_2 = 'b7ad6b7169203331';

function event(trace?: Partial<TraceContext>): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: {
      application: { name: 'svc' },
      ...(trace !== undefined
        ? { trace: { traceId: TRACE_ID, spanId: SPAN_ID, ...trace } }
        : {}),
    },
  };
}

describe('decideBatchTraceparent — homogeneous inject (TI-3/TI-4)', () => {
  it('injects a correctly formatted traceparent for a single-trace batch', () => {
    const d = decideBatchTraceparent([
      event({ traceFlags: 1 }),
      event({ traceFlags: 1 }),
    ]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    });
  });

  it('defaults the flags byte to 00 when traceFlags is absent', () => {
    const d = decideBatchTraceparent([event({})]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-00`,
    });
  });

  it('renders flags as two lowercase-hex digits', () => {
    const d = decideBatchTraceparent([event({ traceFlags: 255 })]);
    expect(d).toMatchObject({ traceparent: `00-${TRACE_ID}-${SPAN_ID}-ff` });
  });
});

describe('decideBatchTraceparent — tracestate uniformity (TI-5)', () => {
  it('includes tracestate when every event shares the same value', () => {
    const d = decideBatchTraceparent([
      event({ traceFlags: 1, traceState: 'vendor=a' }),
      event({ traceFlags: 1, traceState: 'vendor=a' }),
    ]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      tracestate: 'vendor=a',
    });
  });

  it('omits tracestate (keeps traceparent) when it differs across the batch', () => {
    const d = decideBatchTraceparent([
      event({ traceFlags: 1, traceState: 'vendor=a' }),
      event({ traceFlags: 1, traceState: 'vendor=b' }),
    ]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    });
  });

  it('omits tracestate when one event lacks it', () => {
    const d = decideBatchTraceparent([
      event({ traceFlags: 1, traceState: 'vendor=a' }),
      event({ traceFlags: 1 }),
    ]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    });
  });

  it('omits an over-bound (>512) tracestate but keeps traceparent', () => {
    const huge = 'x'.repeat(513);
    const d = decideBatchTraceparent([
      event({ traceFlags: 1, traceState: huge }),
    ]);
    expect(d).toEqual({
      inject: true,
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
    });
  });
});

describe('decideBatchTraceparent — fail-closed omission (TI-3)', () => {
  it('does not inject for an empty batch', () => {
    expect(decideBatchTraceparent([])).toEqual({ inject: false });
  });

  it('does not inject when no event carries trace context', () => {
    const traceless: LogEvent = {
      timestamp: '2024-05-29T00:00:00.000Z',
      level: 'info',
      message: 'm',
      attributes: {},
      context: { application: { name: 'svc' } },
    };
    expect(decideBatchTraceparent([traceless, traceless])).toEqual({
      inject: false,
    });
  });

  it('does not inject when the batch spans two differing traces', () => {
    expect(
      decideBatchTraceparent([
        event({ traceFlags: 1 }),
        event({ spanId: SPAN_ID_2, traceFlags: 1 }),
      ]),
    ).toEqual({ inject: false });
  });

  it('treats differing flags as heterogeneous (omit)', () => {
    expect(
      decideBatchTraceparent([
        event({ traceFlags: 1 }),
        event({ traceFlags: 0 }),
      ]),
    ).toEqual({ inject: false });
  });

  it('does not inject for a traced + untraced mix', () => {
    const traceless: LogEvent = {
      timestamp: '2024-05-29T00:00:00.000Z',
      level: 'info',
      message: 'm',
      attributes: {},
      context: { application: { name: 'svc' } },
    };
    expect(
      decideBatchTraceparent([event({ traceFlags: 1 }), traceless]),
    ).toEqual({ inject: false });
  });

  it('defensively treats a structurally-invalid present trace as none', () => {
    // Bypasses emit-time normalization (a transport-only test can do this).
    expect(decideBatchTraceparent([event({ traceId: 'not-hex' })])).toEqual({
      inject: false,
    });
    expect(decideBatchTraceparent([event({ spanId: '0'.repeat(16) })])).toEqual(
      { inject: false },
    );
  });
});

describe('buildRequestHeaders — precedence + same-ref (TI-2/TI-6)', () => {
  const base = Object.freeze({ authorization: 'Bearer secret-123' });

  it('returns the SAME base reference when disabled', () => {
    expect(buildRequestHeaders(base, [event({ traceFlags: 1 })], false)).toBe(
      base,
    );
  });

  it('returns the SAME base reference when the batch is not homogeneous', () => {
    expect(buildRequestHeaders(base, [], true)).toBe(base);
  });

  it('adds traceparent under consumer headers when enabled + homogeneous', () => {
    const out = buildRequestHeaders(base, [event({ traceFlags: 1 })], true);
    expect(out).not.toBe(base);
    expect(out).toEqual({
      traceparent: `00-${TRACE_ID}-${SPAN_ID}-01`,
      authorization: 'Bearer secret-123',
    });
  });

  it('lets a consumer-supplied traceparent win over injection', () => {
    const withTp = Object.freeze({ traceparent: 'consumer-value' });
    const out = buildRequestHeaders(withTp, [event({ traceFlags: 1 })], true);
    expect(out.traceparent).toBe('consumer-value');
  });

  it('does not mutate the base headers', () => {
    const snapshot = { ...base };
    buildRequestHeaders(base, [event({ traceFlags: 1 })], true);
    expect({ ...base }).toEqual(snapshot);
  });
});
