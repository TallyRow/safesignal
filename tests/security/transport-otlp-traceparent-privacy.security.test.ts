/**
 * T018 — Security/privacy for Feature 009 `traceparent` injection (TI-6,
 * FR-008/FR-009). The injected header carries only trace identifiers (+bounded
 * `tracestate`); it never overwrites, duplicates, or exposes an auth/secret
 * `options.headers` value, never leaks into diagnostics or the request body,
 * and adds no header beyond `traceparent`/`tracestate` + content-type.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import { installFetchDouble } from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';
const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const SPAN_ID = '00f067aa0ba902b7';
const SECRET = 'super-secret-token-9f3c';

function tracedEvent(traceState?: string): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: {
      application: { name: 'svc' },
      trace: {
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        traceFlags: 1,
        ...(traceState !== undefined ? { traceState } : {}),
      },
    },
  };
}

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;

afterEach(() => {
  fetchDouble?.uninstall();
  fetchDouble = null;
});

describe('Feature 009 — header injection privacy', () => {
  it('does not overwrite, duplicate, or expose the auth header; adds only trace headers', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      headers: { authorization: `Bearer ${SECRET}` },
      injectTraceparent: true,
    });
    t.send(tracedEvent('vendor=a'));
    await t.flush!();

    const call = fetchDouble!.calls[0]!;
    const h = (call.init?.headers ?? {}) as Record<string, string>;
    // Auth value untouched and present exactly once.
    expect(h.authorization).toBe(`Bearer ${SECRET}`);
    // Only the trace headers were added beyond auth + content-type.
    expect(Object.keys(h).sort()).toEqual([
      'authorization',
      'content-type',
      'traceparent',
      'tracestate',
    ]);
    expect(h.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    // (d) FR-008 — no event field leaked into the trace headers.
    expect(h.tracestate).toBe('vendor=a');

    // The secret never rides in the body.
    expect(call.body ?? '').not.toContain(SECRET);
  });

  it('never leaks a header value into onInternalError diagnostics', async () => {
    fetchDouble = installFetchDouble({ behavior: { kind: 'reject' } });
    const notices: Error[] = [];
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      headers: { authorization: `Bearer ${SECRET}` },
      injectTraceparent: true,
      onInternalError: (e) => notices.push(e),
    });
    t.send(tracedEvent('vendor=a'));
    await t.flush!();
    expect(notices.length).toBeGreaterThan(0);
    for (const n of notices) {
      const text = `${n.message} ${String((n as { cause?: unknown }).cause ?? '')}`;
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(TRACE_ID);
    }
  });

  it('bounds tracestate: an over-512 value is omitted (not truncated/leaked)', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      injectTraceparent: true,
    });
    t.send(tracedEvent('v'.repeat(600)));
    await t.flush!();
    const h = (fetchDouble!.calls[0]!.init?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(h.traceparent).toBe(`00-${TRACE_ID}-${SPAN_ID}-01`);
    expect(h.tracestate).toBeUndefined();
  });
});
