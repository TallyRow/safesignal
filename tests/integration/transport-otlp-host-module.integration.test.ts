/**
 * T012 [US1] + T033 [US4] — Host + federated-module integration for the
 * OTLP transport.
 *
 * Asserts: events flow through one host-configured OTLP transport and
 * arrive as OTLP requests with correct identity (US1); a federated module
 * logger does not replace the host transport; two independently-configured
 * instances are isolated (US4 / TO-8 / D9).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import {
  installAddEventListenerSpy,
  installFetchDouble,
} from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';

let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;
let listenerSpy: ReturnType<typeof installAddEventListenerSpy> | null = null;

beforeEach(() => {
  clearActiveRuntimeForTests();
  fetchDouble = installFetchDouble({
    behavior: { kind: 'resolve', status: 200 },
  });
  listenerSpy = installAddEventListenerSpy();
});

afterEach(() => {
  fetchDouble?.uninstall();
  listenerSpy?.uninstall();
  clearActiveRuntimeForTests();
  fetchDouble = null;
  listenerSpy = null;
});

interface OtlpBody {
  resourceLogs: Array<{
    resource: {
      attributes: Array<{ key: string; value: { stringValue?: string } }>;
    };
    scopeLogs: Array<{
      logRecords: Array<{ attributes: Array<{ key: string }> }>;
    }>;
  }>;
}

function bodies(): OtlpBody[] {
  return (fetchDouble?.calls ?? []).map(
    (c) => JSON.parse(c.body ?? '') as OtlpBody,
  );
}

describe('host + federated module loggers through one OTLP transport', () => {
  it('delivers events with service identity on the Resource (US1)', async () => {
    configureLogging({
      application: { name: 'host', version: '2026.05' },
      environment: 'production',
      transports: [
        createOtlpTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 1 },
        }),
      ],
    });
    const log = createLogger();
    log.warn('checkout.started', { cartId: 'c1' });
    await Promise.resolve();

    const reqs = bodies();
    expect(reqs.length).toBeGreaterThan(0);
    const resAttrs = reqs[0]!.resourceLogs[0]!.resource.attributes;
    const byKey = Object.fromEntries(
      resAttrs.map((a) => [a.key, a.value.stringValue]),
    );
    expect(byKey['service.name']).toBe('host');
    expect(byKey['deployment.environment']).toBe('production');
  });

  it('a module logger does not replace the host transport; module identity is per-record', async () => {
    configureLogging({
      application: { name: 'host' },
      environment: 'production',
      transports: [
        createOtlpTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 1 },
        }),
      ],
    });
    const moduleLog = createLogger({
      module: { name: 'reco', version: '1.1.0' },
    });
    moduleLog.error('reco.fallback', { reason: 'cache_miss' });
    await Promise.resolve();

    const recAttrs =
      bodies()[0]!.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!.attributes.map(
        (a) => a.key,
      );
    expect(recAttrs).toContain('module.name');
    // At most one pagehide listener across the host transport's sends.
    const pagehideAdds = listenerSpy!.registrations.filter(
      (r) => r.type === 'pagehide',
    );
    expect(pagehideAdds.length).toBeLessThanOrEqual(1);
  });
});

describe('multiple OTLP transport instances are isolated (D9)', () => {
  it('two instances keep independent buffers/state', async () => {
    const a = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 100 },
    });
    const b = createOtlpTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 1 },
    });

    // a buffers (size 100, never flushes); b flushes per event.
    a.send({
      timestamp: '2024-05-29T00:00:00.000Z',
      level: 'warn',
      message: 'a',
      attributes: {},
      context: {},
    });
    b.send({
      timestamp: '2024-05-29T00:00:00.000Z',
      level: 'warn',
      message: 'b',
      attributes: {},
      context: {},
    });
    await b.flush!();

    // Only b delivered; a's buffered event did not leak into b.
    const delivered = bodies();
    expect(delivered).toHaveLength(1);
    const rec = delivered[0]!.resourceLogs[0]!.scopeLogs[0]!.logRecords;
    expect(rec).toHaveLength(1);

    await a.shutdown!();
    await b.shutdown!();
  });
});
