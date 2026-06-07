/**
 * Contract test: opt-in error breadcrumbs
 * (specs/016-error-breadcrumbs — BC-1..BC-5, BC-10, BC-12). Exercised end-to-end
 * via configureLogging + a capturing transport.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const TRAIL = 'safesignal.breadcrumbs';
const CAUSES = 'safesignal.errorCauses';

let cap: CapturingTransport;

function lastErrorEvent() {
  const errs = cap.calls.filter((e) => e.level === 'error');
  return errs[errs.length - 1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('breadcrumbs — disabled by default (BC-1)', () => {
  beforeEach(() => {
    cap = makeCapturingTransport();
    configureLogging({ environment: 'test', transports: [cap] });
  });

  it('attaches no trail and records nothing when not configured', () => {
    const log = createLogger();
    log.info('a');
    log.warn('b');
    log.error('boom');
    const err = lastErrorEvent()!;
    expect(err.attributes[TRAIL]).toBeUndefined();
    expect(err.attributes[CAUSES]).toBeUndefined();
  });
});

describe('breadcrumbs — recent-event trail (BC-2, BC-3)', () => {
  beforeEach(() => {
    cap = makeCapturingTransport();
    configureLogging({
      application: { name: 'checkout-web' },
      environment: 'test',
      level: 'debug',
      transports: [cap],
      breadcrumbs: true,
    });
  });

  it('an error carries the preceding events oldest→newest, excluding itself', () => {
    const log = createLogger();
    log.info('checkout opened', { cartItems: 3 });
    log.warn('coupon expired');
    log.debug('retrying');
    log.error('checkout failed');

    const err = lastErrorEvent()!;
    const trail = err.attributes[TRAIL] as unknown as Array<{
      level: string;
      message: string;
      app?: string;
    }>;
    expect(trail.map((b) => b.message)).toEqual([
      'checkout opened',
      'coupon expired',
      'retrying',
    ]);
    expect(trail.map((b) => b.level)).toEqual(['info', 'warn', 'debug']);
    expect(trail[0]!.app).toBe('checkout-web');
    // The error itself is not in its own trail.
    expect(trail.some((b) => b.message === 'checkout failed')).toBe(false);
  });

  it('under-fill: fewer than maxEvents → exactly the available events, no padding', () => {
    const log = createLogger();
    log.info('only one');
    log.error('boom');
    const trail = lastErrorEvent()!.attributes[TRAIL] as unknown as unknown[];
    expect(trail).toHaveLength(1);
  });

  it('a non-error event is delivered unchanged (no trail) and recorded for later', () => {
    const log = createLogger();
    log.info('first');
    const infoEvent = cap.calls.find((e) => e.message === 'first')!;
    expect(infoEvent.attributes[TRAIL]).toBeUndefined();
    log.error('boom');
    const trail = lastErrorEvent()!.attributes[TRAIL] as unknown as unknown[];
    expect(trail).toHaveLength(1);
  });
});

describe('breadcrumbs — cause chain (BC-4, BC-5)', () => {
  beforeEach(() => {
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      breadcrumbs: true,
    });
  });

  it('unrolls a nested cause chain outermost→root (excluding the top error)', () => {
    const log = createLogger();
    const err = new Error('checkout failed', {
      cause: new Error('payment processor 5xx'),
    });
    log.error('checkout failed', {}, err);
    const causes = lastErrorEvent()!.attributes[CAUSES] as unknown as Array<{
      name: string;
      message: string;
    }>;
    expect(causes).toEqual([
      { name: 'Error', message: 'payment processor 5xx' },
    ]);
  });

  it('omits the cause field when there is no cause', () => {
    createLogger().error('boom', {}, new Error('no cause'));
    expect(lastErrorEvent()!.attributes[CAUSES]).toBeUndefined();
  });

  it('a non-Error cause reduces to { name: NonError, message: String(value) }', () => {
    createLogger().error(
      'boom',
      {},
      new Error('top', { cause: 'plain string cause' }),
    );
    const causes = lastErrorEvent()!.attributes[CAUSES] as unknown as Array<{
      name: string;
      message: string;
    }>;
    expect(causes[0]).toEqual({
      name: 'NonError',
      message: 'plain string cause',
    });
  });

  it('a cyclic / very deep chain is bounded to ≤ 8 entries with no loop/throw', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a; // cycle
    expect(() => createLogger().error('boom', {}, a)).not.toThrow();
    const causes = lastErrorEvent()!.attributes[CAUSES] as unknown as unknown[];
    expect(causes.length).toBeGreaterThan(0);
    expect(causes.length).toBeLessThanOrEqual(8);
  });
});

describe('breadcrumbs — config clamp + fail-safe (BC-10, BC-12)', () => {
  it('maxEvents out of [1,100] clamps with one onInternalError notice', () => {
    const onInternalError = vi.fn();
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      breadcrumbs: { maxEvents: 5000 },
      onInternalError,
    });
    // one clamp notice at configure time
    expect(onInternalError).toHaveBeenCalledTimes(1);
    expect(onInternalError.mock.calls[0]![0].message).toMatch(/clamped to 100/);
  });

  it('clamps maxEvents below 1 up to 1', () => {
    const onInternalError = vi.fn();
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      level: 'debug',
      transports: [cap],
      breadcrumbs: { maxEvents: 0 },
      onInternalError,
    });
    expect(onInternalError.mock.calls[0]![0].message).toMatch(/clamped to 1/);
    const log = createLogger();
    log.info('a');
    log.info('b');
    log.error('boom');
    const trail = lastErrorEvent()!.attributes[TRAIL] as unknown as unknown[];
    expect(trail).toHaveLength(1); // capacity 1 → only the most recent
  });

  it('a throwing cause is swallowed — the error event is still delivered (fail-safe)', () => {
    const onInternalError = vi.fn();
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      breadcrumbs: true,
      onInternalError,
    });
    const evilCause = {
      toString() {
        throw new Error('boom-in-toString');
      },
    };
    expect(() =>
      createLogger().error(
        'failed',
        {},
        new Error('top', { cause: evilCause }),
      ),
    ).not.toThrow();
    // The error was still delivered (without a cause chain).
    expect(lastErrorEvent()!.message).toBe('failed');
    expect(lastErrorEvent()!.attributes[CAUSES]).toBeUndefined();
    expect(onInternalError).toHaveBeenCalled();
  });
});
