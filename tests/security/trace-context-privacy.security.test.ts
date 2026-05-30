/**
 * T023 — Trace-context privacy/security (TC-7, FR-009).
 *
 * Trace context must not weaken redaction: a sensitive attribute is still
 * redacted when trace is present, trace ids pass through unchanged, and an
 * over-bound `traceState` is dropped (bounded, no unbounded carriage).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, getRootLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { MAX_TRACESTATE_LEN } from '../../src/trace/validate.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const TRACE = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  traceFlags: 1,
};

let cap = makeCapturingTransport('cap');

beforeEach(() => {
  clearActiveRuntimeForTests();
  cap = makeCapturingTransport('cap');
});
afterEach(() => clearActiveRuntimeForTests());

describe('trace context does not weaken redaction', () => {
  it('still redacts a sensitive attribute while trace ids pass through', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      context: { trace: TRACE },
      transports: [cap],
    });
    getRootLogger().error('auth.failed', { password: 'hunter2', userId: 'u1' });

    const ev = cap.calls[0]!;
    // Default redactor still redacts `password`…
    expect(ev.attributes.password).toBe('[REDACTED]');
    expect(ev.attributes.userId).toBe('u1');
    // …and trace ids are carried unchanged (not redacted, not secrets).
    expect(ev.context.trace).toEqual(TRACE);
  });

  it('drops an over-bound traceState (bounded carriage), keeping the ids', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      context: {
        trace: { ...TRACE, traceState: 'x'.repeat(MAX_TRACESTATE_LEN + 1) },
      },
      transports: [cap],
    });
    getRootLogger().error('boom');

    const trace = cap.calls[0]!.context.trace!;
    expect(trace.traceState).toBeUndefined();
    expect(trace.traceId).toBe(TRACE.traceId);
  });
});
