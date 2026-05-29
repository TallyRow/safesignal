/**
 * Control-char-guard unit tests (T039).
 *
 * Covers `contracts/log-event.md` row 4 ("control-char-escaped") and
 * plan.md "Security Architecture > Log-injection & output safety".
 *
 * Targeted code points:
 *   U+0000..U+0008  (NUL through BS)
 *   U+000B..U+000C  (VT, FF)
 *   U+000E..U+001F  (SO through US)
 *   U+2028          (LINE SEPARATOR)
 *   U+2029          (PARAGRAPH SEPARATOR)
 * Preserved by design: U+0009 (\t), U+000A (\n), U+000D (\r).
 *
 * Targets 100% coverage on `src/pipeline/control-char-guard.ts`.
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent } from '../../../src/api/types.js';
import { normalizeConfig } from '../../../src/config/config.js';
import { controlCharGuard } from '../../../src/pipeline/control-char-guard.js';
import { makeLogEvent } from '../../helpers/event-fixtures.js';

const defaultConfig = normalizeConfig({});

function runStage(overrides: Partial<LogEvent>): LogEvent {
  return controlCharGuard(makeLogEvent(overrides), defaultConfig) as LogEvent;
}

function attrString(overrides: Partial<LogEvent>): string {
  const out = runStage(overrides);
  return out.attributes.s as string;
}

function escapeHex(code: number): string {
  return `\\u${code.toString(16).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Escaped ranges
// ---------------------------------------------------------------------------

describe('escapes every targeted ASCII control character', () => {
  it('escapes U+0000 through U+0008 (NUL..BS)', () => {
    for (let code = 0x00; code <= 0x08; code++) {
      const ch = String.fromCharCode(code);
      expect(attrString({ attributes: { s: `x${ch}y` } })).toBe(
        `x${escapeHex(code)}y`,
      );
    }
  });

  it('escapes U+000B (VT) and U+000C (FF)', () => {
    expect(attrString({ attributes: { s: 'xy' } })).toBe('x\\u000by');
    expect(attrString({ attributes: { s: 'xy' } })).toBe('x\\u000cy');
  });

  it('escapes U+000E through U+001F (SO..US)', () => {
    for (let code = 0x0e; code <= 0x1f; code++) {
      const ch = String.fromCharCode(code);
      expect(attrString({ attributes: { s: `x${ch}y` } })).toBe(
        `x${escapeHex(code)}y`,
      );
    }
  });

  it('escapes U+2028 (LINE SEPARATOR)', () => {
    expect(attrString({ attributes: { s: 'x y' } })).toBe('x\\u2028y');
  });

  it('escapes U+2029 (PARAGRAPH SEPARATOR)', () => {
    expect(attrString({ attributes: { s: 'x y' } })).toBe('x\\u2029y');
  });
});

// ---------------------------------------------------------------------------
// Preserved characters
// ---------------------------------------------------------------------------

describe('preserves tab, newline, carriage return', () => {
  it('preserves \\t (U+0009)', () => {
    expect(attrString({ attributes: { s: 'a\tb' } })).toBe('a\tb');
  });

  it('preserves \\n (U+000A)', () => {
    expect(attrString({ attributes: { s: 'a\nb' } })).toBe('a\nb');
  });

  it('preserves \\r (U+000D)', () => {
    expect(attrString({ attributes: { s: 'a\rb' } })).toBe('a\rb');
  });

  it('preserves regular printable characters and Unicode letters', () => {
    expect(attrString({ attributes: { s: 'hello world ñ ﬃ 🎉' } })).toBe(
      'hello world ñ ﬃ 🎉',
    );
  });
});

// ---------------------------------------------------------------------------
// Mixed strings
// ---------------------------------------------------------------------------

describe('handles mixed strings', () => {
  it('escapes only the targeted chars in a mix of preserved/printable/escaped', () => {
    const input = 'pre\x07middle\t\n\rend ';
    expect(attrString({ attributes: { s: input } })).toBe(
      'pre\\u0007middle\t\n\rend\\u2028',
    );
  });

  it('escapes multiple instances of the same control char', () => {
    expect(attrString({ attributes: { s: '\x07\x07\x07' } })).toBe(
      '\\u0007\\u0007\\u0007',
    );
  });

  it('escapes adjacent different control chars', () => {
    expect(attrString({ attributes: { s: '\x01\x02\x03' } })).toBe(
      '\\u0001\\u0002\\u0003',
    );
  });
});

// ---------------------------------------------------------------------------
// Scope: every documented event field
// ---------------------------------------------------------------------------

describe('scope: walks every documented field', () => {
  it('escapes the event.message field', () => {
    const out = runStage({ message: 'hi\x07' });
    expect(out.message).toBe('hi\\u0007');
  });

  it('escapes strings inside event.attributes (recursive)', () => {
    const out = runStage({
      attributes: { nested: { ctrl: 'x\x10y' }, list: ['a\x07b', 'safe'] },
    });
    expect((out.attributes.nested as Record<string, unknown>).ctrl).toBe(
      'x\\u0010y',
    );
    expect((out.attributes.list as unknown[])[0]).toBe('a\\u0007b');
    expect((out.attributes.list as unknown[])[1]).toBe('safe');
  });

  it('escapes strings inside event.context.attributes (recursive)', () => {
    const out = runStage({
      context: {
        application: { name: 'demo' },
        attributes: { ctrl: 'x\x07y' },
      },
    });
    expect(out.context.attributes?.ctrl).toBe('x\\u0007y');
  });

  it('escapes event.error.name, .message, and .stack', () => {
    const out = runStage({
      error: { name: 'X\x07', message: 'm\x08', stack: 's\x09\x10' },
    });
    expect(out.error?.name).toBe('X\\u0007');
    expect(out.error?.message).toBe('m\\u0008');
    expect(out.error?.stack).toBe('s\t\\u0010');
  });

  it('omits the stack field when the source error has no stack', () => {
    const out = runStage({ error: { name: 'E', message: 'm' } });
    expect(out.error).toEqual({ name: 'E', message: 'm' });
    expect('stack' in (out.error as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Identity preservation when nothing changes
// ---------------------------------------------------------------------------

describe('object identity', () => {
  it('returns the same event reference when no string changed', () => {
    const event = makeLogEvent({
      attributes: { a: 'plain', b: 'also plain', list: ['x', 'y'] },
    });
    const out = controlCharGuard(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('returns a new event when at least one string changed', () => {
    const event = makeLogEvent({ attributes: { s: 'x\x07y' } });
    const out = controlCharGuard(event, defaultConfig);
    expect(out).not.toBe(event);
  });

  it('preserves error reference when no error string changed', () => {
    const error = { name: 'E', message: 'safe', stack: 'safe stack' };
    const event = makeLogEvent({ error });
    const out = controlCharGuard(event, defaultConfig) as LogEvent;
    expect(out.error).toBe(error);
  });

  it('preserves context reference when no context string changed', () => {
    const event = makeLogEvent({
      context: {
        application: { name: 'demo' },
        attributes: { safe: 'value' },
      },
    });
    const out = controlCharGuard(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('skips context walking when context.attributes is undefined', () => {
    const event = makeLogEvent({ context: { application: { name: 'a' } } });
    expect(controlCharGuard(event, defaultConfig)).toBe(event);
  });
});

// ---------------------------------------------------------------------------
// Non-string values pass through
// ---------------------------------------------------------------------------

describe('non-string attribute values pass through unchanged', () => {
  it('numbers, booleans, null', () => {
    const event = makeLogEvent({
      attributes: { n: 42, b: true, z: null },
    });
    expect(controlCharGuard(event, defaultConfig)).toBe(event);
  });

  it('arrays of non-strings', () => {
    const event = makeLogEvent({ attributes: { a: [1, 2, 3] } });
    expect(controlCharGuard(event, defaultConfig)).toBe(event);
  });

  it('plain objects with no string values', () => {
    const event = makeLogEvent({ attributes: { o: { a: 1, b: false } } });
    expect(controlCharGuard(event, defaultConfig)).toBe(event);
  });

  it('handles undefined entries inside attributes defensively', () => {
    const out = runStage({
      attributes: {
        gone: undefined as never,
        kept: 'value\x07',
      },
    });
    expect(out.attributes.kept).toBe('value\\u0007');
  });

  it('handles undefined entries inside arrays defensively', () => {
    const out = runStage({
      attributes: { list: [undefined, 'x\x07y'] as never },
    });
    expect((out.attributes.list as unknown[])[1]).toBe('x\\u0007y');
  });
});

// ---------------------------------------------------------------------------
// Log-injection scenarios (covered more broadly by T043)
// ---------------------------------------------------------------------------

describe('log-injection-resistance signals', () => {
  it('escapes a fragment that would forge a JSON record in a line-delimited log file', () => {
    const forged = '\x07{"level":"error","message":"forged"}';
    const out = attrString({ attributes: { s: forged } });
    expect(out).toBe('\\u0007{"level":"error","message":"forged"}');
  });

  it('escapes ANSI ESC (U+001B) so terminal control sequences cannot pass through', () => {
    const ansi = '\x1B[31mRED';
    expect(attrString({ attributes: { s: ansi } })).toBe('\\u001b[31mRED');
  });
});
