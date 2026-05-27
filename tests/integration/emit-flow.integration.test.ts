/**
 * Browser-runtime integration coverage for the US1 emit flow.
 *
 * Verifies (per T021 acceptance):
 *   - All four levels emit synchronously without throwing under `happy-dom`.
 *   - Production defaults drop `debug`/`info`, pass `warn`/`error`.
 *   - Re-configuring transports mid-test routes new emits to the new
 *     transports without breaking existing logger references — including
 *     child loggers derived before the reconfigure.
 *   - Emission calls return synchronously (`undefined`, not a Promise),
 *   - Emit with no configured transport never throws,
 *   - A rejecting transport does not leak into the global
 *     `unhandledrejection` channel.
 *   - A tight time budget for 1000 emits (sanity check that the level
 *     filter + context merge stay O(1) per emit).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureLogging,
  createLogger,
  type LogEvent,
} from '../../src/index.js';
import { installUnhandledRejectionGuard } from '../helpers/assert-no-unhandled.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
  makeRejectingTransport,
  makeThrowingTransport,
} from '../helpers/failing-transport.js';

describe('Browser-runtime emit flow (happy-dom)', () => {
  let capturing: CapturingTransport;

  beforeEach(() => {
    capturing = makeCapturingTransport();
    configureLogging({
      environment: 'development',
      transports: [capturing],
    });
  });

  it('confirms happy-dom is the active test environment', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
    expect(typeof navigator).toBe('object');
  });

  it('all four levels emit synchronously', () => {
    const log = createLogger();
    const before = capturing.calls.length;
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    // No await, no microtask — events must be captured by now.
    expect(capturing.calls.length).toBe(before + 4);
    expect(capturing.calls.map((c: LogEvent) => c.level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ]);
  });

  it('emit methods return undefined (never a Promise)', () => {
    const log = createLogger();
    expect(log.debug('x')).toBeUndefined();
    expect(log.info('x')).toBeUndefined();
    expect(log.warn('x')).toBeUndefined();
    expect(log.error('x')).toBeUndefined();
    expect(log.error('x', {}, new Error('boom'))).toBeUndefined();
  });

  it('emit with no configured transport never throws', () => {
    configureLogging({ environment: 'development', transports: [] });
    const log = createLogger();
    expect(() => log.debug('x')).not.toThrow();
    expect(() => log.info('x')).not.toThrow();
    expect(() => log.warn('x')).not.toThrow();
    expect(() => log.error('x')).not.toThrow();
    expect(() => log.error('x', {}, new Error('boom'))).not.toThrow();
  });

  it('emit with a synchronously-throwing transport never throws to the caller', () => {
    configureLogging({
      environment: 'development',
      transports: [makeThrowingTransport()],
    });
    const log = createLogger();
    expect(() => log.warn('m')).not.toThrow();
    expect(() => log.error('m')).not.toThrow();
  });

  it('production defaults drop debug/info, pass warn/error', () => {
    configureLogging({ environment: 'production', transports: [capturing] });
    const log = createLogger();
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(capturing.calls.length).toBe(2);
    expect(capturing.calls.map((c) => c.level)).toEqual(['warn', 'error']);
  });

  it('reconfiguring transports mid-test routes new emits to the new transports', () => {
    const first = makeCapturingTransport('first');
    configureLogging({ environment: 'development', transports: [first] });
    const log = createLogger();
    log.info('one');
    expect(first.calls.map((c) => c.message)).toEqual(['one']);

    // Mid-test reconfigure. Same logger reference.
    const second = makeCapturingTransport('second');
    configureLogging({ environment: 'development', transports: [second] });
    log.info('two');

    expect(first.calls.map((c) => c.message)).toEqual(['one']);
    expect(second.calls.map((c) => c.message)).toEqual(['two']);
  });

  it('a child logger created before reconfigure still works after reconfigure', () => {
    const first = makeCapturingTransport('first');
    configureLogging({ environment: 'development', transports: [first] });
    const log = createLogger();
    const child = log.child({ attributes: { requestId: 'r-1' } });

    const second = makeCapturingTransport('second');
    configureLogging({ environment: 'development', transports: [second] });

    child.info('after reconfigure');
    expect(second.calls.length).toBe(1);
    expect(second.calls[0]?.context.attributes?.requestId).toBe('r-1');
  });

  it('a rejecting transport does not leak into window.unhandledrejection', async () => {
    const guard = installUnhandledRejectionGuard();
    try {
      configureLogging({
        environment: 'development',
        transports: [makeRejectingTransport()],
      });
      const log = createLogger();
      log.info('m');
      log.warn('m');
      log.error('m');
      // Yield a few microtasks so any unhandled rejection has time to surface.
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      guard.assertNone();
    } finally {
      guard.dispose();
    }
  });

  it('handles 1000 synchronous emissions within a generous time budget', () => {
    const log = createLogger();
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      log.info('tight loop', { i });
    }
    const elapsed = performance.now() - start;
    expect(capturing.calls.length).toBeGreaterThanOrEqual(1000);
    // The plan's hot-path budget is non-blocking; 500ms for 1000 events is
    // a very generous CI ceiling (~500µs per emit) — failures here indicate
    // a real performance regression in the level filter + context merge +
    // dispatch pipeline.
    expect(elapsed).toBeLessThan(500);
  });
});
