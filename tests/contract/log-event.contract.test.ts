/**
 * Contract test: LogEvent shape and semantics (LE-1..LE-11 from
 * `contracts/log-event.md`).
 *
 * LE-5 (sanitization rules), LE-8 (redaction), LE-9 (URL scrubbing),
 * and LE-10 (control-char escaping) require Phase 5 implementations of
 * the sanitizer, redactor, URL scrubber, and control-char guard
 * respectively. They are listed here as `it.todo()` so the contract
 * map remains complete; the corresponding tests live in
 * `tests/security/` and activate when T031–T035 ship.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureLogging,
  createLogger,
  type LogEvent,
} from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('LogEvent contract (LE-1..LE-11)', () => {
  let capturing: CapturingTransport;

  beforeEach(() => {
    capturing = makeCapturingTransport();
    configureLogging({
      environment: 'development',
      transports: [capturing],
    });
  });

  describe('LE-1: timestamp is a valid ISO-8601 string on every event', () => {
    it('every emission carries an ISO-8601 timestamp', () => {
      const log = createLogger();
      log.debug('a');
      log.info('b');
      log.warn('c');
      log.error('d');
      expect(capturing.calls.length).toBe(4);
      for (const event of capturing.calls) {
        expect(event.timestamp, `timestamp not ISO-8601: ${event.timestamp}`).toMatch(
          ISO_8601_RE,
        );
        // Round-trip check.
        expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
      }
    });
  });

  describe('LE-2: event.level matches the called method', () => {
    it.each(['debug', 'info', 'warn', 'error'] as const)(
      'logger.%s emits event.level=%s',
      (level) => {
        const log = createLogger();
        log[level]('m');
        const event = capturing.calls.at(-1);
        expect(event?.level).toBe(level);
      },
    );
  });

  describe('LE-3: attributes is always an object, never undefined', () => {
    it('omitting attributes yields {}', () => {
      const log = createLogger();
      log.info('no attrs');
      const event = capturing.calls.at(-1);
      expect(event?.attributes).toBeDefined();
      expect(typeof event?.attributes).toBe('object');
      expect(event?.attributes).not.toBeNull();
      expect(Array.isArray(event?.attributes)).toBe(false);
    });
    it('passing attributes preserves them', () => {
      const log = createLogger();
      log.info('with attrs', { foo: 'bar', n: 42 });
      const event = capturing.calls.at(-1);
      expect(event?.attributes).toEqual({ foo: 'bar', n: 42 });
    });
  });

  describe('LE-4: context contains the merged result per the merge algorithm', () => {
    it('root config identity flows into event.context', () => {
      configureLogging({
        environment: 'development',
        application: { name: 'checkout', version: '1.2.3' },
        module: { name: 'host', version: '0.1.0' },
        context: { attributes: { release: 'r-abc' } },
        transports: [capturing],
      });
      const log = createLogger();
      log.info('m');
      const event = capturing.calls.at(-1);
      expect(event?.context.application).toEqual({ name: 'checkout', version: '1.2.3' });
      expect(event?.context.module).toEqual({ name: 'host', version: '0.1.0' });
      expect(event?.context.environment).toBe('development');
      expect(event?.context.attributes).toEqual({ release: 'r-abc' });
    });
    it('child() context layers over root', () => {
      configureLogging({
        environment: 'development',
        application: { name: 'app' },
        transports: [capturing],
      });
      const log = createLogger();
      const child = log.child({ attributes: { requestId: 'r-1' } });
      child.info('m');
      const event = capturing.calls.at(-1);
      expect(event?.context.attributes).toEqual({ requestId: 'r-1' });
      expect(event?.context.application).toEqual({ name: 'app' });
    });
    it('per-logger module overrides root module', () => {
      configureLogging({
        environment: 'development',
        application: { name: 'app' },
        module: { name: 'host' },
        transports: [capturing],
      });
      const moduleLog = createLogger({ module: { name: 'product-recs', version: '0.4.2' } });
      moduleLog.info('m');
      const event = capturing.calls.at(-1);
      expect(event?.context.module).toEqual({ name: 'product-recs', version: '0.4.2' });
    });
  });

  describe('LE-5: sanitization rules (Phase 5)', () => {
    it.todo('Phase 5 T031 + T044 cover every row of contracts/sanitization.md');
  });

  describe('LE-6: error is populated only when an error value is passed', () => {
    it('logger.error with an error → event.error set', () => {
      const log = createLogger();
      log.error('m', {}, new Error('boom'));
      const event = capturing.calls.at(-1);
      expect(event?.error).toBeDefined();
      expect(event?.error?.message).toBe('boom');
    });
    it('logger.error without an error → event.error undefined', () => {
      const log = createLogger();
      log.error('m');
      const event = capturing.calls.at(-1);
      expect(event?.error).toBeUndefined();
    });
    it('logger.info / warn / debug never produce event.error', () => {
      const log = createLogger();
      log.debug('a');
      log.info('b');
      log.warn('c');
      for (const event of capturing.calls) {
        expect(event.error).toBeUndefined();
      }
    });
  });

  describe('LE-7: per-call attributes do not mutate context.attributes', () => {
    it('two emissions with different per-call attrs leave context.attributes untouched', () => {
      configureLogging({
        environment: 'development',
        context: { attributes: { release: 'r-1' } },
        transports: [capturing],
      });
      const log = createLogger();
      log.info('first', { eventId: 'e-1' });
      log.info('second', { eventId: 'e-2' });

      const e1 = capturing.calls[0];
      const e2 = capturing.calls[1];
      expect(e1?.context.attributes).toEqual({ release: 'r-1' });
      expect(e2?.context.attributes).toEqual({ release: 'r-1' });
      expect(e1?.attributes).toEqual({ eventId: 'e-1' });
      expect(e2?.attributes).toEqual({ eventId: 'e-2' });
    });
  });

  describe('LE-8: sensitive keys masked (Phase 5)', () => {
    it.todo('Phase 5 T035 + T041 cover redaction of attributes/context/message/error');
  });

  describe('LE-9: URL-shaped values query-scrubbed (Phase 5)', () => {
    it.todo('Phase 5 T032 + T042 cover scrubUrl integration in the pipeline');
  });

  describe('LE-10: control characters escaped (Phase 5)', () => {
    it.todo('Phase 5 T034 + T043 cover control-char-guard');
  });

  describe('LE-11: consumer cannot supply timestamp', () => {
    it('the event-builder always assigns a fresh timestamp', () => {
      const log = createLogger();
      log.info('m');
      const t1 = capturing.calls.at(-1)?.timestamp;
      // Even attempting to pass timestamp inside attributes (the only place
      // a consumer could write a timestamp string) does not influence
      // event.timestamp.
      log.info('m', { timestamp: '1999-01-01T00:00:00.000Z' });
      const t2 = capturing.calls.at(-1)?.timestamp;
      expect(t1).not.toBe('1999-01-01T00:00:00.000Z');
      expect(t2).not.toBe('1999-01-01T00:00:00.000Z');
      // Each emission gets a fresh ISO timestamp, not whatever the caller wrote.
      expect(t1).toMatch(ISO_8601_RE);
      expect(t2).toMatch(ISO_8601_RE);
    });
  });

  // Helper sanity: confirm the LogEvent type re-export is usable.
  it('public LogEvent type is structurally what transports receive', () => {
    const log = createLogger();
    log.info('typed');
    const event = capturing.calls.at(-1);
    // Compile-time check: assignment to a typed binding ensures the
    // transport-received shape matches the public LogEvent type.
    const typed: LogEvent | undefined = event;
    expect(typed).toBeDefined();
  });
});
