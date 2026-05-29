/**
 * URL scrubber unit tests (T038).
 *
 * Two surfaces under test:
 *   - `scrubUrl(url, options?)` — public helper, re-exported from
 *     `src/index.ts`.
 *   - `urlScrub` — pipeline stage that walks every string in
 *     `event.message`, `event.attributes`, `event.context.attributes`,
 *     and `event.error.{name,message,stack}`.
 *
 * Targets 100% coverage on `src/pipeline/url-scrubber.ts`. The
 * sanitization → URL-scrub → redaction pipeline contract row is
 * locked elsewhere by T042 and T048.
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent } from '../../../src/api/types.js';
import { normalizeConfig } from '../../../src/config/config.js';
import { scrubUrl, urlScrub } from '../../../src/pipeline/url-scrubber.js';
import { makeLogEvent } from '../../helpers/event-fixtures.js';

const defaultConfig = normalizeConfig({});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStage(overrides: Partial<LogEvent>): LogEvent {
  return urlScrub(makeLogEvent(overrides), defaultConfig) as LogEvent;
}

// ---------------------------------------------------------------------------
// scrubUrl: non-URL / malformed input
// ---------------------------------------------------------------------------

describe('scrubUrl: input that is not a parseable http(s) URL', () => {
  it('returns an empty string unchanged', () => {
    expect(scrubUrl('')).toBe('');
  });

  it('returns a non-string input unchanged (defensive)', () => {
    expect(scrubUrl(123 as unknown as string)).toBe(123);
    expect(scrubUrl(null as unknown as string)).toBe(null);
  });

  it('returns opaque text unchanged', () => {
    expect(scrubUrl('hello world')).toBe('hello world');
  });

  it('returns a malformed URL unchanged', () => {
    expect(scrubUrl('http://[bad')).toBe('http://[bad');
  });

  it('returns a non-http(s) URL unchanged (ftp, mailto, data, file)', () => {
    expect(scrubUrl('ftp://host/path?token=abc')).toBe(
      'ftp://host/path?token=abc',
    );
    expect(scrubUrl('mailto:alice@example.com?token=abc')).toBe(
      'mailto:alice@example.com?token=abc',
    );
    expect(scrubUrl('data:text/plain;base64,aGk=')).toBe(
      'data:text/plain;base64,aGk=',
    );
    expect(scrubUrl('file:///tmp/x?token=abc')).toBe('file:///tmp/x?token=abc');
  });

  it('returns http(s) URLs unchanged when no sensitive params are present', () => {
    expect(scrubUrl('https://example.com/api?ok=1&safe=2')).toBe(
      'https://example.com/api?ok=1&safe=2',
    );
    expect(scrubUrl('http://example.com/path')).toBe('http://example.com/path');
  });
});

// ---------------------------------------------------------------------------
// scrubUrl: default denylist coverage
// ---------------------------------------------------------------------------

describe('scrubUrl: default param denylist (query)', () => {
  it('redacts ?password=...', () => {
    expect(scrubUrl('https://x/y?password=hunter2')).toBe(
      'https://x/y?password=%5BREDACTED%5D',
    );
  });

  it('redacts every default-denied param name', () => {
    const names = [
      'passwd',
      'token',
      'access_token',
      'refresh-token',
      'bearer_token',
      'id_token',
      'authorization',
      'auth',
      'cookie',
      'set-cookie',
      'secret',
      'client_secret',
      'api_key',
      'apikey',
      'session_id',
      'sessionId',
      'sid',
      'ssn',
      'credit_card',
      'creditcard',
      'cardnumber',
      'cvv',
    ];
    for (const name of names) {
      const out = scrubUrl(`https://x/?${name}=secret-${name}`);
      expect(out, `${name} should be redacted`).toBe(
        `https://x/?${name}=%5BREDACTED%5D`,
      );
    }
  });

  it('matches case-insensitively', () => {
    expect(scrubUrl('https://x/?Password=hunter2')).toBe(
      'https://x/?Password=%5BREDACTED%5D',
    );
    expect(scrubUrl('https://x/?AUTHORIZATION=Bearer%20xyz')).toBe(
      'https://x/?AUTHORIZATION=%5BREDACTED%5D',
    );
  });

  it('preserves safe params alongside sensitive ones', () => {
    expect(scrubUrl('https://x/?token=abc&page=2&visible=true')).toBe(
      'https://x/?token=%5BREDACTED%5D&page=2&visible=true',
    );
  });

  it('redacts every value of a repeated sensitive param', () => {
    expect(scrubUrl('https://x/?token=a&token=b&token=c')).toBe(
      'https://x/?token=%5BREDACTED%5D&token=%5BREDACTED%5D&token=%5BREDACTED%5D',
    );
  });

  it('does not match denylist substrings in non-sensitive param names (R-3 analog)', () => {
    // "tokenizer" contains "token" but is a different name; must not match.
    expect(scrubUrl('https://x/?tokenizer=1&product=name')).toBe(
      'https://x/?tokenizer=1&product=name',
    );
  });
});

// ---------------------------------------------------------------------------
// scrubUrl: fragment handling
// ---------------------------------------------------------------------------

describe('scrubUrl: fragment handling', () => {
  it('redacts sensitive params in a key=value fragment', () => {
    expect(scrubUrl('https://x/#token=abc&page=1')).toBe(
      'https://x/#token=%5BREDACTED%5D&page=1',
    );
  });

  it('leaves a non-key=value fragment alone', () => {
    expect(scrubUrl('https://x/#section-1')).toBe('https://x/#section-1');
  });

  it('handles empty fragment', () => {
    expect(scrubUrl('https://x/#')).toBe('https://x/#');
  });

  it('opts out of fragment scrubbing when options.fragment is false', () => {
    expect(
      scrubUrl('https://x/?token=abc#token=xyz', { fragment: false }),
    ).toBe('https://x/?token=%5BREDACTED%5D#token=xyz');
  });

  it('opts into fragment scrubbing when options.fragment is true (default)', () => {
    expect(scrubUrl('https://x/?token=abc#token=xyz', { fragment: true })).toBe(
      'https://x/?token=%5BREDACTED%5D#token=%5BREDACTED%5D',
    );
  });

  it('preserves fragment param ordering and non-sensitive entries', () => {
    expect(scrubUrl('https://x/#a=1&token=secret&b=2')).toBe(
      'https://x/#a=1&token=%5BREDACTED%5D&b=2',
    );
  });

  it('handles fragment with malformed URL-encoded keys without throwing', () => {
    const out = scrubUrl('https://x/#%E0%token=abc');
    expect(typeof out).toBe('string');
  });

  it('preserves fragment entries that have no `=` separator', () => {
    // Mixed fragment: a flag-only entry `flag` and a sensitive `token=...`.
    expect(scrubUrl('https://x/#flag&token=abc')).toBe(
      'https://x/#flag&token=%5BREDACTED%5D',
    );
  });
});

// ---------------------------------------------------------------------------
// scrubUrl: extraParams option
// ---------------------------------------------------------------------------

describe('scrubUrl: options.extraParams', () => {
  it('accepts string extras (case-insensitive exact match)', () => {
    expect(
      scrubUrl('https://x/?xCustom=abc&plain=yes', {
        extraParams: ['xCustom'],
      }),
    ).toBe('https://x/?xCustom=%5BREDACTED%5D&plain=yes');
  });

  it('accepts RegExp extras', () => {
    expect(
      scrubUrl('https://x/?x-internal-secret=abc&safe=yes', {
        extraParams: [/internal[_-]?secret/i],
      }),
    ).toBe('https://x/?x-internal-secret=%5BREDACTED%5D&safe=yes');
  });

  it('combines extraParams with default denylist', () => {
    expect(
      scrubUrl('https://x/?token=t1&customSecret=cs1&safe=ok', {
        extraParams: ['customSecret'],
      }),
    ).toBe(
      'https://x/?token=%5BREDACTED%5D&customSecret=%5BREDACTED%5D&safe=ok',
    );
  });

  it('handles an empty extraParams array as a no-op', () => {
    expect(scrubUrl('https://x/?token=t', { extraParams: [] })).toBe(
      'https://x/?token=%5BREDACTED%5D',
    );
  });
});

// ---------------------------------------------------------------------------
// urlScrub: pipeline stage
// ---------------------------------------------------------------------------

describe('urlScrub pipeline stage', () => {
  it('returns the same event reference when nothing scrubbed', () => {
    const event = makeLogEvent({ attributes: { plain: 'no-url-here' } });
    const out = urlScrub(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('scrubs a URL-shaped string in attributes', () => {
    const out = runStage({
      attributes: { url: 'https://x/?token=abc' },
    });
    expect(out.attributes.url).toBe('https://x/?token=%5BREDACTED%5D');
  });

  it('recurses into nested objects and arrays', () => {
    const out = runStage({
      attributes: {
        nested: { url: 'https://x/?token=abc' },
        list: ['https://x/?secret=xyz', 'plain text'],
      },
    });
    expect((out.attributes.nested as Record<string, unknown>).url).toBe(
      'https://x/?token=%5BREDACTED%5D',
    );
    expect((out.attributes.list as unknown[])[0]).toBe(
      'https://x/?secret=%5BREDACTED%5D',
    );
    expect((out.attributes.list as unknown[])[1]).toBe('plain text');
  });

  it('scrubs URL strings in context.attributes', () => {
    const out = runStage({
      context: {
        application: { name: 'demo' },
        attributes: { url: 'https://x/?token=abc' },
      },
    });
    expect(out.context.attributes?.url).toBe('https://x/?token=%5BREDACTED%5D');
  });

  it('skips scrubbing when context.attributes is undefined', () => {
    const event = makeLogEvent({
      context: { application: { name: 'demo' } },
    });
    const out = urlScrub(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('scrubs the event message when it IS a URL', () => {
    const event = makeLogEvent({ message: 'https://x/?token=abc' });
    const out = urlScrub(event, defaultConfig) as LogEvent;
    expect(out.message).toBe('https://x/?token=%5BREDACTED%5D');
  });

  it('leaves the message alone when it merely contains a URL (opaque text)', () => {
    const event = makeLogEvent({ message: 'visit https://x/?token=abc now' });
    const out = urlScrub(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('scrubs strings inside event.error.{message,stack}', () => {
    const out = runStage({
      error: {
        name: 'SomeError',
        message: 'https://x/?token=abc',
        stack: 'https://x/?secret=xyz',
      },
    });
    expect(out.error?.message).toBe('https://x/?token=%5BREDACTED%5D');
    expect(out.error?.stack).toBe('https://x/?secret=%5BREDACTED%5D');
  });

  it('omits error.stack scrubbing when stack is undefined', () => {
    const out = runStage({
      error: { name: 'E', message: 'https://x/?token=abc' },
    });
    expect(out.error?.message).toBe('https://x/?token=%5BREDACTED%5D');
    expect(out.error).not.toHaveProperty('stack');
  });

  it('passes through arrays of non-strings without change', () => {
    const event = makeLogEvent({
      attributes: { nums: [1, 2, 3], bools: [true, false] },
    });
    const out = urlScrub(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('preserves array items whose strings are not URLs', () => {
    const event = makeLogEvent({
      attributes: { list: ['hello', 'world'] },
    });
    const out = urlScrub(event, defaultConfig);
    expect(out).toBe(event);
  });

  it('handles undefined entries in arrays without throwing', () => {
    // Sanitizer normally converts these to null, but the pipeline stage
    // must still be defensive in case it's called on raw input.
    const arr = [undefined, 'https://x/?token=abc'] as never;
    const out = runStage({ attributes: { list: arr } });
    expect((out.attributes.list as unknown[])[1]).toBe(
      'https://x/?token=%5BREDACTED%5D',
    );
  });

  it('skips undefined values at the top of attributes (defensive)', () => {
    // Sanitizer would normally drop these; urlScrub still guards.
    const out = runStage({
      attributes: {
        gone: undefined as never,
        kept: 'https://x/?token=abc',
      },
    });
    expect(out.attributes.kept).toBe('https://x/?token=%5BREDACTED%5D');
  });

  it('returns a new event object only when at least one string changed', () => {
    const eventA = makeLogEvent({ attributes: { x: 'plain' } });
    expect(urlScrub(eventA, defaultConfig)).toBe(eventA);
    const eventB = makeLogEvent({ attributes: { x: 'https://x/?token=t' } });
    expect(urlScrub(eventB, defaultConfig)).not.toBe(eventB);
  });
});

// ---------------------------------------------------------------------------
// "Never throws" defensive belt
// ---------------------------------------------------------------------------

describe('scrubUrl: never throws on any input', () => {
  it('handles a string that looks like http(s) but fails to parse', () => {
    expect(() => scrubUrl('https://')).not.toThrow();
    expect(() => scrubUrl('http://[::1]:bad')).not.toThrow();
  });
});
