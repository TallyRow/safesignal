/**
 * Fail-closed redaction security test (T046).
 *
 * Covers FR-019 (fail safely if filtering/redaction/formatting/
 * delivery encounters unexpected input) and FR-020 (failures in
 * filtering/redaction/formatting/delivery do not break application
 * rendering, navigation, state updates, or core user interactions).
 *
 * The contract (from `contracts/redaction.md`):
 *   - If the redactor THROWS, the affected event is DROPPED entirely.
 *   - If the redactor RETURNS a value that is neither a `LogEvent`
 *     nor `null`, the affected event is DROPPED entirely.
 *   - In both cases, `onInternalError` is invoked once for the failed
 *     event.
 *   - Surviving transports receive ZERO events from those failing
 *     emissions (no partial / raw / unredacted emission).
 *   - No path propagates the throw or rejection to the
 *     `logger.error()` / `logger.info()` call site.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import type { LogEvent, Redactor } from '../../src/api/types.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'fail-closed-redaction', version: '1.0.0' };

// ---------------------------------------------------------------------------
// Throwing redactor
// ---------------------------------------------------------------------------

describe('FR-019 + FR-020: throwing redactor drops the event and notifies onInternalError', () => {
  let capture = makeCapturingTransport('capture');
  let onInternalError = vi.fn();

  beforeEach(() => {
    capture = makeCapturingTransport('capture');
    onInternalError = vi.fn();
    const throwingRedactor: Redactor = () => {
      throw new Error('redactor explosion');
    };
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      redactor: throwingRedactor,
      onInternalError,
    });
  });

  it('drops the event — capturing transport receives zero events', () => {
    const log = createLogger();
    log.info('attack-1', { token: 'leak-this' });
    expect(capture.calls).toHaveLength(0);
  });

  it('invokes onInternalError with a redactor_failed code', () => {
    const log = createLogger();
    log.info('attack-2', { token: 'leak-this' });
    expect(onInternalError).toHaveBeenCalledTimes(1);
    const err = onInternalError.mock.calls[0]![0] as Error & { code?: string };
    expect(err.code).toBe('redactor_failed');
  });

  it('does NOT propagate the throw to the logger call site', () => {
    const log = createLogger();
    expect(() => log.info('safe-call', { token: 'value' })).not.toThrow();
    expect(() => log.error('safe-error', { token: 'value' })).not.toThrow();
    expect(() => log.warn('safe-warn', { token: 'value' })).not.toThrow();
    expect(() => log.debug('safe-debug', { token: 'value' })).not.toThrow();
  });

  it('drops every emission across many calls (no partial emission anywhere)', () => {
    const log = createLogger();
    for (let i = 0; i < 50; i++) {
      log.info(`emit-${String(i)}`, { token: `value-${String(i)}` });
    }
    expect(capture.calls).toHaveLength(0);
    expect(onInternalError).toHaveBeenCalledTimes(50);
  });
});

// ---------------------------------------------------------------------------
// Non-event / non-null return
// ---------------------------------------------------------------------------

describe('FR-019 + FR-020: redactor returning non-event/non-null drops the event', () => {
  const cases: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['a string', 'pretend-event'],
    ['a number', 42],
    ['a plain object missing required keys', { not: 'an event' }],
    ['an empty object', {}],
    ['an array', []],
    [
      'an object missing the timestamp field',
      { level: 'info', message: '', attributes: {}, context: {} },
    ],
    [
      'an object with a non-string level',
      { timestamp: 'now', level: 7, message: '', attributes: {}, context: {} },
    ],
    [
      'an object with an invalid LogLevel',
      { timestamp: 'now', level: 'unknown', message: '', attributes: {}, context: {} },
    ],
    [
      'an object with null attributes',
      { timestamp: 'now', level: 'info', message: '', attributes: null, context: {} },
    ],
    [
      'an object with null context',
      { timestamp: 'now', level: 'info', message: '', attributes: {}, context: null },
    ],
  ];

  it.each(cases)(
    'drops the event when redactor returns %s and notifies onInternalError once',
    (_label, returnValue) => {
      const capture = makeCapturingTransport('capture');
      const onInternalError = vi.fn();
      configureLogging({
        application: APP,
        environment: 'development',
        level: 'debug',
        transports: [capture],
        redactor: (() => returnValue) as unknown as Redactor,
        onInternalError,
      });
      const log = createLogger();
      log.info('attack', { token: 'leak-this' });
      expect(capture.calls).toHaveLength(0);
      expect(onInternalError).toHaveBeenCalledTimes(1);
      const err = onInternalError.mock.calls[0]![0] as Error & { code?: string };
      expect(err.code).toBe('redactor_failed');
    },
  );
});

// ---------------------------------------------------------------------------
// Sibling transports never see a dropped event
// ---------------------------------------------------------------------------

describe('FR-020: surviving transports receive zero events from failing emissions', () => {
  it('all siblings stay at zero when the redactor throws', () => {
    const a = makeCapturingTransport('a');
    const b = makeCapturingTransport('b');
    const c = makeCapturingTransport('c');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [a, b, c],
      redactor: () => {
        throw new Error('redactor explosion');
      },
      onInternalError: () => {},
    });
    const log = createLogger();
    log.info('attack', { token: 'never-delivered' });
    expect(a.calls).toHaveLength(0);
    expect(b.calls).toHaveLength(0);
    expect(c.calls).toHaveLength(0);
  });

  it('surviving transports still receive events that the redactor lets through (selective failure)', () => {
    const capture = makeCapturingTransport('capture');
    const onInternalError = vi.fn();
    // Throws on even-`i` events, lets odd through unchanged.
    const selective: Redactor = (event: LogEvent) => {
      const i = event.attributes.i;
      if (typeof i === 'number' && i % 2 === 0) {
        throw new Error('redactor selective');
      }
      return event;
    };
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      redactor: selective,
      onInternalError,
    });
    const log = createLogger();
    for (let i = 0; i < 10; i++) {
      log.info(`emit-${String(i)}`, { i });
    }
    // 5 odd-i events make it through; 5 even-i are dropped.
    expect(capture.calls).toHaveLength(5);
    expect(onInternalError).toHaveBeenCalledTimes(5);
    // None of the dropped values reached the transport.
    for (const event of capture.calls) {
      expect(event.attributes.i).toBeTypeOf('number');
      expect((event.attributes.i as number) % 2).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// No raw / unredacted leakage on the failure path
// ---------------------------------------------------------------------------

describe('FR-019: dropped events do NOT leak raw values via onInternalError', () => {
  it('the onInternalError diagnostic does not echo the original event payload', () => {
    const capture = makeCapturingTransport('capture');
    const onInternalError = vi.fn();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      redactor: () => {
        throw new Error('redactor explosion');
      },
      onInternalError,
    });
    const log = createLogger();
    log.info('attack', { token: 'p4ssword-fixture-do-not-leak' });
    expect(onInternalError).toHaveBeenCalledTimes(1);
    const errStr = JSON.stringify({
      name: (onInternalError.mock.calls[0]![0] as Error).name,
      message: (onInternalError.mock.calls[0]![0] as Error).message,
    });
    expect(errStr).not.toContain('p4ssword-fixture-do-not-leak');
  });
});
