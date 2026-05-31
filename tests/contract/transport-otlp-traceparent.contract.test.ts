/**
 * Contract tests for Feature 009 — outbound `traceparent` header injection on
 * the `./transport-otlp` subpath.
 *
 * Covers: TI-1 (opt-in option + construction validation), TI-2 (disabled by
 * default → byte-identical request), TI-3 (homogeneous-only injection), TI-5
 * (`tracestate` uniformity), TI-6 (consumer headers win / no overwrite).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogEvent, TraceContext } from '../../src/api/types.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import { installFetchDouble } from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';
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
      environment: 'production',
      ...(trace !== undefined
        ? { trace: { traceId: TRACE_ID, spanId: SPAN_ID, ...trace } }
        : {}),
    },
  };
}

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;

beforeEach(() => {
  fetchDouble = installFetchDouble({
    behavior: { kind: 'resolve', status: 200 },
  });
});

afterEach(() => {
  fetchDouble?.uninstall();
  fetchDouble = null;
});

function lastHeaders(): Record<string, string> {
  const call = fetchDouble!.calls.at(-1)!;
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('TI-1 — opt-in option + construction validation', () => {
  it('constructs with injectTraceparent true/false/absent', () => {
    expect(() =>
      createOtlpTransport({ endpoint: ENDPOINT, injectTraceparent: true }),
    ).not.toThrow();
    expect(() =>
      createOtlpTransport({ endpoint: ENDPOINT, injectTraceparent: false }),
    ).not.toThrow();
    expect(() => createOtlpTransport({ endpoint: ENDPOINT })).not.toThrow();
  });

  it('throws TypeError when injectTraceparent is defined and not a boolean', () => {
    expect(() =>
      createOtlpTransport({
        endpoint: ENDPOINT,
        // @ts-expect-error — exercising runtime validation of a bad value
        injectTraceparent: 'yes',
      }),
    ).toThrow(TypeError);
  });

  it('keeps the subpath runtime export set unchanged', async () => {
    const mod = await import('../../src/transport-otlp/index.js');
    expect(Object.keys(mod)).toEqual(['createOtlpTransport']);
  });
});

describe('TI-3/TI-5 — homogeneous-only injection (US1)', () => {
  it('sets a matching traceparent for a single-trace batch', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 2 },
      injectTraceparent: true,
    });
    t.send(event({ traceFlags: 1, traceState: 'vendor=a' }));
    t.send(event({ traceFlags: 1, traceState: 'vendor=a' }));
    expect(fetchDouble!.calls).toHaveLength(1);
    const h = lastHeaders();
    expect(h.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    expect(h.tracestate).toBe('vendor=a');
  });

  it('produces a body identical to the injection-disabled case', async () => {
    const on = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      injectTraceparent: true,
    });
    const off = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });
    on.send(event({ traceFlags: 1 }));
    off.send(event({ traceFlags: 1 }));
    await on.flush!();
    await off.flush!();
    const bodies = fetchDouble!.calls.map((c) => c.body);
    expect(bodies[0]).toBe(bodies[1]); // header is additive only
  });
});

describe('TI-3 — mixed / absent / empty omit the header (US2)', () => {
  it('omits the header for a two-trace batch', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 2 },
      injectTraceparent: true,
    });
    t.send(event({ traceFlags: 1 }));
    t.send(event({ spanId: SPAN_ID_2, traceFlags: 1 }));
    expect(lastHeaders().traceparent).toBeUndefined();
  });

  it('omits the header for a trace-less batch', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      injectTraceparent: true,
    });
    t.send(event());
    await t.flush!();
    expect(lastHeaders().traceparent).toBeUndefined();
  });
});

describe('TI-2 — disabled by default (US3)', () => {
  it('sets no trace header when injectTraceparent is unset', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });
    t.send(event({ traceFlags: 1 }));
    await t.flush!();
    const h = lastHeaders();
    expect(h.traceparent).toBeUndefined();
    expect(h.tracestate).toBeUndefined();
    // Only content-type is added beyond the (empty) configured headers.
    expect(Object.keys(h).sort()).toEqual(['content-type']);
  });

  it('sets no trace header when injectTraceparent is explicitly false', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      injectTraceparent: false,
    });
    t.send(event({ traceFlags: 1 }));
    await t.flush!();
    expect(lastHeaders().traceparent).toBeUndefined();
  });
});

describe('TI-6 — consumer headers win; no overwrite (US3)', () => {
  it('does not overwrite a consumer-supplied traceparent and preserves auth', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      headers: {
        authorization: 'Bearer secret-xyz',
        traceparent: 'consumer-fixed',
      },
      injectTraceparent: true,
    });
    t.send(event({ traceFlags: 1 }));
    await t.flush!();
    const h = lastHeaders();
    expect(h.traceparent).toBe('consumer-fixed');
    expect(h.authorization).toBe('Bearer secret-xyz');
  });

  it('does not mutate configured headers across deliveries', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      headers: { authorization: 'Bearer s' },
      injectTraceparent: true,
    });
    t.send(event({ traceFlags: 1 }));
    await t.flush!();
    t.send(event({ traceFlags: 1 }));
    await t.flush!();
    // Both requests carry the injected header + the untouched auth header.
    for (const call of fetchDouble!.calls) {
      const h = (call.init?.headers ?? {}) as Record<string, string>;
      expect(h.authorization).toBe('Bearer s');
      expect(h.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    }
  });
});
