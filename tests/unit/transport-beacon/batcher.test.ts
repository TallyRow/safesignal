/**
 * T024 [US3] — Batcher state-machine unit tests.
 *
 * Locks B-5 (single-flush-attempt + buffer cleared before delivery)
 * and B-8 (one-shot maxAge timer, armed once per batch, cancelled on
 * flush). Uses `installSetTimeoutSpy` from `tests/helpers/beacon-
 * network.ts` to drive the age-trigger deterministically without
 * waiting for real time.
 *
 * Status: every `it` block carries the full assertion body but is
 * grouped under `describe.skip(...)` because `createBatcher` is a
 * stub (throws on invocation) until T027 lands the real state
 * machine. Removing the `.skip` after T027 unlocks all six cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBatcher } from '../../../src/transport-beacon/batcher.js';
import { installSetTimeoutSpy } from '../../helpers/beacon-network.js';

type AnyLogEvent = {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  attributes: Record<string, unknown>;
  context: Record<string, unknown>;
};

function event(message: string): AnyLogEvent {
  return {
    timestamp: '2026-05-27T00:00:00.000Z',
    level: 'warn',
    message,
    attributes: {},
    context: {},
  };
}

describe('createBatcher state machine', () => {
  let timerSpy: ReturnType<typeof installSetTimeoutSpy> | null = null;

  beforeEach(() => {
    timerSpy = installSetTimeoutSpy();
  });

  afterEach(() => {
    timerSpy?.uninstall();
    timerSpy = null;
  });

  it('B-5a: pushing N < maxBatchSize events does not flush', () => {
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 5,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    for (let i = 0; i < 4; i += 1) b.push(event(`e${i}`) as never);
    expect(flushed.length).toBe(0);
  });

  it('B-5b: pushing the maxBatchSize-th event flushes synchronously at the end of push', () => {
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 3,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    b.push(event('e0') as never);
    b.push(event('e1') as never);
    expect(flushed.length).toBe(0);
    b.push(event('e2') as never); // threshold-meeting push
    expect(flushed.length).toBe(1);
    expect(flushed[0]?.map((e) => e.message)).toEqual(['e0', 'e1', 'e2']);
  });

  it('B-5c: buffer is cleared BEFORE the network primitive is invoked (re-entrant push during flush)', () => {
    const flushed: AnyLogEvent[][] = [];
    let reentrant: Batcher | null = null;
    const b = createBatcher({
      maxBatchSize: 2,
      flush: (events) => {
        flushed.push(events as AnyLogEvent[]);
        // Re-entrant push: simulate a transport whose flush callback
        // ends up emitting another event (e.g., via a synchronous
        // logger.warn). The batcher MUST start a new batch — the
        // buffer was cleared before this callback ran.
        if (reentrant !== null) {
          reentrant.push(event('re-entrant') as never);
        }
      },
    });
    reentrant = b as unknown as Batcher;
    b.push(event('e0') as never);
    b.push(event('e1') as never); // triggers flush
    // The first flush delivered [e0, e1]. The re-entrant push pushed
    // 're-entrant' into a NEW empty buffer — no double-flush, no
    // re-push of [e0, e1].
    expect(flushed.length).toBe(1);
    expect(flushed[0]?.map((e) => e.message)).toEqual(['e0', 'e1']);
  });

  it('B-5d: flush failure does not re-push events into the buffer', () => {
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 2,
      flush: (events) => {
        flushed.push(events as AnyLogEvent[]);
        throw new Error('synthetic flush failure');
      },
    });
    expect(() => {
      b.push(event('e0') as never);
      b.push(event('e1') as never); // triggers flush; callback throws
    }).not.toThrow();
    // Flush callback was invoked exactly once with the original batch.
    expect(flushed.length).toBe(1);
    // After the failed flush, the buffer is empty — subsequent pushes
    // start a fresh batch.
    b.push(event('e2') as never);
    b.push(event('e3') as never);
    expect(flushed.length).toBe(2);
    expect(flushed[1]?.map((e) => e.message)).toEqual(['e2', 'e3']);
  });

  it('B-8a: timer is armed exactly once when the first event enters an empty batch', () => {
    if (timerSpy === null) throw new Error('timer spy not initialised');
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 100,
      maxBatchAgeMs: 5000,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    // No timer until the first push.
    expect(timerSpy.creations.length).toBe(0);
    b.push(event('e0') as never);
    expect(timerSpy.creations.length).toBe(1);
    expect(timerSpy.creations[0]?.delay).toBe(5000);
    // Subsequent pushes do NOT re-arm the timer.
    b.push(event('e1') as never);
    b.push(event('e2') as never);
    expect(timerSpy.creations.length).toBe(1);
  });

  it('B-8b: timer is cleared at flush; subsequent push after flush re-arms the timer', () => {
    if (timerSpy === null) throw new Error('timer spy not initialised');
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 2,
      maxBatchAgeMs: 5000,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    b.push(event('e0') as never);
    expect(timerSpy.creations.length).toBe(1);
    b.push(event('e1') as never); // triggers flush
    expect(flushed.length).toBe(1);
    // Timer cancelled.
    expect(timerSpy.clears).toContain(timerSpy.creations[0]?.id);

    // Next push after flush re-arms a fresh timer.
    b.push(event('e2') as never);
    expect(timerSpy.creations.length).toBe(2);
    expect(timerSpy.creations[1]?.delay).toBe(5000);
  });

  it('B-8c: timer firing triggers a flush of the current buffer', () => {
    if (timerSpy === null) throw new Error('timer spy not initialised');
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 10,
      maxBatchAgeMs: 5000,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    b.push(event('e0') as never);
    b.push(event('e1') as never);
    expect(flushed.length).toBe(0);
    // Simulate timer firing.
    timerSpy.fire(0);
    expect(flushed.length).toBe(1);
    expect(flushed[0]?.map((e) => e.message)).toEqual(['e0', 'e1']);
  });

  it('shutdown cancels the pending timer and inhibits further flush callbacks', () => {
    if (timerSpy === null) throw new Error('timer spy not initialised');
    const flushed: AnyLogEvent[][] = [];
    const b = createBatcher({
      maxBatchSize: 10,
      maxBatchAgeMs: 5000,
      flush: (events) => flushed.push(events as AnyLogEvent[]),
    });
    b.push(event('e0') as never);
    expect(timerSpy.creations.length).toBe(1);
    b.shutdown();
    // Timer cancelled at shutdown.
    expect(timerSpy.clears).toContain(timerSpy.creations[0]?.id);
    // Even if the timer somehow fires after shutdown (e.g., from a
    // racing callback), the batcher's flush callback MUST NOT be
    // invoked.
    expect(() => timerSpy?.fire(0)).toThrow(/cleared/);
    expect(flushed.length).toBe(0);
  });
});

// Re-declare here because of `describe.skip` + TS unused-import rules.
type Batcher = import('../../../src/transport-beacon/batcher.js').Batcher;
