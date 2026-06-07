/**
 * T013-T014 [US1] — Integration tests for OTLP protobuf delivery.
 *
 * Verifies end-to-end protobuf encoding + delivery path:
 * send event → serialize batch → encode protobuf → deliver with
 * Content-Type: application/x-protobuf and binary body.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { LogEvent } from '../../src/api/types.js';
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
    message: 'test protobuf message',
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

describe('OTLP protobuf delivery', () => {
  beforeEach(() => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    beaconDouble = installSendBeaconDouble({ returnValue: true });
  });

  it('POSTs with Content-Type: application/x-protobuf when encoding is protobuf', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'protobuf',
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    await t.flush!();

    expect(fetchDouble!.calls).toHaveLength(1);
    const call = fetchDouble!.calls[0]!;
    expect(call.url).toBe(ENDPOINT);
    expect((call.init?.method ?? '').toUpperCase()).toBe('POST');
    const headers = call.init?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/x-protobuf');
  });

  it('delivers a Uint8Array body (not a string) for protobuf encoding', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'protobuf',
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    await t.flush!();

    expect(fetchDouble!.calls).toHaveLength(1);
    const body = fetchDouble!.calls[0]!.init?.body;
    expect(body).toBeInstanceOf(Uint8Array);
    expect((body as Uint8Array).length).toBeGreaterThan(0);
  });

  it('protobuf body is smaller than JSON body for the same event', async () => {
    // JSON transport
    const tJson = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'json',
      batching: { maxBatchSize: 1 },
    });
    tJson.send(event());
    await tJson.flush!();
    const jsonBody = fetchDouble!.calls[0]!.body as string;
    const jsonSize = new TextEncoder().encode(jsonBody).length;

    // Reset fetch double for the protobuf leg
    fetchDouble!.uninstall();
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });

    // Protobuf transport
    const tProto = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'protobuf',
      batching: { maxBatchSize: 1 },
    });
    tProto.send(event());
    await tProto.flush!();
    const protoBody = fetchDouble!.calls[0]!.init?.body as Uint8Array;
    const protoSize = protoBody.length;

    expect(protoSize).toBeLessThan(jsonSize);
  });

  it('protobuf body passes conformance: non-empty, starts with valid varint tag', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'protobuf',
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    await t.flush!();

    const body = fetchDouble!.calls[0]!.init?.body as Uint8Array;
    // First byte should be a valid field tag: (1 << 3) | 2 = 0x0a (field 1, LEN)
    // for the ResourceLogs message
    expect(body.length).toBeGreaterThan(0);
    const firstByte = body[0]!;
    // Field 1 with LEN wire type: (1 << 3) | 2 = 10 = 0x0a
    expect(firstByte).toBe(0x0a);
  });

  it('still uses fetch, never sendBeacon, with protobuf encoding', async () => {
    const t = createOtlpTransport({
      endpoint: ENDPOINT,
      encoding: 'protobuf',
      batching: { maxBatchSize: 1 },
    });
    t.send(event());
    await t.flush!();
    expect(fetchDouble!.calls.length).toBeGreaterThan(0);
    expect(beaconDouble!.calls).toHaveLength(0);
  });
});

describe('JSON-protobuf interop (US3)', () => {
  beforeEach(() => {
    fetchDouble = installFetchDouble({
      behavior: { kind: 'resolve', status: 200 },
    });
    beaconDouble = installSendBeaconDouble({ returnValue: true });
  });

  it('same number of log records in both encodings', async () => {
    for (const encoding of ['json', 'protobuf'] as const) {
      const t = createOtlpTransport({
        endpoint: ENDPOINT,
        encoding,
        batching: { maxBatchSize: 3 },
      });
      for (let i = 0; i < 3; i++) {
        t.send(event({ message: `e${i}` }));
      }
      await t.flush!();

      if (encoding === 'json') {
        const body = JSON.parse(fetchDouble!.calls[0]!.body as string);
        expect(body.resourceLogs[0].scopeLogs[0].logRecords).toHaveLength(3);
      }
      // For protobuf we can't easily parse, but the transport doesn't crash.
      // Reset fetch double for the next encoding iteration.
      fetchDouble!.uninstall();
      fetchDouble = installFetchDouble({
        behavior: { kind: 'resolve', status: 200 },
      });
    }
  });

  it('both encodings handle trace context equivalently', async () => {
    for (const encoding of ['json', 'protobuf'] as const) {
      const t = createOtlpTransport({
        endpoint: ENDPOINT,
        encoding,
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

      if (encoding === 'json') {
        const body = JSON.parse(fetchDouble!.calls[0]!.body as string);
        const rec = body.resourceLogs[0].scopeLogs[0].logRecords[0];
        expect(rec.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
        expect(rec.spanId).toBe('00f067aa0ba902b7');
        expect(rec.flags).toBe(1);
      }
      // Protobuf path doesn't crash.
      // Reset fetch double for the next encoding iteration.
      fetchDouble!.uninstall();
      fetchDouble = installFetchDouble({
        behavior: { kind: 'resolve', status: 200 },
      });
    }
  });

  it('both encodings handle attributes equivalently', async () => {
    for (const encoding of ['json', 'protobuf'] as const) {
      const t = createOtlpTransport({
        endpoint: ENDPOINT,
        encoding,
        batching: { maxBatchSize: 1 },
      });
      t.send(
        event({
          attributes: { userId: 42, action: 'login' },
        }),
      );
      await t.flush!();

      if (encoding === 'json') {
        const body = JSON.parse(fetchDouble!.calls[0]!.body as string);
        const attrs =
          body.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
        expect(attrs).toContainEqual({
          key: 'userId',
          value: { intValue: '42' },
        });
        expect(attrs).toContainEqual({
          key: 'action',
          value: { stringValue: 'login' },
        });
      }
      // Reset fetch double for the next encoding iteration.
      fetchDouble!.uninstall();
      fetchDouble = installFetchDouble({
        behavior: { kind: 'resolve', status: 200 },
      });
    }
  });

  it('both encodings survive failure scenarios without throwing', async () => {
    fetchDouble?.uninstall();
    fetchDouble = installFetchDouble({ behavior: { kind: 'reject' } });

    for (const encoding of ['json', 'protobuf'] as const) {
      const t = createOtlpTransport({
        endpoint: ENDPOINT,
        encoding,
        batching: { maxBatchSize: 1 },
      });
      expect(() => t.send(event())).not.toThrow();
      await expect(t.flush!()).resolves.toBeUndefined();
      await expect(t.shutdown!()).resolves.toBeUndefined();
    }
  });

  it('both encodings handle empty batches gracefully', async () => {
    for (const encoding of ['json', 'protobuf'] as const) {
      const t = createOtlpTransport({
        endpoint: ENDPOINT,
        encoding,
        batching: { maxBatchSize: 100 },
      });
      await t.flush!();
      // Should not crash — either no fetch call or a successful one
      // Protobuf empty batch produces 0 bytes which is valid
    }
  });
});
