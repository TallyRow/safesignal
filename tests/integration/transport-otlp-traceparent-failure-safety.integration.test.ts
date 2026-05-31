/**
 * T013 [US2] — Failure-safety for Feature 009 `traceparent` injection (TI-7,
 * research D8). Malformed/heterogeneous trace input and a header-build that is
 * forced to throw both degrade to "no header"; the batch still delivers and no
 * call into send/flush/shutdown throws. Also covers the pagehide/final-flush
 * delivery path (spec Edge Cases).
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import { installFetchDouble } from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: { application: { name: 'svc' } },
    ...overrides,
  };
}

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;

afterEach(() => {
  fetchDouble?.uninstall();
  fetchDouble = null;
});

function lastHeaders(): Record<string, string> {
  const call = fetchDouble!.calls.at(-1)!;
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe('Feature 009 — injection fail-safety', () => {
  it('malformed present trace (bypassing normalization) → no header, still delivers', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      injectTraceparent: true,
    });
    const bad = event({
      context: {
        application: { name: 'svc' },
        // 31 hex chars — invalid; emit-time normalization would have dropped
        // it, but a transport-only test can supply it directly.
        trace: { traceId: 'abc', spanId: SPAN_ID },
      },
    });
    expect(() => t.send(bad)).not.toThrow();
    await expect(t.flush!()).resolves.toBeUndefined();
    expect(fetchDouble!.calls).toHaveLength(1);
    expect(lastHeaders().traceparent).toBeUndefined();
  });

  it('a header-build that throws falls back to plain headers; batch still ships', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      headers: { authorization: 'Bearer s' },
      injectTraceparent: true,
    });
    // Isolate the D8 header-build fallback: `context.trace` returns a valid
    // trace for the first two reads (send() size-guard + flush serialization,
    // which must succeed so the batch is delivered, not dropped) and throws on
    // the third read (the header-build decision), proving that a throw there
    // degrades to plain headers rather than dropping or throwing.
    let reads = 0;
    const validTrace = { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 };
    const context: LogEvent['context'] = { application: { name: 'svc' } };
    Object.defineProperty(context, 'trace', {
      get() {
        reads += 1;
        if (reads >= 3) throw new Error('boom on header build');
        return validTrace;
      },
      enumerable: true,
    });
    const booby = event({ context });
    expect(() => t.send(booby)).not.toThrow();
    await expect(t.flush!()).resolves.toBeUndefined();
    expect(fetchDouble!.calls).toHaveLength(1);
    const h = lastHeaders();
    expect(h.traceparent).toBeUndefined(); // fell back to plain headers
    expect(h.authorization).toBe('Bearer s'); // plain headers preserved
  });

  it('pagehide final-flush: a buffered homogeneous batch injects on unload', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 10 }, // keep events buffered until pagehide
      injectTraceparent: true,
    });
    t.send(
      event({
        context: {
          application: { name: 'svc' },
          trace: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
        },
      }),
    );
    t.send(
      event({
        context: {
          application: { name: 'svc' },
          trace: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
        },
      }),
    );
    expect(fetchDouble!.calls).toHaveLength(0); // still buffered
    expect(() => globalThis.dispatchEvent(new Event('pagehide'))).not.toThrow();
    await Promise.resolve();
    expect(fetchDouble!.calls).toHaveLength(1);
    expect(lastHeaders().traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    await t.shutdown!();
  });

  it('pagehide final-flush: a heterogeneous buffered batch injects no header', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 10 },
      injectTraceparent: true,
    });
    t.send(
      event({
        context: {
          application: { name: 'svc' },
          trace: { traceId: TRACE_ID, spanId: SPAN_ID, traceFlags: 1 },
        },
      }),
    );
    t.send(event()); // untraced → mixed batch
    expect(() => globalThis.dispatchEvent(new Event('pagehide'))).not.toThrow();
    await Promise.resolve();
    expect(fetchDouble!.calls).toHaveLength(1);
    expect(lastHeaders().traceparent).toBeUndefined();
    await t.shutdown!();
  });
});
