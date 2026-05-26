/**
 * Contract test: Transport behavior (T-1..T-9 from
 * `contracts/transport.md`).
 *
 * Scope:
 *   - T-1 transport receives a canonical post-pipeline `LogEvent`
 *   - T-2 the package wraps every transport in `SafeTransport`
 *   - T-3 sync throws from `send()` never escape to the emit call site
 *   - T-4 rejected Promises from `send()` never produce unhandled rejections
 *   - T-5 one `onInternalError` notice per transport per session on first failure
 *   - T-6 subsequent failures from the same transport are silent
 *   - T-7 a failing transport does NOT prevent siblings from receiving events
 *   - T-8 `flush()` / `shutdown()` are optional; missing hooks no-op
 *   - T-9 replacing the transport list via `configureLogging()` does not
 *         require touching any existing logger reference
 *
 * Acceptance extras (per tasks.md T026):
 *   - "Swap transports mid-flight" — existing logger references keep
 *     delivering after `configureLogging()` is called again
 *   - Multi-transport fan-out — one transport's throw does not block
 *     siblings
 *   - `NoopTransport` auto-install — when `transports` is `undefined`
 *     or `[]`, emissions complete without error and no transport is
 *     observable through the public API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  configureLogging,
  createLogger,
  getRootLogger,
} from '../../src/api/logger.js';
import type { LogEvent } from '../../src/api/types.js';
import {
  makeCapturingTransport,
  makeFlakyTransport,
  makeRejectingTransport,
  makeThrowingTransport,
} from '../helpers/failing-transport.js';

const FIXED_APP = { name: 'transport-contract-test' };

// Every `configureLogging` call below sets `level: 'debug'` explicitly.
// The package default for unspecified environments is `warn`+, which would
// silently drop `info` emissions and make several T-3/T-7 assertions
// false-pass. We want emissions to reach the transport regardless of any
// environment-default change.

describe('Transport contract (T-1..T-9)', () => {
  let unhandled: unknown[];
  let unhandledHandler: (event: PromiseRejectionEvent) => void;

  beforeEach(() => {
    unhandled = [];
    unhandledHandler = (event): void => {
      unhandled.push(event.reason);
    };
    globalThis.addEventListener?.('unhandledrejection', unhandledHandler);
  });

  afterEach(() => {
    globalThis.removeEventListener?.('unhandledrejection', unhandledHandler);
    // Tear down to keep state clean across describe blocks.
    configureLogging({ application: FIXED_APP, level: 'debug', transports: [] });
  });

  describe('T-1: send() receives a canonical post-pipeline LogEvent', () => {
    it('shape: { timestamp, level, message, attributes, context, error? }', async () => {
      const capturing = makeCapturingTransport();
      configureLogging({
        application: FIXED_APP,
        environment: 'production',
        level: 'debug',
        transports: [capturing],
      });
      const logger = createLogger();
      logger.info('hello-from-T1', { k: 'v' });

      expect(capturing.calls).toHaveLength(1);
      const evt = capturing.calls[0] as LogEvent;
      expect(evt.timestamp).toBeTypeOf('string');
      expect(new Date(evt.timestamp).toString()).not.toBe('Invalid Date');
      expect(evt.level).toBe('info');
      expect(evt.message).toBe('hello-from-T1');
      expect(evt.attributes).toEqual({ k: 'v' });
      expect(evt.context).toMatchObject({ application: FIXED_APP });
      // `error` is only present when error() supplies one.
      expect(evt.error).toBeUndefined();
    });
  });

  describe('T-2: every configured transport is wrapped in SafeTransport', () => {
    it('the consumer instance is NOT the instance the dispatcher iterates', () => {
      const capturing = makeCapturingTransport('user-supplied');
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [capturing],
      });
      // Emission must succeed via the wrapper — the wrapper records the
      // received event onto the underlying capturing transport.
      const logger = createLogger();
      logger.warn('wrapped');
      expect(capturing.calls).toHaveLength(1);
      // Indirect proof of wrapping: a throwing transport's throw is
      // caught (T-3) — only a wrapper can do that.
      const thrower = makeThrowingTransport({ name: 'wrap-proof' });
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [thrower],
      });
      expect(() => createLogger().info('wrapped throw test')).not.toThrow();
      expect(thrower.calls).toHaveLength(1);
    });
  });

  describe('T-3: sync throw from send() never escapes the emit call site', () => {
    it('logger.* returns normally even when the transport throws', () => {
      const thrower = makeThrowingTransport({ name: 'T3' });
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [thrower],
        onInternalError,
      });
      const logger = createLogger();
      expect(() => logger.info('synchronous-throw')).not.toThrow();
      expect(() => logger.error('error-with-payload', {}, new Error('e'))).not.toThrow();
      expect(thrower.failureCount).toBe(2);
      expect(onInternalError).toHaveBeenCalledTimes(1);
    });
  });

  describe('T-4: rejected Promise from send() never surfaces as unhandled rejection', () => {
    it('emission resolves, single notice fires, no unhandled rejection observed', async () => {
      const rejecter = makeRejectingTransport({ name: 'T4' });
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [rejecter],
        onInternalError,
      });
      const logger = createLogger();
      for (let i = 0; i < 5; i++) {
        logger.info(`rejected ${String(i)}`);
      }
      // Allow microtasks to flush so the rejected Promises are observed.
      await Promise.resolve();
      await Promise.resolve();
      expect(rejecter.failureCount).toBe(5);
      expect(onInternalError).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
    });
  });

  describe('T-5 / T-6: exactly one onInternalError notice per transport per session', () => {
    it('repeated sync throws from the same transport produce ONE notice', () => {
      const thrower = makeThrowingTransport({ name: 'T5sync' });
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [thrower],
        onInternalError,
      });
      const logger = createLogger();
      for (let i = 0; i < 20; i++) {
        logger.warn(`burst ${String(i)}`);
      }
      expect(thrower.failureCount).toBe(20);
      expect(onInternalError).toHaveBeenCalledTimes(1);
    });

    it('repeated rejections from the same transport produce ONE notice', async () => {
      const rejecter = makeRejectingTransport({ name: 'T5async' });
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [rejecter],
        onInternalError,
      });
      const logger = createLogger();
      for (let i = 0; i < 20; i++) {
        logger.warn(`burst ${String(i)}`);
      }
      await Promise.resolve();
      await Promise.resolve();
      expect(rejecter.failureCount).toBe(20);
      expect(onInternalError).toHaveBeenCalledTimes(1);
    });

    it('each transport gets its own notice budget', () => {
      const a = makeThrowingTransport({ name: 'T6a' });
      const b = makeThrowingTransport({ name: 'T6b' });
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [a, b],
        onInternalError,
      });
      const logger = createLogger();
      logger.info('one');
      logger.info('two');
      // Two transports, two distinct notices total — one each, not one per
      // emission.
      expect(onInternalError).toHaveBeenCalledTimes(2);
      expect(a.failureCount).toBe(2);
      expect(b.failureCount).toBe(2);
    });
  });

  describe('T-7: a failing transport does NOT prevent siblings from receiving events', () => {
    it('thrower + capturing: capturing still receives every event', () => {
      const thrower = makeThrowingTransport({ name: 'T7-thrower' });
      const capturing = makeCapturingTransport('T7-capturing');
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [thrower, capturing],
        onInternalError,
      });
      const logger = createLogger();
      logger.info('one');
      logger.warn('two');
      logger.error('three');
      expect(thrower.failureCount).toBe(3);
      expect(capturing.calls).toHaveLength(3);
      expect(capturing.calls.map((e) => e.message)).toEqual([
        'one',
        'two',
        'three',
      ]);
    });

    it('order does not matter: capturing first, thrower second', () => {
      const capturing = makeCapturingTransport('T7-capturing-first');
      const thrower = makeThrowingTransport({ name: 'T7-thrower-second' });
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [capturing, thrower],
        onInternalError: () => undefined,
      });
      const logger = createLogger();
      logger.info('a');
      logger.info('b');
      expect(capturing.calls).toHaveLength(2);
      expect(thrower.failureCount).toBe(2);
    });

    it('flaky transport: siblings receive every event regardless of intermittent failures', () => {
      const flaky = makeFlakyTransport({ name: 'T7-flaky', failEvery: 2 });
      const capturing = makeCapturingTransport('T7-flaky-sibling');
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [flaky, capturing],
        onInternalError: () => undefined,
      });
      const logger = createLogger();
      for (let i = 0; i < 10; i++) {
        logger.info(`msg ${String(i)}`);
      }
      expect(capturing.calls).toHaveLength(10);
      expect(flaky.failureCount).toBeGreaterThan(0);
    });
  });

  describe('T-8: flush()/shutdown() are optional', () => {
    it('reconfigure with a transport that lacks flush/shutdown does not throw', () => {
      const minimal = { name: 'no-hooks', send: (): void => undefined };
      expect(() =>
        configureLogging({ application: FIXED_APP, level: 'debug', transports: [minimal] }),
      ).not.toThrow();
      // And re-configure again (which triggers the previous backend's
      // shutdown chain) — also no throw.
      expect(() =>
        configureLogging({ application: FIXED_APP, transports: [] }),
      ).not.toThrow();
    });
  });

  describe('T-9: existing logger references survive configureLogging() swaps', () => {
    it('a logger created before reconfigure routes to the NEW transport list', () => {
      const before = makeCapturingTransport('before-swap');
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [before],
      });
      const logger = createLogger();
      logger.info('pre-swap');
      expect(before.calls).toHaveLength(1);

      const after = makeCapturingTransport('after-swap');
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [after],
      });
      // SAME logger reference, post-swap.
      logger.info('post-swap');

      expect(before.calls).toHaveLength(1); // not touched again
      expect(after.calls).toHaveLength(1);
      expect(after.calls[0]?.message).toBe('post-swap');
    });

    it('getRootLogger() returned reference also survives reconfigure', () => {
      const a = makeCapturingTransport('root-a');
      configureLogging({ application: FIXED_APP, level: 'debug', transports: [a] });
      const root = getRootLogger();
      root.info('first');

      const b = makeCapturingTransport('root-b');
      configureLogging({ application: FIXED_APP, level: 'debug', transports: [b] });
      root.info('second');

      expect(a.calls.map((e) => e.message)).toEqual(['first']);
      expect(b.calls.map((e) => e.message)).toEqual(['second']);
    });

    it('child loggers created before the swap also survive', () => {
      const a = makeCapturingTransport('child-a');
      configureLogging({ application: FIXED_APP, level: 'debug', transports: [a] });
      const parent = createLogger();
      const child = parent.child({ module: { name: 'm', version: '1.0.0' } });
      child.info('child-pre');

      const b = makeCapturingTransport('child-b');
      configureLogging({ application: FIXED_APP, level: 'debug', transports: [b] });
      child.info('child-post');

      expect(a.calls.map((e) => e.message)).toEqual(['child-pre']);
      expect(b.calls.map((e) => e.message)).toEqual(['child-post']);
      expect(b.calls[0]?.context.module).toEqual({
        name: 'm',
        version: '1.0.0',
      });
    });
  });

  describe('NoopTransport auto-install when transports is undefined or []', () => {
    it('configureLogging({}) — emissions complete without error', () => {
      configureLogging({ application: FIXED_APP, level: 'debug' });
      const logger = createLogger();
      expect(() => logger.warn('no-transports-configured')).not.toThrow();
      expect(() => logger.error('also-fine')).not.toThrow();
    });

    it('configureLogging({ transports: [] }) — emissions complete without error', () => {
      configureLogging({ application: FIXED_APP, level: 'debug', transports: [] });
      const logger = createLogger();
      expect(() => logger.info('empty-list')).not.toThrow();
    });

    it('emissions never see an onInternalError when no transport is configured', () => {
      const onInternalError = vi.fn();
      configureLogging({
        application: FIXED_APP,
        level: 'debug',
        transports: [],
        onInternalError,
      });
      const logger = createLogger();
      for (let i = 0; i < 50; i++) {
        logger.info(`silent ${String(i)}`);
      }
      expect(onInternalError).not.toHaveBeenCalled();
    });
  });
});
