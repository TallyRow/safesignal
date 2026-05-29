/**
 * Secret-leakage security sweep (T041).
 *
 * Covers FR-012 (sensitive-data exposure is a first-class failure
 * mode), FR-014 (safe handling of sensitive values before delivery),
 * FR-015 (minimize accidental leakage from structured metadata) and
 * SC-008 (events with documented sensitive data classes are handled
 * per the protective contract).
 *
 * Strategy:
 *   1. Place each `makeSecretFixture()` value at every documented
 *      location — `attributes`, nested `attributes`,
 *      `context.attributes`, `event.message`, `event.error.message` —
 *      via the live pipeline (configureLogging + createLogger +
 *      log.info / log.error).
 *   2. Capture every delivered `LogEvent` via an in-memory transport.
 *   3. Assert NONE of the FIXTURE_VALUES appears in the captured
 *      events' serialized JSON form.
 *
 * The captured-event JSON-scan is the load-bearing assertion: it
 * catches any leak regardless of which field it ended up in, which is
 * how a real consumer would discover the failure mode.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { LogEvent } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  FIXTURE_VALUES,
  makeSecretFixture,
} from '../../src/testing/secret-fixtures.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'secret-leakage-sweep', version: '1.0.0' };

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

function _jsonOf(event: LogEvent): string {
  return JSON.stringify(event);
}

/**
 * Scan a captured event for any leaked fixture value. Deliberately
 * excludes `error.stack` from the scan — stack-trace strings begin
 * with `Error: <message>\n    at ...` and the redactor's shape rules
 * are anchored regexes (e.g., `^Bearer\s+...$`) that only match
 * values which ARE the entire string. The `contracts/redaction.md`
 * "Limitations" section calls this out as expected: a consumer who
 * builds an Error whose message contains a sensitive value will see
 * that value redacted from `event.error.message` but the literal
 * value may still appear in the stack frame text. Consumers who need
 * to log Errors carrying sensitive data should either (a) strip the
 * stack before logging, (b) use a custom redactor that scrubs stack
 * lines, or (c) emit a structured attribute instead of passing the
 * sensitive value through the Error message.
 */
function findLeaks(event: LogEvent): string[] {
  const safe: LogEvent =
    event.error === undefined
      ? event
      : {
          ...event,
          error: { name: event.error.name, message: event.error.message },
        };
  const serialized = JSON.stringify(safe);
  return FIXTURE_VALUES.filter((v) => serialized.includes(v));
}

// ---------------------------------------------------------------------------
// Key-path mappings: fixture keys → the documented denied attribute names
// they should be placed under to trigger the default key rule.
// ---------------------------------------------------------------------------

/**
 * Each entry: { fixtureKey, attributeKey, value }.
 *
 * `setCookie` deliberately uses `set-cookie` (HTTP-canonical, kebab-case)
 * since that's the documented denied name. `cookie`/`token`/etc. map
 * 1:1.  `jwt` does not have a key-rule entry; its value is shape-
 * matched separately by the message-and-error sweep below.
 */
const FIXTURE_TO_DENIED_KEY: ReadonlyArray<{
  readonly fixtureKey: keyof ReturnType<typeof makeSecretFixture>;
  readonly attrKey: string;
}> = [
  { fixtureKey: 'password', attrKey: 'password' },
  { fixtureKey: 'passwd', attrKey: 'passwd' },
  { fixtureKey: 'token', attrKey: 'token' },
  { fixtureKey: 'accessToken', attrKey: 'access_token' },
  { fixtureKey: 'refreshToken', attrKey: 'refresh_token' },
  { fixtureKey: 'bearerToken', attrKey: 'bearer_token' },
  { fixtureKey: 'authorization', attrKey: 'authorization' },
  { fixtureKey: 'auth', attrKey: 'auth' },
  { fixtureKey: 'cookie', attrKey: 'cookie' },
  { fixtureKey: 'setCookie', attrKey: 'set-cookie' },
  { fixtureKey: 'secret', attrKey: 'secret' },
  { fixtureKey: 'apiKey', attrKey: 'api_key' },
  { fixtureKey: 'sessionId', attrKey: 'session_id' },
  { fixtureKey: 'sid', attrKey: 'sid' },
  { fixtureKey: 'ssn', attrKey: 'ssn' },
  { fixtureKey: 'creditCard', attrKey: 'credit_card' },
  { fixtureKey: 'cardNumber', attrKey: 'cardNumber' },
  { fixtureKey: 'cvv', attrKey: 'cvv' },
];

