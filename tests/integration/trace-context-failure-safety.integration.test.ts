/**
 * T012 [US2] + T015 [US3] — Trace-context fail-safety + dynamic correlation.
 *
 * Malformed trace input never throws and never blocks the log (TC-4); a
 * `correlation()` hook supplying a changing trace yields per-event context.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  configureLogging,
  createLogger,
  getRootLogger,
} from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const VALID = {
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

describe('malformed trace input is fail-closed', () => {
  it('emits the event without trace fields and never throws (config-supplied)', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      // Invalid: bad ids.
      context: { trace: { traceId: 'nope', spanId: 'nope' } as never },
      transports: [cap],
    });
    expect(() => getRootLogger().error('boom')).not.toThrow();
    expect(cap.calls[0]!.context.trace).toBeUndefined();
  });

  it('emits without trace when supplied via withContext, then a valid one still works', () => {
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      transports: [cap],
    });
    createLogger()
      .withContext({ trace: { traceId: 'x', spanId: 'y' } as never })
      .error('bad');
    expect(cap.calls[0]!.context.trace).toBeUndefined();

    createLogger().withContext({ trace: VALID }).error('good');
    expect(cap.calls[1]!.context.trace).toEqual(VALID);
  });
});

describe('dynamic correlation()', () => {
  it('picks up the current trace at each emit (US3 scenario 2)', () => {
    let current: typeof VALID | undefined = VALID;
    configureLogging({
      application: { name: 'app' },
      environment: 'production',
      correlation: () => (current ? { trace: current } : {}),
      transports: [cap],
    });
    const log = getRootLogger();

    log.error('one');
    expect(cap.calls[0]!.context.trace).toEqual(VALID);

    current = undefined; // span ended
    log.error('two');
    expect(cap.calls[1]!.context.trace).toBeUndefined();

    current = {
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: 'bbbbbbbbbbbbbbbb',
      traceFlags: 0,
    };
    log.error('three');
    expect(cap.calls[2]!.context.trace).toMatchObject({
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });
});
