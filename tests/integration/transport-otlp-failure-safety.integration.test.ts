/**
 * T023 [US2] — Failure-injection tests for the OTLP transport (TO-4,
 * research D6/D7). Every failure mode drops safely (no retry, no throw to
 * caller) with one rate-limited notice per class.
 */

import { afterEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import { installFetchDouble } from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'warn',
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

function collect(): { notices: Error[]; onInternalError: (e: Error) => void } {
  const notices: Error[] = [];
  return { notices, onInternalError: (e) => notices.push(e) };
}

describe('OTLP transport failure safety', () => {
  it('non-2xx → send_failed, dropped, no throw, one notice', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 500 },
    });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      onInternalError,
    });
    expect(() => t.send(event())).not.toThrow();
    await t.flush!();
    // Send again — still one notice (rate-limited), no retry of the first.
    t.send(event());
    await t.flush!();
    expect(notices).toHaveLength(1);
    expect((notices[0] as { code?: string }).code).toBe('send_failed');
  });

  it('rejected fetch → send_failed with a cause', async () => {
    const reason = new TypeError('network down');
    fetchDouble = installFetchDouble({ behavior: { kind: 'reject', reason } });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      onInternalError,
    });
    t.send(event());
    await t.flush!();
    expect(notices).toHaveLength(1);
    expect((notices[0] as { code?: string; cause?: unknown }).code).toBe(
      'send_failed',
    );
    expect((notices[0] as { cause?: unknown }).cause).toBe(reason);
  });

  it('fetch unavailable → delivery_unavailable', async () => {
    fetchDouble = installFetchDouble({ behavior: { kind: 'unavailable' } });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      onInternalError,
    });
    t.send(event());
    await t.flush!();
    expect(notices).toHaveLength(1);
    expect((notices[0] as { code?: string }).code).toBe('delivery_unavailable');
  });

  it('2xx with partialSuccess.rejectedLogRecords → partial_rejection', async () => {
    fetchDouble = installFetchDouble({
      behavior: {
        kind: 'function',
        fn: () =>
          new Response(
            JSON.stringify({ partialSuccess: { rejectedLogRecords: '2' } }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      },
    });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      onInternalError,
    });
    t.send(event());
    await t.flush!();
    expect(notices).toHaveLength(1);
    expect((notices[0] as { code?: string }).code).toBe('partial_rejection');
  });

  it('oversized event (> maxRecordBytes) → oversized_event drop, never sent', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
      maxRecordBytes: 256,
      onInternalError,
    });
    t.send(event({ attributes: { big: 'x'.repeat(1000) } }));
    await t.flush!();
    expect(fetchDouble!.calls).toHaveLength(0);
    expect((notices[0] as { code?: string }).code).toBe('oversized_event');
  });

  it('over maxBufferedEvents (buffered + in-flight) → buffer_overflow drop', async () => {
    // A backend that never resolves keeps every flushed batch "in flight",
    // so the pending (undelivered) count climbs to the cap and overflows.
    fetchDouble = installFetchDouble({
      behavior: { kind: 'function', fn: () => new Promise<Response>(() => {}) },
    });
    const { notices, onInternalError } = collect();
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 }, // flush each event → each becomes in-flight
      maxBufferedEvents: 5,
      onInternalError,
    });
    for (let i = 0; i < 10; i += 1) t.send(event({ message: `e${i}` }));
    expect(
      notices.some((n) => (n as { code?: string }).code === 'buffer_overflow'),
    ).toBe(true);
  });

  it('shutdown is idempotent and safe', async () => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    const t = createOtlpTransport({ endpoint: ENDPOINT });
    await expect(t.shutdown!()).resolves.toBeUndefined();
    await expect(t.shutdown!()).resolves.toBeUndefined();
    // send after shutdown is a no-op
    expect(() => t.send(event())).not.toThrow();
  });
});
