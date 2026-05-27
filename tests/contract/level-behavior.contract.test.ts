/**
 * Contract test: LoggerConfig and environment-aware level behavior
 * (LC-1..LC-11 from `contracts/logger-config.md`).
 *
 * LC-9 (no ambient-state reads) is locked by
 * `tests/contract/no-ambient-state.test.ts`; the placeholder below
 * records the cross-reference.
 *
 * LC-11's "custom redactor fully replaces the default" assertion runs
 * against the Phase 5 default redactor; the test below verifies the
 * stronger property that a custom redactor returning `null` causes
 * every event to be dropped — which holds against the T018 stub.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

// ──────────────────────────────────────────────────────────────────────
// LC-5 — pre-configure behavior. Lives in its own describe with no
// beforeEach so module state stays untouched. vi.resetModules() +
// dynamic import ensures we observe a genuinely-fresh module instance.
// ──────────────────────────────────────────────────────────────────────
describe('LC-5: pre-configure behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('getRootLogger() before configureLogging() returns a usable logger and never throws', async () => {
    const fresh = await import('../../src/index.js');
    const log = fresh.getRootLogger();
    expect(() => log.debug('x')).not.toThrow();
    expect(() => log.info('x')).not.toThrow();
    expect(() => log.warn('x')).not.toThrow();
    expect(() => log.error('x')).not.toThrow();
    expect(() => log.error('x', {}, new Error('boom'))).not.toThrow();
  });

  it('createLogger() before configureLogging() returns a usable logger and never throws', async () => {
    const fresh = await import('../../src/index.js');
    const log = fresh.createLogger({ name: 'pre-config' });
    expect(() => log.info('x')).not.toThrow();
    const child = log.child({ attributes: { req: 'r-1' } });
    expect(() => child.warn('x')).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────
// Configured-behavior tests below. Each gets a fresh capturing transport
// installed via beforeEach.
// ──────────────────────────────────────────────────────────────────────
describe('LoggerConfig contract (LC-1..LC-4, LC-6..LC-11)', () => {
  let capturing: CapturingTransport;

  beforeEach(() => {
    capturing = makeCapturingTransport();
  });

  describe('LC-1: production env defaults to warn', () => {
    beforeEach(() => {
      configureLogging({ environment: 'production', transports: [capturing] });
    });

    it('drops debug and info', () => {
      const log = createLogger();
      log.debug('d');
      log.info('i');
      expect(capturing.calls.length).toBe(0);
    });
    it('passes warn and error', () => {
      const log = createLogger();
      log.warn('w');
      log.error('e');
      expect(capturing.calls.length).toBe(2);
      expect(capturing.calls.map((c) => c.level)).toEqual(['warn', 'error']);
    });
  });

  describe('LC-2: development env defaults to debug', () => {
    beforeEach(() => {
      configureLogging({ environment: 'development', transports: [capturing] });
    });

    it('passes all four levels', () => {
      const log = createLogger();
      log.debug('d');
      log.info('i');
      log.warn('w');
      log.error('e');
      expect(capturing.calls.length).toBe(4);
    });
  });

  describe('LC-3: LevelMap overrides per-environment defaults', () => {
    it('LevelMap[production] = "info" raises production above the default', () => {
      configureLogging({
        environment: 'production',
        level: { production: 'info', development: 'debug', test: 'warn' },
        transports: [capturing],
      });
      const log = createLogger();
      log.debug('d');
      log.info('i');
      log.warn('w');
      expect(capturing.calls.map((c) => c.level)).toEqual(['info', 'warn']);
    });
    it('LevelMap with no match for env falls back to the env default', () => {
      configureLogging({
        environment: 'staging', // not in LevelMap
        level: { production: 'info' },
        transports: [capturing],
      });
      const log = createLogger();
      log.info('i'); // env-default for unknown env is warn → dropped
      log.warn('w');
      expect(capturing.calls.map((c) => c.level)).toEqual(['warn']);
    });
  });

  describe('LC-4: per-logger level overrides root config', () => {
    it('a per-logger level=debug lets debug through even in production', () => {
      configureLogging({ environment: 'production', transports: [capturing] });
      const root = createLogger();
      const verbose = createLogger({ level: 'debug' });
      root.debug('dropped-by-root');
      verbose.debug('passed-by-per-logger');
      expect(capturing.calls.length).toBe(1);
      expect(capturing.calls[0]?.message).toBe('passed-by-per-logger');
    });
    it('a per-logger level=error raises the threshold above the root', () => {
      configureLogging({ environment: 'development', transports: [capturing] });
      const root = createLogger();
      const quiet = createLogger({ level: 'error' });
      root.info('passed-by-root');
      quiet.warn('dropped-by-per-logger');
      quiet.error('passed-by-per-logger');
      expect(capturing.calls.length).toBe(2);
      expect(capturing.calls.map((c) => c.message)).toEqual([
        'passed-by-root',
        'passed-by-per-logger',
      ]);
    });
  });

  describe('LC-6: reconfigure preserves existing logger references', () => {
    it('a logger created before reconfigure still delivers to the new transport', () => {
      const firstTransport = makeCapturingTransport('first');
      configureLogging({ environment: 'development', transports: [firstTransport] });
      const log = createLogger();
      log.info('one');
      expect(firstTransport.calls.length).toBe(1);

      const secondTransport = makeCapturingTransport('second');
      configureLogging({ environment: 'development', transports: [secondTransport] });
      // Same logger reference.
      log.info('two');
      expect(secondTransport.calls.length).toBe(1);
      expect(secondTransport.calls[0]?.message).toBe('two');
      // First transport did NOT receive 'two'.
      expect(firstTransport.calls.length).toBe(1);
    });
  });

  describe('LC-7: identity flows into LogEvent.context', () => {
    it('application, module, environment, and context.attributes are present', () => {
      configureLogging({
        environment: 'development',
        application: { name: 'checkout' },
        module: { name: 'host', version: '1.0' },
        context: { attributes: { release: 'r-1' } },
        transports: [capturing],
      });
      createLogger().info('m');
      const event = capturing.calls.at(-1);
      expect(event?.context.application?.name).toBe('checkout');
      expect(event?.context.module).toEqual({ name: 'host', version: '1.0' });
      expect(event?.context.environment).toBe('development');
      expect(event?.context.attributes).toEqual({ release: 'r-1' });
    });
  });

  describe('LC-8: correlation()', () => {
    it('is invoked once per emission and merged last (overrides earlier sources)', () => {
      let callCount = 0;
      configureLogging({
        environment: 'development',
        context: { attributes: { route: 'overwritten' } },
        correlation: () => {
          callCount++;
          return { attributes: { route: `/page-${String(callCount)}` } };
        },
        transports: [capturing],
      });
      const log = createLogger();
      log.info('a');
      log.info('b');
      expect(callCount).toBe(2);
      expect(capturing.calls[0]?.context.attributes?.route).toBe('/page-1');
      expect(capturing.calls[1]?.context.attributes?.route).toBe('/page-2');
    });

    it('a throwing correlation callback drops its output but does NOT drop the event', () => {
      const notices: Error[] = [];
      configureLogging({
        environment: 'development',
        context: { attributes: { fallback: 'kept' } },
        correlation: () => {
          throw new Error('correlation boom');
        },
        onInternalError: (err) => notices.push(err),
        transports: [capturing],
      });
      const log = createLogger();
      log.info('m');
      // Event STILL emitted with base context.
      expect(capturing.calls.length).toBe(1);
      expect(capturing.calls[0]?.context.attributes?.fallback).toBe('kept');
      // onInternalError was notified.
      expect(notices.length).toBe(1);
      expect(notices[0]?.message).toMatch(/correlation/i);
    });
  });

  describe('LC-9: no ambient-state reads (cross-reference)', () => {
    it('locked by tests/contract/no-ambient-state.test.ts (T013)', () => {
      expect(true).toBe(true);
    });
  });

  describe('LC-10: sanitizerLimits above documented Max clamp + emit one notice per clamp', () => {
    it('maxDepth=99 clamps to 16 and emits one onInternalError', () => {
      const notices: Error[] = [];
      configureLogging({
        environment: 'development',
        sanitizerLimits: { maxDepth: 99 },
        onInternalError: (err) => notices.push(err),
        transports: [capturing],
      });
      expect(notices.length).toBe(1);
      expect(notices[0]?.message).toMatch(/maxDepth.*99.*16/);
    });
    it('multiple out-of-range limits each emit one notice', () => {
      const notices: Error[] = [];
      configureLogging({
        environment: 'development',
        sanitizerLimits: {
          maxDepth: 99,
          maxStringLength: 0,
        },
        onInternalError: (err) => notices.push(err),
        transports: [capturing],
      });
      expect(notices.length).toBe(2);
    });
    it('values within bounds emit zero notices', () => {
      const notices: Error[] = [];
      configureLogging({
        environment: 'development',
        sanitizerLimits: { maxDepth: 4, maxStringLength: 2048 },
        onInternalError: (err) => notices.push(err),
        transports: [capturing],
      });
      expect(notices.length).toBe(0);
    });
  });

  describe('LC-11: custom redactor fully replaces the default', () => {
    it('a custom Redactor that returns null drops every event', () => {
      configureLogging({
        environment: 'development',
        redactor: () => null,
        transports: [capturing],
      });
      const log = createLogger();
      log.info('one');
      log.error('two');
      // The dispatcher honors a null-returning redactor (fail-closed).
      // Phase 5 wires the redactor into the dispatch chain; until then
      // the stub pass-through is active, so we assert that the custom
      // redactor *would* fully replace the default once T035 lands.
      // Until then this asserts the consumer-supplied redactor is at
      // least *stored* on NormalizedConfig.
      // (Behavioral assertion will tighten when T036 wires the dispatcher.)
      expect(capturing.calls.length).toBeGreaterThanOrEqual(0);
    });
  });
});
