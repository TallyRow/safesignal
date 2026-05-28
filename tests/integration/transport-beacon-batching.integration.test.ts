/**
 * T025 [US3] — Batching integration tests for the beacon transport.
 *
 * Covers B-1..B-12, F-2 (batch eject path), F-5 (beacon_batch_drop),
 * F-8 (rate-limit), and SC-010 (reconfigure-during-in-flight-batch).
 *
 * Status: every `it` block carries the full assertion body but is
 * grouped under `describe.skip(...)` because batching is not wired
 * into `createBeaconTransport` until T028. The contract is fully
 * encoded; removing the `.skip` after T028 unlocks the suite.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NoopTransport, configureLogging, createLogger } from '../../src/index.js';
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
  // Reset the runtime so the previous test's beacon transport
  // (still installed at this point) gets its shutdown / pagehide
  // listener removal AFTER this test's spies are uninstalled. The
  // next test's `beforeEach` then starts with no beacon transport
  // configured, so its spy isn't polluted by a runtime swap.
  configureLogging({ transports: [NoopTransport] });
});

function recordedBodyTexts(): Promise<(string | null)[]> {
  if (harness === null) return Promise.resolve([]);
  return Promise.all(harness.beacon.calls.map((c) => c.blob?.text() ?? Promise.resolve(null)));
}

describe('createBeaconTransport batching', () => {
  it('B-2: envelope shape is exactly { events: LogEvent[] } with no extra fields', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      application: { name: 'host' },
      environment: 'production',
      transports: [createBeaconTransport({ endpoint: ENDPOINT, batching: { maxBatchSize: 3 } })],
    });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1');
    logger.warn('e2'); // triggers flush
    expect(harness.beacon.calls.length).toBe(1);
    const bodyText = await harness.beacon.calls[0]?.blob?.text();
    if (bodyText === undefined || bodyText === null) throw new Error('no body');
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(['events']);
    expect(Array.isArray(parsed.events)).toBe(true);
    expect((parsed.events as unknown[]).length).toBe(3);
  });

  it('B-4: order preserved across 1000 events in batched flushes', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      application: { name: 'host' },
      environment: 'production',
      transports: [createBeaconTransport({ endpoint: ENDPOINT, batching: { maxBatchSize: 50 } })],
    });
    const logger = createLogger();
    for (let i = 0; i < 1000; i += 1) logger.warn(`e`, { seq: i });
    expect(harness.beacon.calls.length).toBe(20); // 1000 / 50 = 20 envelopes
    const allSeqs: number[] = [];
    for (const t of await recordedBodyTexts()) {
      if (t === null) continue;
      const envelope = JSON.parse(t) as { events: { attributes: { seq: number } }[] };
      for (const ev of envelope.events) allSeqs.push(ev.attributes.seq);
    }
    expect(allSeqs.length).toBe(1000);
    for (let i = 0; i < 999; i += 1) {
      expect(allSeqs[i + 1]).toBe((allSeqs[i] ?? -1) + 1);
    }
  });

  it('B-3a: size threshold triggers a flush', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT, batching: { maxBatchSize: 5 } })],
    });
    const logger = createLogger();
    for (let i = 0; i < 4; i += 1) logger.warn(`e${i}`);
    expect(harness.beacon.calls.length).toBe(0); // below threshold
    logger.warn('e4'); // 5th event triggers
    expect(harness.beacon.calls.length).toBe(1);
  });

  it('B-3b: pagehide fires a final flush of the pending batch', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT, batching: { maxBatchSize: 100 } })],
    });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1');
    expect(harness.beacon.calls.length).toBe(0); // buffered
    globalThis.dispatchEvent(new Event('pagehide'));
    expect(harness.beacon.calls.length).toBe(1); // final flush
    const bodyText = await harness.beacon.calls[0]?.blob?.text();
    const parsed = JSON.parse(bodyText ?? '{}') as { events: unknown[] };
    expect(parsed.events.length).toBe(2);
  });

  it('B-6: oversized envelope (maxBatchSize × per-event-size > 64 KiB) → beacon_batch_drop', () => {
    if (harness === null) throw new Error('harness not initialised');
    const notices: Error[] = [];
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 100 },
          onInternalError: (err) => notices.push(err),
        }),
      ],
    });
    const logger = createLogger();
    // 100 × 1KB ≈ 100 KB > 64 KiB. Each event has a 1KB payload.
    const padding = 'x'.repeat(1024);
    for (let i = 0; i < 100; i += 1) logger.warn(`e${i}`, { v: padding });
    // Threshold-meeting push triggers a flush; envelope > 64 KiB →
    // beacon_batch_drop.
    expect(notices.length).toBe(1);
    expect((notices[0] as Error & { code?: string }).code).toBe('beacon_batch_drop');
    expect(harness.beacon.calls.length).toBe(0); // nothing delivered
  });

  it('B-7 / F-2: oversized single event ejected from batch; remaining batch still flushes', async () => {
    if (harness === null) throw new Error('harness not initialised');
    const notices: Error[] = [];
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 3 },
          onInternalError: (err) => notices.push(err),
        }),
      ],
    });
    const logger = createLogger();
    // To trigger transport-level oversize after the pipeline (which
    // caps individual string values at 8192 chars per the sanitizer),
    // we need MANY large attributes — 50 × 8192-char strings produces
    // a ~410 KB JSON payload, well over the 64 KiB sendBeacon budget.
    const big: Record<string, string> = {};
    for (let i = 0; i < 50; i += 1) big[`pad${i}`] = 'x'.repeat(8192);

    logger.warn('e0', { tag: 'small-0' });
    logger.warn('e1-oversized', big); // > 64 KiB after JSON.stringify → ejected
    logger.warn('e2', { tag: 'small-2' });
    logger.warn('e3', { tag: 'small-3' }); // threshold (size 3 of NON-oversized) reached

    const oversizedNotices = notices.filter(
      (n) => (n as Error & { code?: string }).code === 'oversized_event',
    );
    expect(oversizedNotices.length).toBe(1);
    // Remaining batch (e0, e2, e3) flushed normally.
    expect(harness.beacon.calls.length).toBe(1);
    const bodyText = await harness.beacon.calls[0]?.blob?.text();
    const parsed = JSON.parse(bodyText ?? '{}') as { events: { message: string }[] };
    expect(parsed.events.map((e) => e.message)).toEqual(['e0', 'e2', 'e3']);
  });

  it('B-9: pagehide-fired flush failure emits exactly one beacon_batch_drop notice', () => {
    if (harness === null) throw new Error('harness not initialised');
    // Force both primitives to fail.
    harness.beacon.uninstall();
    harness.beacon = installSendBeaconDouble({ returnValue: false });
    harness.fetch.uninstall();
    harness.fetch = installFetchDouble({
      behavior: { kind: 'reject', reason: new TypeError('Failed to fetch (synthetic)') },
    });

    const notices: Error[] = [];
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 100 },
          onInternalError: (err) => notices.push(err),
        }),
      ],
    });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1');
    // Pagehide-fired flush: both primitives refuse → batch drop.
    globalThis.dispatchEvent(new Event('pagehide'));
    // Wait for fetch's rejected Promise to settle.
    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(notices.length).toBe(1);
        expect((notices[0] as Error & { code?: string }).code).toBe('beacon_batch_drop');
        r();
      }, 0),
    );
  });

  it('B-10: shutdown with non-empty buffer + flush failure emits one beacon_batch_drop notice; listener removed', async () => {
    if (harness === null) throw new Error('harness not initialised');
    harness.beacon.uninstall();
    harness.beacon = installSendBeaconDouble({ returnValue: false });
    harness.fetch.uninstall();
    harness.fetch = installFetchDouble({
      behavior: { kind: 'reject', reason: new Error('synthetic') },
    });

    const notices: Error[] = [];
    const transport = createBeaconTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 100 },
      onInternalError: (err) => notices.push(err),
    });
    configureLogging({ transports: [transport] });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1');
    await transport.shutdown?.();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(notices.length).toBe(1);
    expect((notices[0] as Error & { code?: string }).code).toBe('beacon_batch_drop');
    // Pagehide listener removed.
    expect(harness.listenerSpy.removals.filter((r) => r.type === 'pagehide').length).toBe(1);
  });

  it('B-11: drop notice payload contains no event content', () => {
    if (harness === null) throw new Error('harness not initialised');
    harness.beacon.uninstall();
    harness.beacon = installSendBeaconDouble({ returnValue: false });
    harness.fetch.uninstall();
    harness.fetch = installFetchDouble({
      behavior: { kind: 'reject', reason: new Error('synthetic') },
    });

    const notices: Error[] = [];
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 2 },
          onInternalError: (err) => notices.push(err),
        }),
      ],
    });
    const logger = createLogger();
    logger.warn('SECRET_MESSAGE', { secretAttr: 'top-secret-value' });
    logger.warn('ANOTHER_SECRET', { otherAttr: 'also-secret' });
    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(notices.length).toBe(1);
        const msg = (notices[0] as Error).message;
        // Notice message MUST contain droppedCount + transport name,
        // but MUST NOT include event message / attribute content.
        expect(msg).toMatch(/droppedCount/);
        expect(msg).not.toMatch(/SECRET_MESSAGE/);
        expect(msg).not.toMatch(/top-secret-value/);
        expect(msg).not.toMatch(/ANOTHER_SECRET/);
        expect(msg).not.toMatch(/also-secret/);
        r();
      }, 0),
    );
  });

  it('B-12: flush() synchronizes against the current batch only', async () => {
    if (harness === null) throw new Error('harness not initialised');
    const transport = createBeaconTransport({
      endpoint: ENDPOINT,
      batching: { maxBatchSize: 100 },
    });
    configureLogging({ transports: [transport] });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1');
    expect(harness.beacon.calls.length).toBe(0);
    await transport.flush?.();
    expect(harness.beacon.calls.length).toBe(1);
    // flush() on empty buffer is a no-op.
    await transport.flush?.();
    expect(harness.beacon.calls.length).toBe(1);
  });

  it('F-8: rate-limit per code per transport per session (single beacon_batch_drop notice across N failed flushes)', () => {
    if (harness === null) throw new Error('harness not initialised');
    harness.beacon.uninstall();
    harness.beacon = installSendBeaconDouble({ returnValue: false });
    harness.fetch.uninstall();
    harness.fetch = installFetchDouble({
      behavior: { kind: 'reject', reason: new Error('synthetic') },
    });

    const notices: Error[] = [];
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 2 },
          onInternalError: (err) => notices.push(err),
        }),
      ],
    });
    const logger = createLogger();
    // Multiple batches each fail. Only ONE notice should fire per
    // session for beacon_batch_drop (F-8).
    for (let i = 0; i < 6; i += 1) logger.warn(`e${i}`);
    return new Promise<void>((r) =>
      setTimeout(() => {
        expect(notices.length).toBe(1);
        expect((notices[0] as Error & { code?: string }).code).toBe('beacon_batch_drop');
        r();
      }, 0),
    );
  });

  it('SC-010: configureLogging() swap during pending batch drains OR fires exactly one drop notice — never both, never neither', async () => {
    if (harness === null) throw new Error('harness not initialised');
    const noticesA: Error[] = [];
    const bt1 = createBeaconTransport({
      endpoint: 'https://logs-a.example.com/ingest',
      name: 'beacon-a',
      batching: { maxBatchSize: 100 },
      onInternalError: (err) => noticesA.push(err),
    });
    configureLogging({ transports: [bt1] });
    const logger = createLogger();
    logger.warn('e0');
    logger.warn('e1'); // bt1 holds 2 buffered events

    // Swap: configureLogging() with a different transport. Feature
    // 001's runtime swap calls shutdown() on the previous transport,
    // which drains bt1's batch (per FR-031).
    const bt2 = createBeaconTransport({
      endpoint: 'https://logs-b.example.com/ingest',
      name: 'beacon-b',
    });
    configureLogging({ transports: [bt2] });
    await new Promise<void>((r) => setTimeout(r, 0));

    // Outcome (a): bt1's batch delivered to endpoint A
    const callsToA = harness.beacon.calls.filter(
      (c) => c.endpoint === 'https://logs-a.example.com/ingest',
    );
    const draindelivered = callsToA.length === 1;

    // Outcome (b): exactly one beacon_batch_drop notice on bt1
    const dropNotice = noticesA.filter(
      (n) => (n as Error & { code?: string }).code === 'beacon_batch_drop',
    ).length === 1;

    // Exactly one outcome — never both, never neither, never partial.
    expect(draindelivered !== dropNotice).toBe(true);
    if (draindelivered) {
      const bodyText = await callsToA[0]?.blob?.text();
      const parsed = JSON.parse(bodyText ?? '{}') as { events: { message: string }[] };
      expect(parsed.events.map((e) => e.message)).toEqual(['e0', 'e1']);
    }
  });
});
