/**
 * Contract tests for the `./transport-otlp` subpath.
 *
 * Covers: TO-2 (OTLP/HTTP+JSON POST shape), TO-3 (assertTransportContract
 * T-S1..T-S5), TO-4 (send/flush/shutdown never throw), FR-004 (fetch-only,
 * sendBeacon never used), and the batching-coalesce behaviour (US1
 * scenarios 1–2). The auth-header variant (T029 / TO-6) keeps the contract.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
import { assertTransportContract } from '../../src/testing/assert-transport-contract.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import {
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';

function event(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: '2024-05-29T00:00:00.000Z',
    level: 'info',
    message: 'm',
    attributes: {},
    context: { application: { name: 'svc' }, environment: 'production' },
    ...overrides,
  };
}

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;
let beaconDouble: ReturnType<typeof installSendBeaconDouble> | null = null;

afterEach(() => {
  fetchDouble?.uninstall();
  beaconDouble?.uninstall();
  fetchDouble = null;
  beaconDouble = null;
});

describe('TO-3 — assertTransportContract', () => {
  // Install a fetch stub so the batched probe events that flush during the
  // contract's shutdown step never reach the real network. assertTransport-
  // Contract restores to this stub after each of its own interceptor windows.
  beforeEach(() => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    beaconDouble = installSendBeaconDouble({ returnValue: true });
  });

  it('passes the full T-S1..T-S5 battery', async () => {
    await expect(
      assertTransportContract(createOtlpTransport({ endpoint: ENDPOINT })),
    ).resolves.toBeUndefined();
  });

  it('still passes with auth headers configured (TO-6/T029)', async () => {
    await expect(
      assertTransportContract(
        createOtlpTransport({
          endpoint: ENDPOINT,
          headers: { 'x-api-key': 'secret-key-123' },
        }),
      ),
    ).resolves.toBeUndefined();
  });
});

describe('TO-2 — OTLP/HTTP+JSON delivery shape', () => {
  beforeEach(() => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    beaconDouble = installSendBeaconDouble({ returnValue: true });
  });

  it('POSTs application/json and a conformant OTLP logs body; coalesces a batch', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 5 },
    });
    for (let i = 0; i < 5; i += 1) {
      t.send(event({ message: `e${i}`, attributes: { i } }));
    }
    // maxBatchSize reached → one flush → one request for all 5.
    expect(fetchDouble!.calls).toHaveLength(1);
    const call = fetchDouble!.calls[0]!;
    expect(call.url).toBe(ENDPOINT);
    expect((call.init?.method ?? '').toUpperCase()).toBe('POST');
    const headers = call.init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(call.body ?? '') as {
      resourceLogs: Array<{
        resource: { attributes: unknown[] };
        scopeLogs: Array<{ scope: { name: string }; logRecords: unknown[] }>;
      }>;
    };
    expect(body.resourceLogs).toHaveLength(1);
    const rl = body.resourceLogs[0]!;
    expect(rl.scopeLogs[0]!.scope.name).toBe('@tallyrow/safesignal');
    expect(rl.scopeLogs[0]!.logRecords).toHaveLength(5);
  });

  it('FR-004 — uses fetch, never navigator.sendBeacon', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    t.send(event());
    await t.flush!();
    expect(fetchDouble!.calls.length).toBeGreaterThan(0);
    expect(beaconDouble!.calls).toHaveLength(0);
  });

  it('OT-1 — a LogRecord carries traceId/spanId/flags when context.trace is set', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });
    t.send(
      event({
        context: {
          application: { name: 'svc' },
          trace: {
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
            spanId: '00f067aa0ba902b7',
            traceFlags: 1,
          },
        },
      }),
    );
    await t.flush!();
    const body = JSON.parse(fetchDouble!.calls[0]!.body ?? '') as {
      resourceLogs: Array<{
        scopeLogs: Array<{
          logRecords: Array<{
            traceId?: string;
            spanId?: string;
            flags?: number;
          }>;
        }>;
      }>;
    };
    const rec = body.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!;
    expect(rec.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(rec.spanId).toBe('00f067aa0ba902b7');
    expect(rec.flags).toBe(1);
  });
});

describe('TO-4 — send/flush/shutdown never throw', () => {
  beforeEach(() => {
    fetchDouble = installFetchDouble({ behavior: { kind: 'reject' } });
  });

  it('survives a rejecting backend without throwing to the caller', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });
    expect(() => t.send(event())).not.toThrow();
    await expect(t.flush!()).resolves.toBeUndefined();
    await expect(t.shutdown!()).resolves.toBeUndefined();
    // idempotent
    await expect(t.shutdown!()).resolves.toBeUndefined();
  });
});
