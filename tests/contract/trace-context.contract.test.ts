/**
 * T006 [US1] — Contract tests for trace-context carriage + merge + carry-only
 * (TC-2, TC-3, TC-6).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  configureLogging,
  createLogger,
  getRootLogger,
} from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const TRACE_A = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  traceFlags: 1,
};
const TRACE_B = {
  traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  spanId: 'bbbbbbbbbbbbbbbb',
  traceFlags: 0,
};

let cap = makeCapturingTransport('cap');

beforeEach(() => {
  clearActiveRuntimeForTests();
  cap = makeCapturingTransport('cap');
});
afterEach(() => clearActiveRuntimeForTests());

describe('TC-2 — field carriage', () => {
  it('carries a supplied trace context on every emitted event', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      context: { trace: TRACE_A },
      transports: [cap],
    });
    getRootLogger().error('boom');
    expect(cap.calls[0]!.context.trace).toEqual(TRACE_A);
  });

  it('TC-6 — no supply ⇒ no trace field (carry-only, no minted ids)', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      transports: [cap],
    });
    getRootLogger().error('boom');
    expect(cap.calls[0]!.context.trace).toBeUndefined();
  });
});

describe('TC-3 — merge precedence (shallow-replace, later wins)', () => {
  it('correlation() overrides withContext() overrides root', () => {
    let active = TRACE_A;
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      context: { trace: TRACE_A },
      correlation: () => ({ trace: active }),
      transports: [cap],
    });
    const log = createLogger().withContext({ trace: TRACE_B });

    active = TRACE_B;
    log.error('one');
    expect(cap.calls[0]!.context.trace).toEqual(TRACE_B); // correlation wins

    // The whole trace is replaced atomically — no mixing of ids across layers.
    active = TRACE_A;
    log.error('two');
    expect(cap.calls[1]!.context.trace).toEqual(TRACE_A);
  });
});
