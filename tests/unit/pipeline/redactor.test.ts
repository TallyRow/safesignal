/**
 * Redactor unit tests (T040).
 *
 * Covers `contracts/redaction.md` (R-1..R-10) and the fail-closed
 * dispatcher contract:
 *   - Each default key rule masks values for matching keys at any depth.
 *   - Each default shape rule masks matching leaf string values.
 *   - R-3 over-redaction guard: substring matches in non-key positions
 *     are NOT mangled.
 *   - Custom RedactionRule[] fully replaces defaults; empty array is a
 *     no-op rule set.
 *   - Custom Redactor (function form) supplies the composition pattern
 *     used in real consumer code.
 *   - The `redact` pipeline stage's fail-closed handling: throws and
 *     non-event/non-null returns route through onInternalError via the
 *     dispatcher's outer try/catch.
 *
 * Targets 100% coverage on `src/pipeline/redactor.ts`. The end-to-end
 * fail-closed test (T046) and the secret-leakage sweep (T041) exercise
 * the redactor through the full pipeline; this file targets the unit.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  LogEvent,
  RedactionRule,
  Redactor,
} from '../../../src/api/types.js';
import { normalizeConfig } from '../../../src/config/config.js';
import { createRedactor, redact } from '../../../src/pipeline/redactor.js';
import { makeLogEvent } from '../../helpers/event-fixtures.js';

const defaultConfig = normalizeConfig({});
const defaultRedactor = createRedactor();

function runDefaultRedactor(overrides: Partial<LogEvent>): LogEvent {
  const event = makeLogEvent(overrides);
  const out = defaultRedactor(event);
  if (out === null)
    throw new Error('default redactor unexpectedly returned null');
  return out;
}

// ---------------------------------------------------------------------------
// R-1: each default key rule masks values for matching keys at any depth
// ---------------------------------------------------------------------------

describe('R-1: default key rules mask matching key values', () => {
  it.each([
    ['password', 'hunter2'],
    ['passwd', 'hunter2'],
    ['token', 'tok-xxx'],
    ['access_token', 'at-xxx'],
    ['accessToken', 'at-xxx'],
    ['access-token', 'at-xxx'],
    ['refresh_token', 'rt-xxx'],
    ['bearer_token', 'bt-xxx'],
    ['authorization', 'Bearer xxx'],
    ['auth', 'value'],
    ['cookie', 'sid=xxx'],
    ['set-cookie', 'sid=xxx'],
    ['secret', 'value'],
    ['api_key', 'ak-xxx'],
    ['api-key', 'ak-xxx'],
    ['apiKey', 'ak-xxx'],
    ['session_id', 'sess-1'],
    ['session-id', 'sess-1'],
    ['sessionId', 'sess-1'],
    ['sid', 'sess-1'],
    ['ssn', '111-22-3333'],
    ['credit_card', '4111111111111111'],
    ['credit-card', '4111111111111111'],
    ['cardNumber', '4111111111111111'],
    ['cvv', '123'],
  ])('masks value at top-level key "%s"', (key, value) => {
    const out = runDefaultRedactor({
      attributes: { [key]: value },
    });
    expect(out.attributes[key]).toBe('[REDACTED]');
  });

  it('masks values at denied keys regardless of nesting depth', () => {
    const out = runDefaultRedactor({
      attributes: {
        outer: {
          middle: {
            inner: { password: 'deep-secret' },
          },
        },
      },
    });
    const deep = (
      (
        (out.attributes.outer as Record<string, unknown>).middle as Record<
          string,
          unknown
        >
      ).inner as Record<string, unknown>
    ).password;
    expect(deep).toBe('[REDACTED]');
  });

  it('is case-insensitive on key names', () => {
    const out = runDefaultRedactor({
      attributes: { PASSWORD: 'X', Authorization: 'Y', API_KEY: 'Z' },
    });
    expect(out.attributes.PASSWORD).toBe('[REDACTED]');
    expect(out.attributes.Authorization).toBe('[REDACTED]');
    expect(out.attributes.API_KEY).toBe('[REDACTED]');
  });

  it('masks the WHOLE subtree when a parent key matches (no recursion into sensitive children)', () => {
    const out = runDefaultRedactor({
      attributes: {
        secret: { details: { nested: 'value' }, list: [1, 2] },
      },
    });
    expect(out.attributes.secret).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// R-2: shape rules
// ---------------------------------------------------------------------------

describe('R-2: default shape rules mask matching leaf string values', () => {
  it('masks JWT-shaped strings (3 dot-separated 8+ char segments)', () => {
    const out = runDefaultRedactor({
      attributes: { jwt: 'eyJhbGci0i.payloadabc123.signaturedef-456' },
    });
    expect(out.attributes.jwt).toBe('[REDACTED]');
  });

  it('does NOT match shape rules against arbitrary substrings', () => {
    const out = runDefaultRedactor({
      attributes: { note: 'jwt-like prefix eyJ but not a full token' },
    });
    expect(out.attributes.note).toBe(
      'jwt-like prefix eyJ but not a full token',
    );
  });

  it('masks Bearer-prefixed strings', () => {
    const out = runDefaultRedactor({
      attributes: { auth: 'Bearer abc123def-xyz' },
    });
    expect(out.attributes.auth).toBe('[REDACTED]');
  });

  it('does NOT match values that merely contain "Bearer" mid-string', () => {
    const out = runDefaultRedactor({
      attributes: { note: 'visit Bearer abc but more text after' },
    });
    expect(out.attributes.note).toBe('visit Bearer abc but more text after');
  });

  it('matches Bearer prefix case-insensitively', () => {
    const out = runDefaultRedactor({
      attributes: { auth: 'bearer abc123' },
    });
    expect(out.attributes.auth).toBe('[REDACTED]');
  });

  it('applies shape rules to leaf strings inside arrays', () => {
    const out = runDefaultRedactor({
      attributes: {
        list: ['Bearer xyz123def', 'safe', 'eyJhbGci0i.aaaaaaaa.bbbbbbbb'],
      },
    });
    expect((out.attributes.list as unknown[])[0]).toBe('[REDACTED]');
    expect((out.attributes.list as unknown[])[1]).toBe('safe');
    expect((out.attributes.list as unknown[])[2]).toBe('[REDACTED]');
  });

  it('recurses into nested arrays', () => {
    const out = runDefaultRedactor({
      attributes: {
        matrix: [['safe', 'Bearer xyz123def'], ['plain']] as never,
      },
    });
    const row0 = (out.attributes.matrix as unknown[])[0] as unknown[];
    expect(row0[0]).toBe('safe');
    expect(row0[1]).toBe('[REDACTED]');
  });

  it('recurses into plain objects inside arrays (key rules apply)', () => {
    const out = runDefaultRedactor({
      attributes: { records: [{ password: 'p1' }, { name: 'alice' }] },
    });
    const r0 = (out.attributes.records as unknown[])[0] as Record<
      string,
      unknown
    >;
    const r1 = (out.attributes.records as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(r0.password).toBe('[REDACTED]');
    expect(r1.name).toBe('alice');
  });

  it('skips undefined entries inside arrays', () => {
    const arr = [undefined, 'Bearer xyz123def'] as never;
    const out = runDefaultRedactor({ attributes: { list: arr } });
    expect((out.attributes.list as unknown[])[1]).toBe('[REDACTED]');
  });

  it('preserves non-string, non-object array items', () => {
    const out = runDefaultRedactor({
      attributes: { mixed: [1, true, null, 'safe'] },
    });
    expect(out.attributes.mixed).toEqual([1, true, null, 'safe']);
  });

  it('does NOT apply shape rules to objects/arrays as containers', () => {
    // A nested array shouldn't be matched as a single value.
    const out = runDefaultRedactor({
      attributes: { x: ['Bearer abc123def'] as never },
    });
    // Inside the array, the string IS shape-matched (it's a leaf string)
    expect((out.attributes.x as unknown[])[0]).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// R-3: over-redaction guard
// ---------------------------------------------------------------------------

describe('R-3: substring matches in non-key positions are not mangled', () => {
  it('keeps a value containing "token" under a non-denied key (e.g. product)', () => {
    const out = runDefaultRedactor({
      attributes: { product: 'tokenizer is great' },
    });
    expect(out.attributes.product).toBe('tokenizer is great');
  });

  it('keeps a value mentioning "authorization" or "password" inside descriptive text', () => {
    const out = runDefaultRedactor({
      attributes: {
        description: 'authorization is required',
        hint: 'the user must enter a password',
      },
    });
    expect(out.attributes.description).toBe('authorization is required');
    expect(out.attributes.hint).toBe('the user must enter a password');
  });

  it('keeps a key whose NAME merely contains a denied substring (e.g. tokenizer)', () => {
    // Default rules anchor or are case-sensitive enough that "tokenizer"
    // is not a denied key. Verifies the contract example.
    const out = runDefaultRedactor({
      attributes: { tokenizer: 'this is fine' },
    });
    expect(out.attributes.tokenizer).toBe('this is fine');
  });
});

// ---------------------------------------------------------------------------
// R-4 / R-5: custom rules and custom redactor
// ---------------------------------------------------------------------------

describe('R-4 / R-5: custom rule sets and custom redactors', () => {
  it('a custom RedactionRule[] fully replaces the defaults', () => {
    const r = createRedactor([{ key: /^xCustom$/i }]);
    const out = r(
      makeLogEvent({
        attributes: { xCustom: 'hide', password: 'visible-now' },
      }),
    );
    if (out === null) throw new Error('expected event');
    expect(out.attributes.xCustom).toBe('[REDACTED]');
    expect(out.attributes.password).toBe('visible-now'); // defaults replaced
  });

  it('treats an empty rule array as a no-op redactor', () => {
    const r = createRedactor([]);
    const event = makeLogEvent({ attributes: { password: 'plain' } });
    const out = r(event);
    expect(out).toBe(event); // identity preserved when nothing changes
  });

  it('uses a rule.replacement override when specified', () => {
    const r = createRedactor([
      { key: /^password$/i, replacement: '<<scrubbed>>' },
    ]);
    const out = r(makeLogEvent({ attributes: { password: 'x' } }));
    if (out === null) throw new Error('expected event');
    expect(out.attributes.password).toBe('<<scrubbed>>');
  });

  it('accepts string keys (case-insensitive exact match)', () => {
    const r = createRedactor([{ key: 'customField' }]);
    const out = r(
      makeLogEvent({ attributes: { CustomField: 'hide', other: 'keep' } }),
    );
    if (out === null) throw new Error('expected event');
    expect(out.attributes.CustomField).toBe('[REDACTED]');
    expect(out.attributes.other).toBe('keep');
  });

  it('a rule with both key and shape replaces on EITHER match', () => {
    const r = createRedactor([
      { key: /^secret$/i, shape: /^MY-SECRET-\d+$/, replacement: '<<both>>' },
    ]);
    const out = r(
      makeLogEvent({
        attributes: {
          secret: 'matches by key',
          random: 'MY-SECRET-42', // matches by shape only
        },
      }),
    );
    if (out === null) throw new Error('expected event');
    expect(out.attributes.secret).toBe('<<both>>');
    expect(out.attributes.random).toBe('<<both>>');
  });

  it('supports the composition pattern from the contract', () => {
    // Compose default redactor with a project-specific extension rule.
    const composed: Redactor = (event) => {
      const base = createRedactor()(event);
      if (base === null) return null;
      return createRedactor([{ key: /internal[_-]?secret/i }])(base);
    };
    const out = composed(
      makeLogEvent({
        attributes: { password: 'p', internal_secret: 'is', plain: 'ok' },
      }),
    );
    if (out === null) throw new Error('expected event');
    expect(out.attributes.password).toBe('[REDACTED]');
    expect(out.attributes.internal_secret).toBe('[REDACTED]');
    expect(out.attributes.plain).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// R-10: message and error.* are scanned by shape rules
// ---------------------------------------------------------------------------

describe('R-10: event.message and event.error.{name,message,stack} get shape rules only', () => {
  it('replaces message when it matches a shape rule as a whole', () => {
    const out = runDefaultRedactor({
      message: 'Bearer abc123def-xyz',
    });
    expect(out.message).toBe('[REDACTED]');
  });

  it('does NOT replace message when only a substring matches', () => {
    const out = runDefaultRedactor({
      message: 'visit Bearer abc123 now',
    });
    expect(out.message).toBe('visit Bearer abc123 now');
  });

  it('replaces error.message when it matches a shape rule', () => {
    const out = runDefaultRedactor({
      error: { name: 'AuthError', message: 'Bearer abc123def' },
    });
    expect(out.error?.message).toBe('[REDACTED]');
  });

  it('replaces error.stack when it matches a shape rule', () => {
    const out = runDefaultRedactor({
      error: {
        name: 'JWT',
        message: 'short',
        stack: 'eyJhbGci0i.payloadabc.signaturedef',
      },
    });
    expect(out.error?.stack).toBe('[REDACTED]');
  });

  it('leaves error.name and error.stack untouched when nothing matches', () => {
    const out = runDefaultRedactor({
      error: { name: 'TypeError', message: 'normal', stack: 'normal stack' },
    });
    expect(out.error?.name).toBe('TypeError');
    expect(out.error?.message).toBe('normal');
    expect(out.error?.stack).toBe('normal stack');
  });

  it('omits stack when source error has no stack', () => {
    const out = runDefaultRedactor({
      error: { name: 'E', message: 'm' },
    });
    expect(out.error).toEqual({ name: 'E', message: 'm' });
    expect('stack' in (out.error as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Event identity preservation
// ---------------------------------------------------------------------------

describe('object identity', () => {
  it('returns the same event reference when no rule fires', () => {
    const event = makeLogEvent({
      attributes: { plain: 'value', n: 1, b: true },
    });
    expect(defaultRedactor(event)).toBe(event);
  });

  it('returns a new event when any rule fires', () => {
    const event = makeLogEvent({ attributes: { password: 'x' } });
    expect(defaultRedactor(event)).not.toBe(event);
  });

  it('returns a new context object when a rule fires inside context.attributes', () => {
    const out = runDefaultRedactor({
      context: {
        application: { name: 'demo' },
        attributes: { token: 'secret' },
      },
    });
    expect(out.context.attributes?.token).toBe('[REDACTED]');
  });
});

// ---------------------------------------------------------------------------
// Pipeline-stage fail-closed handling
// ---------------------------------------------------------------------------

describe('redact pipeline stage: fail-closed', () => {
  it('returns null when the configured redactor returns null', () => {
    const event = makeLogEvent();
    const config = normalizeConfig({ redactor: () => null });
    expect(redact(event, config)).toBe(null);
  });

  it('returns the redactor result when valid', () => {
    const event = makeLogEvent({ attributes: { password: 'x' } });
    const result = redact(event, defaultConfig);
    expect(result).not.toBeNull();
    expect((result as LogEvent).attributes.password).toBe('[REDACTED]');
  });

  it('throws PackageError(redactor_failed) when redactor returns a non-event, non-null value', () => {
    const config = normalizeConfig({
      redactor: () => ({ not: 'an event' }) as unknown as LogEvent,
    });
    let caught: unknown;
    try {
      redact(makeLogEvent(), config);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error & { code?: string }).code).toBe('redactor_failed');
    expect((caught as Error).message).toMatch(/neither a LogEvent nor null/);
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['number', 42],
    ['string', 'event'],
    ['empty object', {}],
    ['array', []],
    [
      'object missing timestamp',
      { level: 'info', message: 'x', attributes: {}, context: {} },
    ],
    [
      'object with non-string level',
      { timestamp: 'now', level: 7, message: '', attributes: {}, context: {} },
    ],
    [
      'object with wrong level',
      {
        timestamp: 'now',
        level: 'unknown',
        message: '',
        attributes: {},
        context: {},
      },
    ],
    [
      'object missing message',
      { timestamp: 'now', level: 'info', attributes: {}, context: {} },
    ],
    [
      'object with null attributes',
      {
        timestamp: 'now',
        level: 'info',
        message: '',
        attributes: null,
        context: {},
      },
    ],
    [
      'object with null context',
      {
        timestamp: 'now',
        level: 'info',
        message: '',
        attributes: {},
        context: null,
      },
    ],
  ])('detects %s as non-event and throws', (_label, value) => {
    const config = normalizeConfig({
      redactor: () => value as unknown as LogEvent,
    });
    expect(() => redact(makeLogEvent(), config)).toThrow();
  });

  it('uses the default redactor when config.redactor is undefined', () => {
    const event = makeLogEvent({ attributes: { password: 'x' } });
    const result = redact(event, defaultConfig);
    expect((result as LogEvent).attributes.password).toBe('[REDACTED]');
  });

  it('a redactor that throws propagates to the dispatcher (fail-closed via dispatcher.ts)', () => {
    const config = normalizeConfig({
      redactor: () => {
        throw new Error('redactor explosion');
      },
    });
    expect(() => redact(makeLogEvent(), config)).toThrow(/redactor explosion/);
  });

  it('default redactor accepts the same event back on identity-preserving runs', () => {
    // Confirms that running redact() many times against a plain event
    // does no allocation past the first; structurally proves the
    // identity preservation invariant for the configured runtime.
    const event = makeLogEvent({ attributes: { plain: 1 } });
    const first = redact(event, defaultConfig);
    const second = redact(first as LogEvent, defaultConfig);
    expect(first).toBe(event);
    expect(second).toBe(event);
  });

  it('a quietly-buggy redactor that uses spies still emits the right side effect', () => {
    const spy = vi.fn((event: LogEvent) => event);
    const config = normalizeConfig({ redactor: spy });
    const event = makeLogEvent({ attributes: { something: 1 } });
    redact(event, config);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(event);
  });
});

// ---------------------------------------------------------------------------
// Custom RedactionRule with neither key nor shape (defensive)
// ---------------------------------------------------------------------------

describe('defensive: rule with neither key nor shape', () => {
  it('is silently a no-op (compiles to neither a keyRule nor a shapeRule)', () => {
    const r = createRedactor([{} as RedactionRule]);
    const event = makeLogEvent({ attributes: { password: 'plain' } });
    const out = r(event);
    expect(out).toBe(event); // identity preserved
  });
});

describe('defensive: undefined attribute values', () => {
  it('skips undefined top-level attribute values', () => {
    const event = makeLogEvent({
      attributes: { gone: undefined as never, kept: 'value' },
    });
    const out = defaultRedactor(event);
    expect(out).toBe(event); // nothing changed
  });

  it('handles a context with no attributes field at all', () => {
    const event = makeLogEvent({
      context: { application: { name: 'demo' } }, // no attributes
    });
    const out = defaultRedactor(event);
    expect(out).toBe(event);
  });
});