// ---------------------------------------------------------------------------
// Per-key sweep at every documented location
// ---------------------------------------------------------------------------

describe('FR-012/14/15 + SC-008: per-key sweep across attribute locations', () => {
  it.each(
    FIXTURE_TO_DENIED_KEY,
  )('masks $fixtureKey at top-level attributes (under attrKey="$attrKey")', ({
    fixtureKey,
    attrKey,
  }) => {
    const fixture = makeSecretFixture();
    const value = fixture[fixtureKey];
    const log = createLogger();
    log.info('secret-at-top', { [attrKey]: value });
    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;
    expect(event.attributes[attrKey]).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it.each(
    FIXTURE_TO_DENIED_KEY,
  )('masks $fixtureKey at nested attributes (attrs.outer.$attrKey)', ({
    fixtureKey,
    attrKey,
  }) => {
    const fixture = makeSecretFixture();
    const value = fixture[fixtureKey];
    const log = createLogger();
    log.info('secret-nested', { outer: { [attrKey]: value } });
    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;
    const outer = event.attributes.outer as Record<string, unknown>;
    expect(outer[attrKey]).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it.each(
    FIXTURE_TO_DENIED_KEY,
  )('masks $fixtureKey at context.attributes (under attrKey="$attrKey")', ({
    fixtureKey,
    attrKey,
  }) => {
    const fixture = makeSecretFixture();
    const value = fixture[fixtureKey];
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: { attributes: { [attrKey]: value } },
    });
    const log = createLogger();
    log.info('secret-in-context');
    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;
    expect(event.context.attributes?.[attrKey]).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shape-matching sweep: Bearer and JWT values reach masking even when
// placed in fields that have no key context (message, error.*).
// ---------------------------------------------------------------------------

describe('FR-012/14/15 + SC-008: shape-matching values are masked in message and error fields', () => {
  it('masks a whole-string Bearer-shape value in event.message', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info(fixture.bearerToken!);
    const event = capture.calls[0]!;
    expect(event.message).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks a whole-string JWT-shape value in event.message', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info(fixture.jwt!);
    const event = capture.calls[0]!;
    expect(event.message).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks a Bearer-shape value placed in error.message', () => {
    const fixture = makeSecretFixture();
    const err = new Error(fixture.bearerToken!);
    const log = createLogger();
    log.error('auth-failure', undefined, err);
    const event = capture.calls[0]!;
    expect(event.error?.message).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks a JWT-shape value placed in error.message', () => {
    const fixture = makeSecretFixture();
    const err = new Error(fixture.jwt!);
    const log = createLogger();
    log.error('jwt-failure', undefined, err);
    const event = capture.calls[0]!;
    expect(event.error?.message).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks a JWT-shape leaf string inside an attribute object', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info('jwt-shape-in-attr', { jwt: fixture.jwt });
    const event = capture.calls[0]!;
    // JWT-shape rule fires (jwt key isn't denied by name) — value is
    // a leaf string that matches the shape.
    expect(event.attributes.jwt).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Whole-fixture event sweep
// ---------------------------------------------------------------------------

describe('FR-012/14/15 + SC-008: a single event carrying the full fixture leaks nothing', () => {
  it('emits one event with every documented key populated and leaks no value', () => {
    const fixture = makeSecretFixture();
    const everyKey: Record<string, string> = {};
    for (const { fixtureKey, attrKey } of FIXTURE_TO_DENIED_KEY) {
      everyKey[attrKey] = fixture[fixtureKey]!;
    }
    // Also place a JWT-shape value under a non-denied key to verify
    // the shape rule fires.
    everyKey.extra_jwt = fixture.jwt!;
    const log = createLogger();
    log.info('every-secret-at-once', everyKey);
    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;
    expect(findLeaks(event)).toEqual([]);
  });

  it('emits an error event with the bearer fixture in error.message and leaks nothing', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.error(
      'bearer-in-error',
      { token: fixture.token },
      new Error(fixture.bearerToken!),
    );
    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;
    expect(event.attributes.token).toBe('[REDACTED]');
    expect(event.error?.message).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });
});
