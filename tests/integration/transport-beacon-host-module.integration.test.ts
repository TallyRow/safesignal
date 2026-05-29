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

import { configureLogging, createLogger } from '../../src/index.js';
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
      transports: [
        createBeaconTransport({ endpoint: ENDPOINT, onInternalError }),
      ],
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

// ---------------------------------------------------------------------------
// T021 — Multi-instance independence (FR-024, TB-9)
// ---------------------------------------------------------------------------

describe('two beacon transports against different endpoints (FR-024, TB-9)', () => {
  it('each transport receives every event AND installs its own pagehide listener', async () => {
    if (harness === null) throw new Error('harness not initialised');
    const { listenerSpy } = harness;
    const ENDPOINT_A = 'https://logs-a.example.com/ingest';
    const ENDPOINT_B = 'https://logs-b.example.com/ingest';

    configureLogging({
      application: { name: 'host', version: '2026.05' },
      environment: 'production',
      transports: [
        createBeaconTransport({ endpoint: ENDPOINT_A, name: 'beacon-a' }),
        createBeaconTransport({ endpoint: ENDPOINT_B, name: 'beacon-b' }),
      ],
    });

    const logger = createLogger();
    const EVENT_COUNT = 100;
    for (let i = 0; i < EVENT_COUNT; i += 1) {
      logger.warn(`event ${i}`, { seq: i });
    }

    // Each transport hits its own endpoint EXACTLY 100 times.
    const callsA = harness.beacon.calls.filter(
      (c) => c.endpoint === ENDPOINT_A,
    );
    const callsB = harness.beacon.calls.filter(
      (c) => c.endpoint === ENDPOINT_B,
    );
    expect(callsA.length).toBe(EVENT_COUNT);
    expect(callsB.length).toBe(EVENT_COUNT);

    // Same events delivered to both endpoints — assertion proves no
    // cross-instance event filtering / dedup / reorder.
    const textsA = await Promise.all(
      callsA.map((c) => c.blob?.text() ?? Promise.resolve(null)),
    );
    const textsB = await Promise.all(
      callsB.map((c) => c.blob?.text() ?? Promise.resolve(null)),
    );
    expect(textsA).toEqual(textsB);

    // FR-024: each transport instance owns its own pagehide listener.
    const pagehideAdds = listenerSpy.registrations.filter(
      (r) => r.type === 'pagehide',
    );
    expect(pagehideAdds.length).toBe(2);
    // Distinct handler references — each instance owns its own.
    expect(pagehideAdds[0]?.listener).not.toBe(pagehideAdds[1]?.listener);
  });

  it('a forced drop on one transport does not affect the other instance’s notices', async () => {
    if (harness === null) throw new Error('harness not initialised');

    // Replace fetch double with one that rejects so transport-A's
    // fetch fallback fires a transport_send_failed notice.
    harness.fetch.uninstall();
    harness.fetch = installFetchDouble({
      behavior: {
        kind: 'reject',
        reason: new TypeError('Failed to fetch (synthetic)'),
      },
    });
    // Replace sendBeacon double with one that REFUSES so fallback is
    // forced. sendBeacon returns false uniformly — both transports
    // fall through to fetch, which rejects → notice fires.
    harness.beacon.uninstall();
    harness.beacon = installSendBeaconDouble({ returnValue: false });

    const noticesA: Error[] = [];
    const noticesB: Error[] = [];

    configureLogging({
      application: { name: 'host', version: '2026.05' },
      environment: 'production',
      transports: [
        createBeaconTransport({
          endpoint: 'https://logs-a.example.com/ingest',
          name: 'beacon-a',
          onInternalError: (err) => noticesA.push(err),
        }),
        createBeaconTransport({
          endpoint: 'https://logs-b.example.com/ingest',
          name: 'beacon-b',
          onInternalError: (err) => noticesB.push(err),
        }),
      ],
    });

    const logger = createLogger();
    logger.warn('shared emission');
    // Yield microtasks so fetch's rejected Promise settles into each
    // transport's .then(_, onRejected) handler.
    await new Promise<void>((r) => setTimeout(r, 0));

    // Each transport gets its OWN notice — A's hook does not see B's
    // notice and vice versa. Each notice names its own transport.
    expect(noticesA.length).toBe(1);
    expect(noticesB.length).toBe(1);
    expect(
      (noticesA[0] as Error & { transportName?: string }).transportName,
    ).toBe('beacon-a');
    expect(
      (noticesB[0] as Error & { transportName?: string }).transportName,
    ).toBe('beacon-b');
    expect((noticesA[0] as Error & { code?: string }).code).toBe(
      'transport_send_failed',
    );
    expect((noticesB[0] as Error & { code?: string }).code).toBe(
      'transport_send_failed',
    );

    // Second emission: each instance's per-session rate-limit
    // suppresses additional notices, but the SUPPRESSION is per-
    // instance — i.e., if we had a different drop class on instance
    // B it would still fire. The FR-024 invariant is that the
    // rate-limits don't share state. We can prove this by inducing
    // a second drop on both: still no new notices on either side
    // (correct per-instance rate-limit behaviour).
    logger.warn('second shared emission');
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(noticesA.length).toBe(1);
    expect(noticesB.length).toBe(1);
  });
});
