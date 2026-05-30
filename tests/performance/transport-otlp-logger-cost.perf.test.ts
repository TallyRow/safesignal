/**
 * T032 [US4] — Lightweight-`Logger` & shared-runtime scale test for the
 * OTLP transport (Principle VII / TO-8).
 *
 * With one OTLP transport configured at the runtime level, creating and
 * deriving many `Logger`s and emitting through them must NOT scale
 * per-instance: the expensive resources (pagehide listener, batch age
 * timer, network) live on the single transport instance, not per logger.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { createOtlpTransport } from '../../src/transport-otlp/index.js';
import {
  installAddEventListenerSpy,
  installFetchDouble,
  installSetTimeoutSpy,
} from '../helpers/beacon-network.js';

const ENDPOINT = 'https://otlp.example.com/v1/logs';

let listener: ReturnType<typeof installAddEventListenerSpy> | null = null;
let timers: ReturnType<typeof installSetTimeoutSpy> | null = null;
let fetchDouble: ReturnType<typeof installFetchDouble> | null = null;

beforeEach(() => {
  clearActiveRuntimeForTests();
  listener = installAddEventListenerSpy();
  timers = installSetTimeoutSpy();
  fetchDouble = installFetchDouble({
    behavior: { kind: 'resolve', status: 200 },
  });
});

afterEach(() => {
  fetchDouble?.uninstall();
  timers?.uninstall();
  listener?.uninstall();
  clearActiveRuntimeForTests();
  listener = null;
  timers = null;
  fetchDouble = null;
});

describe('OTLP transport stays runtime-level, not per-Logger', () => {
  it('creating + deriving 500 loggers installs no per-instance listener/timer/fetch', () => {
    configureLogging({
      application: { name: 'host' },
      environment: 'production',
      // Batch size above the emit count → emitting buffers, never flushes
      // during this test window (cap defaults to 1000 >= maxBatchSize).
      transports: [
        createOtlpTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 1000 },
        }),
      ],
    });

    const N = 500;
    for (let i = 0; i < N; i += 1) {
      const base = createLogger({ module: { name: `mod-${i}` } });
      const child = base.withContext({ attributes: { i } });
      child.warn(`event ${i}`, { i });
    }

    // No network during buffering.
    expect(fetchDouble!.calls).toHaveLength(0);
    // At most ONE pagehide listener total (installed on first send), not N.
    const pagehideAdds = listener!.registrations.filter(
      (r) => r.type === 'pagehide',
    );
    expect(pagehideAdds.length).toBeLessThanOrEqual(1);
    // No age timer (maxBatchAgeMs not configured here) and certainly not N.
    expect(timers!.creations.length).toBeLessThanOrEqual(1);
  });
});
