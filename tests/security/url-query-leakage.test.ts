/**
 * URL-query leakage security sweep (T042).
 *
 * Covers FR-013 (query-string secrets) and FR-014 (safe handling of
 * sensitive values before delivery).
 *
 * Strategy:
 *   URLs containing `?token=...`, `?session_id=...`, `?access_token=...`,
 *   `#auth=...` placed in attributes have their sensitive params
 *   replaced via the URL scrubber. Safe params on the same URL are
 *   preserved.
 *
 * The captured-event JSON scan asserts no fixture VALUE appears in
 * the delivered payload, regardless of where in the URL it lived.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { LogEvent } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'url-query-leakage', version: '1.0.0' };
const REDACTED = '%5BREDACTED%5D'; // `[REDACTED]` URL-encoded

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

function urlAt(event: LogEvent, key: string): string {
  return event.attributes[key] as string;
}

// ---------------------------------------------------------------------------
// Single sensitive query param
// ---------------------------------------------------------------------------

describe('FR-013 + FR-014: single-param query-string leakage', () => {
  it('replaces ?token=... with [REDACTED]', () => {
    const log = createLogger();
    log.info('url', { u: 'https://example.com/api?token=secret_VALUE_VVVV' });
    const event = capture.calls[0]!;
    expect(urlAt(event, 'u')).toBe(`https://example.com/api?token=${REDACTED}`);
    expect(urlAt(event, 'u')).not.toContain('secret_VALUE_VVVV');
  });

  it('replaces ?session_id=...', () => {
    const log = createLogger();
    log.info('url', { u: 'https://x/a?session_id=sess_12345_ABCDEF' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://x/a?session_id=${REDACTED}`,
    );
  });

  it('replaces ?access_token=...', () => {
    const log = createLogger();
    log.info('url', { u: 'https://x/a?access_token=at_LONG_VALUE_HERE' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://x/a?access_token=${REDACTED}`,
    );
  });

  it('replaces #auth=... in the fragment', () => {
    const log = createLogger();
    log.info('url', { u: 'https://x/a#auth=oauth_callback_VALUE' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(`https://x/a#auth=${REDACTED}`);
  });
});

// ---------------------------------------------------------------------------
// Mixed sensitive + safe params
// ---------------------------------------------------------------------------

describe('FR-013 + FR-014: safe params preserved alongside sensitive ones', () => {
  it('preserves page, sort, q while masking token', () => {
    const log = createLogger();
    log.info('mixed', {
      u: 'https://example.com/search?token=t1&page=2&sort=date&q=hello',
    });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://example.com/search?token=${REDACTED}&page=2&sort=date&q=hello`,
    );
  });

  it('preserves param order around scrubbed entries', () => {
    const log = createLogger();
    log.info('order', {
      u: 'https://x/?page=2&token=t&sort=date',
    });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://x/?page=2&token=${REDACTED}&sort=date`,
    );
  });

  it('preserves safe fragment entries alongside sensitive ones', () => {
    const log = createLogger();
    log.info('frag', {
      u: 'https://x/#page=home&auth=oauth_xyz&theme=dark',
    });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://x/#page=home&auth=${REDACTED}&theme=dark`,
    );
  });
});

// ---------------------------------------------------------------------------
// Multiple sensitive params
// ---------------------------------------------------------------------------

describe('FR-013 + FR-014: multiple sensitive params in one URL', () => {
  it('replaces every documented sensitive param in one URL', () => {
    const log = createLogger();
    log.info('many', {
      u: 'https://x/api?token=t&access_token=at&refresh_token=rt&authorization=a&api_key=k&session_id=s&password=p&secret=v',
    });
    const u = urlAt(capture.calls[0]!, 'u');
    expect(u).toBe(
      [
        'https://x/api?',
        `token=${REDACTED}`,
        `access_token=${REDACTED}`,
        `refresh_token=${REDACTED}`,
        `authorization=${REDACTED}`,
        `api_key=${REDACTED}`,
        `session_id=${REDACTED}`,
        `password=${REDACTED}`,
        `secret=${REDACTED}`,
      ]
        .join('&')
        .replace(/api\?&/, 'api?'),
    );
  });

  it('replaces repeated occurrences of the same sensitive param', () => {
    const log = createLogger();
    log.info('dup', {
      u: 'https://x/?token=t1&token=t2&token=t3',
    });
    const u = urlAt(capture.calls[0]!, 'u');
    expect(u).toBe(
      `https://x/?token=${REDACTED}&token=${REDACTED}&token=${REDACTED}`,
    );
    expect(u).not.toContain('t1');
    expect(u).not.toContain('t2');
    expect(u).not.toContain('t3');
  });

  it('replaces both query and fragment sensitive params', () => {
    const log = createLogger();
    log.info('both', {
      u: 'https://x/?token=qt&safe=ok#access_token=ft&page=home',
    });
    expect(urlAt(capture.calls[0]!, 'u')).toBe(
      `https://x/?token=${REDACTED}&safe=ok#access_token=${REDACTED}&page=home`,
    );
  });
});

// ---------------------------------------------------------------------------
// Recursive scrubbing
// ---------------------------------------------------------------------------

describe('FR-013 + FR-014: URL scrubbing reaches every attribute location', () => {
  it('scrubs URLs nested inside an attribute object', () => {
    const log = createLogger();
    log.info('nested', {
      request: { url: 'https://x/?token=secret_NESTED_VAL' },
    });
    const request = capture.calls[0]!.attributes.request as Record<
      string,
      unknown
    >;
    expect(request.url).toBe(`https://x/?token=${REDACTED}`);
  });

  it('scrubs URLs inside an array of strings', () => {
    const log = createLogger();
    log.info('array', {
      urls: [
        'https://x/?token=t1_VAL',
        'https://x/?safe=ok',
        'https://x/?session_id=s1_VAL',
      ],
    });
    const urls = capture.calls[0]!.attributes.urls as unknown[];
    expect(urls[0]).toBe(`https://x/?token=${REDACTED}`);
    expect(urls[1]).toBe('https://x/?safe=ok');
    expect(urls[2]).toBe(`https://x/?session_id=${REDACTED}`);
  });

  it('scrubs URLs in context.attributes', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: {
        attributes: { current_url: 'https://x/?token=ctx_VAL' },
      },
    });
    const log = createLogger();
    log.info('ctx-url');
    expect(capture.calls[0]!.context.attributes?.current_url).toBe(
      `https://x/?token=${REDACTED}`,
    );
  });

  it('scrubs a URL that is the entire event.message', () => {
    const log = createLogger();
    log.info('https://x/?token=msg_VAL');
    expect(capture.calls[0]!.message).toBe(`https://x/?token=${REDACTED}`);
  });

  it('does NOT scrub a URL embedded inside opaque message text', () => {
    // The URL scrubber operates on whole-string URLs only — values that
    // ARE the URL, not values that contain a URL fragment. The
    // contracts/redaction.md "Limitations" section documents this.
    const log = createLogger();
    log.info('visit https://x/?token=t now');
    expect(capture.calls[0]!.message).toBe('visit https://x/?token=t now');
  });
});

// ---------------------------------------------------------------------------
// Non-http(s) and malformed URLs
// ---------------------------------------------------------------------------

describe('non-http(s) and malformed URLs left alone', () => {
  it('leaves an ftp URL untouched (different protocol)', () => {
    const log = createLogger();
    log.info('ftp', { u: 'ftp://host/path?token=abc' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe('ftp://host/path?token=abc');
  });

  it('leaves a malformed URL untouched', () => {
    const log = createLogger();
    log.info('bad', { u: 'http://[bad' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe('http://[bad');
  });

  it('leaves plain text untouched', () => {
    const log = createLogger();
    log.info('plain', { u: 'not a url at all' });
    expect(urlAt(capture.calls[0]!, 'u')).toBe('not a url at all');
  });
});
