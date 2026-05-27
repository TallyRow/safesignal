/**
 * Shared-runtime fan-out test (T060 — part 2).
 *
 * Locks the FR-030 "Logger instances MUST share the active configured
 * runtime" guarantee at the delivery layer: many module loggers emit
 * concurrently and EVERY configured transport receives EVERY event
 * exactly once, with consistent per-transport ordering matching the
 * emission order.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'shared-runtime-fanout', version: '1.0.0' };

beforeEach(() => {
  clearActiveRuntimeForTests();
});

describe('shared-runtime fan-out: every transport receives every event exactly once', () => {
  it('three transports each see all 500 events from 50 module loggers, in emission order', () => {
    const t1 = makeCapturingTransport('t1');
    const t2 = makeCapturingTransport('t2');
    const t3 = makeCapturingTransport('t3');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [t1, t2, t3],
    });
    const modules = Array.from({ length: 50 }, (_, i) => `mod-${String(i)}`);
    const loggers = modules.map((name) =>
      createLogger({ module: { name, version: '1.0' } }),
    );
    let seq = 0;
    for (let pass = 0; pass < 10; pass++) {
      for (const log of loggers) {
        log.info(`evt-${String(seq)}`);
        seq++;
      }
    }
    expect(t1.calls).toHaveLength(500);
    expect(t2.calls).toHaveLength(500);
    expect(t3.calls).toHaveLength(500);
    // Per-transport order matches emission order.
    for (let i = 0; i < 500; i++) {
      expect(t1.calls[i]!.message).toBe(`evt-${String(i)}`);
      expect(t2.calls[i]!.message).toBe(`evt-${String(i)}`);
      expect(t3.calls[i]!.message).toBe(`evt-${String(i)}`);
    }
  });

  it('every event from every module is attributed correctly at every transport', () => {
    const a = makeCapturingTransport('a');
    const b = makeCapturingTransport('b');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [a, b],
    });
    const modA = createLogger({ module: { name: 'mod-A', version: '1' } });
    const modB = createLogger({ module: { name: 'mod-B', version: '2' } });
    for (let i = 0; i < 100; i++) {
      modA.info(`a-${String(i)}`);
      modB.info(`b-${String(i)}`);
    }
    expect(a.calls).toHaveLength(200);
    expect(b.calls).toHaveLength(200);

    // Each transport sees the same sequence with correct module attribution.
    for (let i = 0; i < 100; i++) {
      expect(a.calls[i * 2]!.context.module?.name).toBe('mod-A');
      expect(a.calls[i * 2 + 1]!.context.module?.name).toBe('mod-B');
      expect(b.calls[i * 2]!.context.module?.name).toBe('mod-A');
      expect(b.calls[i * 2 + 1]!.context.module?.name).toBe('mod-B');
    }
  });

  it('host + module loggers share the same transport set (single delivery pipeline)', () => {
    const cap = makeCapturingTransport('cap');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [cap],
    });
    const hostLog = createLogger();
    const modLog = createLogger({ module: { name: 'mod', version: '1' } });
    hostLog.info('host-1');
    modLog.info('mod-1');
    hostLog.info('host-2');
    modLog.info('mod-2');
    expect(cap.calls).toHaveLength(4);
    expect(cap.calls.map((c) => c.message)).toEqual([
      'host-1',
      'mod-1',
      'host-2',
      'mod-2',
    ]);
    // Host events have no module; mod events have it.
    expect(cap.calls[0]!.context.module).toBeUndefined();
    expect(cap.calls[1]!.context.module?.name).toBe('mod');
    expect(cap.calls[2]!.context.module).toBeUndefined();
    expect(cap.calls[3]!.context.module?.name).toBe('mod');
  });
});
