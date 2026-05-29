/**
 * Pipeline-order contract test (T048).
 *
 * Locks the security-critical runtime order:
 *
 *   LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor →
 *   ControlCharGuard → Freeze(dev) → Dispatcher → Backend → SafeTransport[]
 *
 * Asserts the order via three complementary observation points:
 *   1. A capturing redactor that snapshots the event at the
 *      redactor boundary (sanitizer + URL scrubber have run; redactor
 *      is about to run; control-char-guard, freeze, backend, transport
 *      have NOT yet run).
 *   2. A capturing transport that snapshots the event at the end of
 *      the pipeline (all transformations applied).
 *   3. Comparing (1) and (2) pinpoints which transformations fired
 *      before vs. after the redactor.
 *
 * The redactor used here COMPOSES the default rules with a snapshot
 * side-effect so the load-bearing default key/shape rules still fire
 * (the snapshot is read-only on the event, not a replacement of the
 * default ruleset).
 *
 * v1 architectural note (post-T066): the dispatcher fans events out
 * directly to the configured `SafeTransport`-wrapped transports.
 * There is no telemetry-backend indirection on the v1 default path,
 * so `freezeInDev` is observable at the transport boundary: a
 * transport receives the exact reference the pipeline froze.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEvent, Redactor } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { createRedactor } from '../../src/pipeline/redactor.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'pipeline-order-lock', version: '1.0.0' };

let capture = makeCapturingTransport('pipeline-order');
let snapshotAtRedactor: LogEvent | null = null;
let redactorCallCount = 0;
let isFrozenAtRedactor: boolean | null = null;

/**
 * Composed redactor: snapshots the in-flight event (a JSON clone for
 * value comparisons, plus `Object.isFrozen` captured AT THIS MOMENT
 * so a later mutation of the same reference does not retroactively
 * change the observed state), then delegates to the default rule
 * set so the load-bearing default key/shape rules still fire.
 */
const defaultRedactor = createRedactor();
const snapshottingRedactor: Redactor = (event) => {
  redactorCallCount++;
  // Capture isFrozen NOW — `freezeInDev` runs later in the pipeline
  // and mutates the same reference in place, so reading
  // `Object.isFrozen` after the pipeline completes would always
  // observe `true`.
  isFrozenAtRedactor = Object.isFrozen(event);
  snapshotAtRedactor = JSON.parse(JSON.stringify(event)) as LogEvent;
  return defaultRedactor(event);
};

beforeEach(() => {
  capture = makeCapturingTransport('pipeline-order');
  snapshotAtRedactor = null;
  isFrozenAtRedactor = null;
  redactorCallCount = 0;
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
    redactor: snapshottingRedactor,
  });
});

// ---------------------------------------------------------------------------
// LevelFilter is FIRST and short-circuits before any other stage
// ---------------------------------------------------------------------------

