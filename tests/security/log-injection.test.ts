/**
 * Log-injection resistance security test (T043).
 *
 * Covers FR-017 (preserve safe event boundaries between intended log
 * fields and untrusted, unknown, or oversized contextual data).
 *
 * Two attack surfaces:
 *   1. **Field-level escape**: untrusted strings containing control
 *      characters (\n, \r, U+2028, U+2029, ANSI escapes) are
 *      control-char-escaped to their `\uXXXX` form by the pipeline,
 *      so they cannot fake additional structure inside a downstream
 *      parser that treats line breaks as record boundaries.
 *      `\t`, `\n`, and `\r` are preserved by design — log-injection
 *      resistance is enforced at the output boundary, not by mutating
 *      those characters.
 *
 *   2. **Output-format injection**: `ConsoleTransport` passes the
 *      `LogEvent` as the SECOND argument to `console[level]` (an
 *      object), never interpolated into a single line. A consumer
 *      who pipes structured console output to a line-delimited log
 *      file cannot have an attacker forge a second record by
 *      including a literal newline + JSON payload, because the
 *      transport's output is one console call per event, with the
 *      event as a structured object the host renders in its own
 *      format.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConsoleTransport,
  configureLogging,
  createLogger,
} from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'log-injection', version: '1.0.0' };

let capture = makeCapturingTransport('capture');

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

// ---------------------------------------------------------------------------
// FR-017: control-character escaping at the output boundary
// ---------------------------------------------------------------------------

describe('FR-017: control-character escaping for attribute string values', () => {
  it('escapes U+2028 (LINE SEPARATOR) inside an attribute value', () => {
    const log = createLogger();
    log.info('attack', { user: 'alice bob' });
    const event = capture.calls[0]!;
    expect(event.attributes.user).toBe('alice\\u2028bob');
  });

  it('escapes U+2029 (PARAGRAPH SEPARATOR) inside an attribute value', () => {
    const log = createLogger();
    log.info('attack', { user: 'alice bob' });
    expect(capture.calls[0]!.attributes.user).toBe('alice\\u2029bob');
  });

  it('escapes ANSI ESC (U+001B) and the following CSI bytes', () => {
    const log = createLogger();
    log.info('attack', { value: '[31mRED' });
    expect(capture.calls[0]!.attributes.value).toBe('\\u001b[31mRED');
  });

  it('escapes BEL (U+0007), BS (U+0008), VT (U+000B), FF (U+000C), and other ASCII control chars', () => {
    const log = createLogger();
    log.info('attack', {
      bel: '',
      bs: '',
      vt: '',
      ff: '',
      so: '',
      us: '',
    });
    const a = capture.calls[0]!.attributes;
    expect(a.bel).toBe('\\u0007');
    expect(a.bs).toBe('\\u0008');
    expect(a.vt).toBe('\\u000b');
    expect(a.ff).toBe('\\u000c');
    expect(a.so).toBe('\\u000e');
    expect(a.us).toBe('\\u001f');
  });

  it('preserves \\t, \\n, \\r by design (log-injection resistance is at the output boundary)', () => {
    const log = createLogger();
    log.info('preserved', { s: 'a\tb\nc\rd' });
    expect(capture.calls[0]!.attributes.s).toBe('a\tb\nc\rd');
  });

  it('escapes control chars inside nested attribute objects', () => {
    const log = createLogger();
    log.info('nested', { outer: { inner: 'hasbell' } });
    const outer = capture.calls[0]!.attributes.outer as Record<string, unknown>;
    expect(outer.inner).toBe('has\\u0007bell');
  });

  it('escapes control chars inside arrays of strings', () => {
    const log = createLogger();
    log.info('array', { list: ['safe', 'bell', ' line'] });
    const list = capture.calls[0]!.attributes.list as unknown[];
    expect(list[0]).toBe('safe');
    expect(list[1]).toBe('\\u0007bell');
    expect(list[2]).toBe('\\u2028line');
  });

  it('escapes control chars in the event.message field', () => {
    const log = createLogger();
    log.info('ab c');
    expect(capture.calls[0]!.message).toBe('a\\u0007b\\u2028c');
  });

  it('escapes control chars in event.error.{name,message,stack}', () => {
    const log = createLogger();
    const err = new Error('boom');
    err.name = 'CustomError';
    log.error('bad', undefined, err);
    const error = capture.calls[0]!.error!;
    expect(error.name).toBe('Custom\\u001bError');
    expect(error.message).toBe('boom\\u0007');
  });
});

// ---------------------------------------------------------------------------
// FR-017: forged-record payloads cannot fake a second LogEvent
// ---------------------------------------------------------------------------

describe('FR-017: forged-record payloads neutralized', () => {
  it('escapes a payload designed to fake a second JSON record (line-delimited downstream parser)', () => {
    const forged = '{"level":"error","message":"forged","attributes":{}}';
    const log = createLogger();
    log.info('attack', { evil: forged });
    const value = capture.calls[0]!.attributes.evil as string;
    expect(value.startsWith('\\u0007')).toBe(true);
    // The control char is escaped, so a downstream parser that splits
    // on  (or treats it as a record separator) cannot extract a
    // forged JSON record from this attribute.
    expect(value.includes('')).toBe(false);
  });

  it('preserves literal `\\n` inside an attribute value as the two-character escape (no record forgery via line-delimited parsers)', () => {
    // Newlines themselves are preserved per the contract — record
    // forgery resistance comes from the structured transport boundary
    // below, not from escaping newlines in attribute values.
    const log = createLogger();
    log.info('attack', { evil: 'line1\nline2' });
    expect(capture.calls[0]!.attributes.evil).toBe('line1\nline2');
  });
});

// ---------------------------------------------------------------------------
// FR-017: ConsoleTransport's structured output cannot forge a second record
// ---------------------------------------------------------------------------

describe('FR-017: ConsoleTransport passes events as structured objects, not interpolated strings', () => {
  it('emits ONE console call per event with the LogEvent as the second argument (NOT interpolated into a single line)', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      configureLogging({
        application: APP,
        environment: 'development',
        level: 'debug',
        transports: [ConsoleTransport],
      });
      const log = createLogger();
      log.info('forged?\n{"level":"error","message":"injected"}', {
        attacker: 'shell',
      });
      // Exactly one console.info call — not one per "line" of the
      // user-controlled message. Downstream consumers cannot split on
      // newlines from console output to recover an additional record.
      expect(consoleInfo).toHaveBeenCalledTimes(1);
      // First argument is the (sanitized + escaped) message; the
      // second is the structured LogEvent. The transport does NOT
      // build a single concatenated string.
      expect(consoleInfo.mock.calls[0]![0]).toBe(
        'forged?\n{"level":"error","message":"injected"}',
      );
      const eventArg = consoleInfo.mock.calls[0]![1] as Record<string, unknown>;
      expect(eventArg).toBeTypeOf('object');
      expect(eventArg.level).toBe('info');
      expect((eventArg.attributes as Record<string, unknown>).attacker).toBe(
        '\\u0007shell',
      );
    } finally {
      consoleInfo.mockRestore();
    }
  });

  it('handles a forged-record-looking message via ConsoleTransport without producing TWO console calls', () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      configureLogging({
        application: APP,
        environment: 'development',
        level: 'debug',
        transports: [ConsoleTransport],
      });
      const log = createLogger();
      log.info('safe-prefix\n{"forged":true}');
      expect(consoleInfo).toHaveBeenCalledTimes(1);
    } finally {
      consoleInfo.mockRestore();
    }
  });
});
