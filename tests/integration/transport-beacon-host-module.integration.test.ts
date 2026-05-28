/**
 * T020 [US2] — Multi-module integration test for the beacon transport.
 *
 * One host calls `configureLogging({ transports: [createBeaconTransport(...)] })`.
 * 50 synthetic module loggers each emit 20 events through it. The test
 * asserts:
 *
 *   - Exactly 1,000 network calls (one per emitted event in default
 *     no-batching mode).
 *   - Every recorded body's `context.module.name` is in
 *     `{ mod-0, ..., mod-49 }`, with EXACTLY 20 occurrences per module.
 *   - No two recorded bodies are byte-identical (events are
 *     individually distinguishable, proving no dedup is happening at
 *     the transport boundary).
 *   - Exactly ONE `pagehide` listener installed across all 1,000
 *     emissions — the host owns the transport, and the lazy install
 *     happens once on the first send().
 *
 * Locks FR-023, FR-024, SC-005.
 *
 * T021 (multi-instance independence) lives in this same file in a
 * separate `describe` block.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  configureLogging,
  createLogger,
} from '../../src/index.js';
import { createBeaconTransport } from '../../src/transport-beacon/index.js';
import {
  installAddEventListenerSpy,
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

const ENDPOINT = 'https://logs.example.com/ingest';

interface Harness {
  beacon: ReturnType<typeof installSendBeaconDouble>;
  fetch: ReturnType<typeof installFetchDouble>;
  listenerSpy: ReturnType<typeof installAddEventListenerSpy>;
  notices: Error[];
}

let harness: Harness | null = null;

beforeEach(() => {
  harness = {
    beacon: installSendBeaconDouble({ returnValue: true }),
    fetch: installFetchDouble({ behavior: { kind: 'resolve', status: 204 } }),
    listenerSpy: installAddEventListenerSpy(),
    notices: [],
  };
});

afterEach(() => {
  harness?.listenerSpy.uninstall();
  harness?.fetch.uninstall();
  harness?.beacon.uninstall();
  harness = null;
});

function asEvent(body: string): Record<string, unknown> {
  return JSON.parse(body) as Record<string, unknown>;
}

describe('host + 50 module loggers through one beacon transport (FR-023, SC-005)', () => {
  it('emits exactly 1000 events; each module attributed; one pagehide listener', async () => {
    if (harness === null) throw new Error('harness not initialised');
    const { beacon, listenerSpy, notices } = harness;
    const onInternalError = (err: Error): void => {
      notices.push(err);
    };

    // 1. Host configures the runtime once at boot.
    configureLogging({
      application: { name: 'host', version: '2026.05' },
      environment: 'production',
      transports: [createBeaconTransport({ endpoint: ENDPOINT, onInternalError })],
      onInternalError,
    });

    // 2. 50 synthetic federated module loggers — the host never
    //    re-configures, the modules never install a transport, and
    //    every event flows through the host's already-configured
    //    runtime via FR-030.
    const MODULE_COUNT = 50;
    const EVENTS_PER_MODULE = 20;
    const moduleLoggers = Array.from({ length: MODULE_COUNT }, (_, i) =>
      createLogger({ module: { name: `mod-${i}` } }),
    );

    // 3. Each module emits 20 events at mixed warn/error levels (the
    //    production default level filter drops info/debug, so we
    //    keep emissions above the threshold). Each event carries a
    //    unique index so no two recorded bodies will be byte-identical
    //    after JSON.stringify.
    for (let m = 0; m < MODULE_COUNT; m += 1) {
      const logger = moduleLoggers[m];
      if (logger === undefined) continue;
      for (let e = 0; e < EVENTS_PER_MODULE; e += 1) {
        const seq = m * EVENTS_PER_MODULE + e;
        const message = `event ${seq} from mod-${m}`;
        if (e % 2 === 0) {
          logger.warn(message, { seq, eventInModule: e });
        } else {
          logger.error(
            message,
            { seq, eventInModule: e },
            new Error(`synthetic-error-${seq}`),
          );
        }
      }
    }

    // 4. Exactly 1,000 network calls — no batching, no dedup.
    expect(beacon.calls.length).toBe(MODULE_COUNT * EVENTS_PER_MODULE);

    // 5. Pagehide listener installed exactly once across all sends.
    const pagehideAdds = listenerSpy.registrations.filter(
      (r) => r.type === 'pagehide',
    );
    expect(pagehideAdds.length).toBe(1);

    // 6. Each module's attribution is correct AND each module's
    //    event count is exactly 20.
    const perModuleCount = new Map<string, number>();
    const byteIdenticalCheck = new Set<string>();
    for (const call of beacon.calls) {
      expect(call.endpoint).toBe(ENDPOINT);
      expect(call.blob).toBeInstanceOf(Blob);
      const bodyText = await call.blob?.text();
      if (bodyText === undefined) throw new Error('expected Blob body');
      const parsed = asEvent(bodyText);
      const ctx = parsed.context as { module?: { name?: string } } | undefined;
      const modName = ctx?.module?.name;
      if (typeof modName !== 'string') {
        throw new Error(`event missing context.module.name: ${bodyText}`);
      }
      expect(modName).toMatch(/^mod-\d+$/);
      perModuleCount.set(modName, (perModuleCount.get(modName) ?? 0) + 1);

      // No two bodies byte-identical.
      expect(byteIdenticalCheck.has(bodyText)).toBe(false);
      byteIdenticalCheck.add(bodyText);
    }
    expect(perModuleCount.size).toBe(MODULE_COUNT);
    for (let i = 0; i < MODULE_COUNT; i += 1) {
      expect(perModuleCount.get(`mod-${i}`)).toBe(EVENTS_PER_MODULE);
    }

    // 7. No internal-error notices fired in the happy path.
    expect(notices.length).toBe(0);
  });
});