describe('LevelFilter is the first stage and short-circuits filtered emissions', () => {
  it('a debug emission at level=warn never reaches the redactor or any transport', () => {
    configureLogging({
      application: APP,
      environment: 'production',
      level: 'warn',
      transports: [capture],
      redactor: snapshottingRedactor,
    });
    const log = createLogger();
    log.debug('filtered-out');
    log.info('filtered-out');
    expect(capture.calls).toHaveLength(0);
    expect(redactorCallCount).toBe(0);
    expect(snapshotAtRedactor).toBe(null);
  });

  it('a warn emission at level=warn DOES reach the redactor and transport', () => {
    configureLogging({
      application: APP,
      environment: 'production',
      level: 'warn',
      transports: [capture],
      redactor: snapshottingRedactor,
    });
    const log = createLogger();
    log.warn('not-filtered');
    expect(capture.calls).toHaveLength(1);
    expect(redactorCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// EventBuilder runs after LevelFilter and assigns the canonical fields
// ---------------------------------------------------------------------------

describe('EventBuilder runs after LevelFilter and produces the canonical LogEvent shape', () => {
  it('every captured event has the canonical structure (timestamp, level, message, attributes, context)', () => {
    const log = createLogger();
    log.info('e', { x: 1 });
    const event = capture.calls[0]!;
    expect(typeof event.timestamp).toBe('string');
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    expect(event.level).toBe('info');
    expect(event.message).toBe('e');
    expect(event.attributes.x).toBe(1);
    expect(typeof event.context).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// Sanitizer ran BEFORE the redactor
// ---------------------------------------------------------------------------

describe('Sanitizer runs before the Redactor', () => {
  it('a class instance is already type-tagged at the redactor boundary (its getter is not invoked)', () => {
    let getterCalls = 0;
    class Credential {
      // eslint-disable-next-line @typescript-eslint/class-literal-property-style
      get password(): string {
        getterCalls++;
        return 'leak';
      }
    }
    const log = createLogger();
    log.info('p', { creds: new Credential() as never });
    expect(snapshotAtRedactor!.attributes.creds).toBe('[Credential]');
    expect(getterCalls).toBe(0);
  });

  it('cyclic references are already collapsed to "[Circular]" at the redactor boundary', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    const log = createLogger();
    log.info('c', { node: cyclic as never });
    const node = snapshotAtRedactor!.attributes.node as Record<string, unknown>;
    expect(node.self).toBe('[Circular]');
  });
});

// ---------------------------------------------------------------------------
// URLScrubber ran BEFORE the redactor
// ---------------------------------------------------------------------------

describe('URLScrubber runs before the Redactor', () => {
  it('URL-shaped attribute strings are already scrubbed at the redactor boundary', () => {
    const log = createLogger();
    log.info('u', { dest: 'https://example.com/?token=abc123def&safe=ok' });
    expect(snapshotAtRedactor!.attributes.dest).toBe(
      'https://example.com/?token=%5BREDACTED%5D&safe=ok',
    );
  });
});

// ---------------------------------------------------------------------------
// ControlCharGuard ran AFTER the redactor
// ---------------------------------------------------------------------------

describe('ControlCharGuard runs after the Redactor', () => {
  it('a control character in a non-denied attribute is RAW at the redactor and ESCAPED at the transport', () => {
    const log = createLogger();
    log.info('g', { note: 'hello\x07world' });
    expect(snapshotAtRedactor!.attributes.note).toBe('hello\x07world');
    expect(capture.calls[0]!.attributes.note).toBe('hello\\u0007world');
  });

  it('a redacted value is masked at the redactor boundary and stays masked at the transport (guard does nothing to [REDACTED] strings, which contain no control chars)', () => {
    const log = createLogger();
    log.info('mixed', { password: 'p1', note: 'a\x07b' });
    expect(capture.calls[0]!.attributes.password).toBe('[REDACTED]');
    expect(capture.calls[0]!.attributes.note).toBe('a\\u0007b');
  });
});

// ---------------------------------------------------------------------------
// Freeze(dev) ran AFTER ControlCharGuard
// ---------------------------------------------------------------------------

describe('Freeze(dev) runs AFTER the Redactor and is observable at the transport (post-T066 direct fan-out)', () => {
  it('the in-flight event handed to the redactor is NOT frozen at the moment the redactor runs', () => {
    const log = createLogger();
    log.info('check-freeze');
    expect(isFrozenAtRedactor).toBe(false);
  });

  it('the event the transport receives IS frozen (the dispatcher fans the frozen reference out directly — no backend round-trip)', () => {
    const log = createLogger();
    log.info('frozen-at-transport', { x: 1 });
    const event = capture.calls[0]!;
    expect(Object.isFrozen(event)).toBe(true);
    // Deep freeze: nested attributes and context objects are also frozen.
    expect(Object.isFrozen(event.attributes)).toBe(true);
    expect(Object.isFrozen(event.context)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Composite: every transformation visible at the transport in one event
// ---------------------------------------------------------------------------

describe('The transport never receives an event missing any pipeline transformation', () => {
  it('a single composite event has sanitizer + URL-scrub + redactor + control-char-guard applied', () => {
    class Credential {
      readonly id = 'visible-fields-suppressed';
    }
    const log = createLogger();
    log.info('composite', {
      // Sanitizer: type-tag the class instance.
      cls: new Credential() as never,
      // URLScrubber: scrub token param.
      url: 'https://example.com/api?token=abc123def&page=2',
      // Redactor: mask by key name.
      password: 'p1',
      // ControlCharGuard: escape the bell.
      note: 'hello\x07world',
    });

    const event = capture.calls[0]!;
    expect(event.attributes.cls).toBe('[Credential]');
    expect(event.attributes.url).toBe(
      'https://example.com/api?token=%5BREDACTED%5D&page=2',
    );
    expect(event.attributes.password).toBe('[REDACTED]');
    expect(event.attributes.note).toBe('hello\\u0007world');
  });

  it('the redactor was invoked exactly once for the emission (no re-entry / double processing)', () => {
    const log = createLogger();
    log.info('once-only', { x: 1 });
    expect(redactorCallCount).toBe(1);
  });

  it('500 emissions invoke the redactor exactly 500 times (per-emission contract)', () => {
    const log = createLogger();
    for (let i = 0; i < 500; i++) log.info(`e-${String(i)}`, { i });
    expect(redactorCallCount).toBe(500);
    expect(capture.calls).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// Redactor null → event dropped BEFORE control-char-guard / freeze /
// transport
// ---------------------------------------------------------------------------

describe('Redactor returning null short-circuits ALL downstream stages', () => {
  it('control-char-guard, freeze, and transport are skipped when the redactor returns null', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      redactor: () => null,
    });
    const log = createLogger();
    log.info('drop-me', { note: 'a\x07b' });
    expect(capture.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Spy-based confirmation: redactor is invoked from inside dispatch
// ---------------------------------------------------------------------------

describe('Spy-based: the redactor is called as part of dispatch (no transport bypass)', () => {
  it('every emission that produces a transport call also produces exactly one redactor call', () => {
    const spyRedactor = vi.fn((event: LogEvent) => event);
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      redactor: spyRedactor,
    });
    const log = createLogger();
    log.info('a');
    log.warn('b');
    log.error('c');
    expect(spyRedactor).toHaveBeenCalledTimes(3);
    expect(capture.calls).toHaveLength(3);
    // 1:1 correspondence — no transport call without a redactor call.
    for (let i = 0; i < spyRedactor.mock.calls.length; i++) {
      const argEvent = spyRedactor.mock.calls[i]![0] as LogEvent;
      const capturedEvent = capture.calls[i]!;
      expect(capturedEvent.message).toBe(argEvent.message);
    }
  });
});

// ---------------------------------------------------------------------------
// No transport-side bypass of the security pipeline
// ---------------------------------------------------------------------------

describe('No transport receives an event that bypassed Sanitizer + Redactor', () => {
  it('every captured event whose input had a class-instance attribute has the class type-tagged at the transport', () => {
    class Internal {
      readonly secret = 'do-not-leak';
    }
    const log = createLogger();
    log.info('class', { o: new Internal() as never });
    expect(capture.calls[0]!.attributes.o).toBe('[Internal]');
    expect(JSON.stringify(capture.calls[0]!)).not.toContain('do-not-leak');
  });

  it('every captured event whose input had a denied key has that key masked at the transport', () => {
    const log = createLogger();
    log.info('denied', {
      password: 'p',
      authorization: 'a',
      api_key: 'k',
      session_id: 's',
    });
    const a = capture.calls[0]!.attributes;
    expect(a.password).toBe('[REDACTED]');
    expect(a.authorization).toBe('[REDACTED]');
    expect(a.api_key).toBe('[REDACTED]');
    expect(a.session_id).toBe('[REDACTED]');
  });
});
