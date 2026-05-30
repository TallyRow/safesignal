/**
 * T019 [US4] — Lightweight-`Logger` test for trace context (TC-8, VII).
 *
 * Trace context adds NO per-`Logger` cost: creating + deriving many loggers
 * with trace context configured installs no listeners/timers; validation is
 * per-emit, not per-`Logger`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import {
  installAddEventListenerSpy,
  installSetTimeoutSpy,
} from '../helpers/beacon-network.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const TRACE = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  traceFlags: 1,
};

let listener: ReturnType<typeof installAddEventListenerSpy> | null = null;
let timers: ReturnType<typeof installSetTimeoutSpy> | null = null;

beforeEach(() => {
  clearActiveRuntimeForTests();
  listener = installAddEventListenerSpy();
  timers = installSetTimeoutSpy();
});
afterEach(() => {
  timers?.uninstall();
  listener?.uninstall();
  clearActiveRuntimeForTests();
  listener = null;
  timers = null;
});

describe('trace context is per-emit, not per-Logger', () => {
  it('creating + deriving 500 loggers with trace adds no listeners/timers', () => {
    const cap = makeCapturingTransport('cap');
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      context: { trace: TRACE },
      transports: [cap],
    });

    const N = 500;
    for (let i = 0; i < N; i += 1) {
      const base = createLogger({ module: { name: `mod-${i}` } });
      base.withContext({ trace: TRACE, attributes: { i } }).error(`e${i}`);
    }

    // Every event carried trace (per-emit resolution worked).
    expect(cap.calls).toHaveLength(N);
    expect(cap.calls[0]!.context.trace).toEqual(TRACE);
    // No global listeners / timers introduced by trace handling.
    const pagehide = listener!.registrations.filter(
      (r) => r.type === 'pagehide',
    );
    expect(pagehide.length).toBe(0);
    expect(timers!.creations.length).toBe(0);
  });
});
