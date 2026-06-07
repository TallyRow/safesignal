/**
 * End-to-end secret sweep (T068).
 *
 * This is the FULL-PIPELINE integration counterpart to the focused
 * security tests (`tests/security/secret-leakage.test.ts`,
 * `tests/security/url-query-leakage.test.ts`,
 * `tests/security/fail-closed-redaction.test.ts`, etc.). It exercises
 * the live default-path pipeline end to end —
 *
 *   LevelFilter
 *     → EventBuilder
 *     → Sanitizer
 *     → URLScrubber
 *     → Redactor
 *     → ControlCharGuard
 *     → Freeze(dev)
 *     → direct transport fan-out
 *     → in-memory transport (this test's observer)
 *
 * — and asserts that NO fixture value escapes through any channel
 * (attribute, nested attribute, context.attributes, message,
 * error.message, URL-shaped attribute strings).
 *
 * The load-bearing assertion is the per-event JSON scan against the
 * full `FIXTURE_VALUES` list — a single failure regardless of which
 * field it leaks in surfaces here. This catches integration-level
 * regressions where one stage is bypassed (e.g., the redactor never
 * runs for a particular code path) even when each stage's own unit
 * test continues to pass.
 *
 * Vendor-neutrality note (per plan.md "Vendor-Neutral Core
 * Architecture"): v1's core sweep does NOT exercise any vendor
 * adapter (OpenTelemetry, Datadog, Sentry, or any other) because
 * none is on the default path and none is bundled. Future vendor-
 * adapter features will each ship an equivalent sweep against their
 * own `Transport` adapter as part of that feature's own plan/tasks.
 * Vendor adapters are peers of each other and of the existing
 * built-in transports — they share no privileged code path.
 *
 * Pipeline-stage observability cross-checks (e.g., the event is
 * frozen at the transport, control chars are escaped, URL params
 * are scrubbed) confirm the full chain ran. If any cross-check
 * fails, a stage was skipped or the order was disturbed — that's
 * a different failure mode from a redactor bug and worth catching
 * here in addition to the focused security tests.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Attributes, LogEvent, Transport } from '../../src/api/types.js';
import {
  ConsoleTransport,
  configureLogging,
  createLogger,
  NoopTransport,
} from '../../src/index.js';
import {
  FIXTURE_VALUES,
  makeSecretFixture,
} from '../../src/testing/secret-fixtures.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'secret-sweep-e2e', version: '2026.05.0' };

let capture = makeCapturingTransport('e2e-capture');
let consoleSpy: ReturnType<typeof spyOnConsole>;

beforeEach(() => {
  capture = makeCapturingTransport('e2e-capture');
  consoleSpy = spyOnConsole();
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

afterEach(() => {
  consoleSpy.restore();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spyOnConsole(): { restore: () => void; getCalls: () => string[] } {
  const original = {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
    log: console.log,
  };
  const calls: string[] = [];
  for (const key of Object.keys(original) as ReadonlyArray<
    keyof typeof original
  >) {
    console[key] = (...args: unknown[]) => {
      calls.push(
        args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' '),
      );
    };
  }
  return {
    restore() {
      Object.assign(console, original);
    },
    getCalls() {
      return calls;
    },
  };
}

/**
 * Scan a delivered event for ANY leaked fixture value across every
 * field. Excludes `error.stack` because stack frames are
 * implementation-defined and the redactor's anchored shape rules
 * legitimately do not catch substrings inside stack-line text — that
 * limitation is documented in `contracts/redaction.md` "Limitations"
 * and `docs/safe-logging.md`. Consumers logging Errors that carry
 * secrets in their `.message` are protected (the message goes
 * through `event.error.message`, which IS scanned).
 */
function findLeaks(event: LogEvent): string[] {
  const safe: LogEvent =
    event.error === undefined
      ? event
      : {
          ...event,
          error: { name: event.error.name, message: event.error.message },
        };
  // Exclude the auto-generated `timestamp` from the leak scan: it never
  // carries consumer/fixture data, and its millisecond digits can
  // coincidentally contain a short fixture value (e.g. cvv "123"),
  // producing a false-positive "leak" that makes this test flaky
  // (Principle IX: same source must give the same result).
  const { timestamp: _timestamp, ...scannable } = safe;
  const serialized = JSON.stringify(scannable);
  return FIXTURE_VALUES.filter((v) => serialized.includes(v));
}

/**
 * Helper for the multi-transport assertion: every delivered event,
 * on every transport, contains zero leaks. Returns the array of leak
 * pairs (transport, leakedValue) — empty array means clean.
 */
function findLeaksAcrossTransports(
  transports: ReadonlyArray<{ name: string; calls: ReadonlyArray<LogEvent> }>,
): Array<{ transport: string; leaks: string[] }> {
  const out: Array<{ transport: string; leaks: string[] }> = [];
  for (const t of transports) {
    for (const event of t.calls) {
      const leaks = findLeaks(event);
      if (leaks.length > 0) out.push({ transport: t.name, leaks });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full-pipeline cross-check: every stage runs for a single event
// ---------------------------------------------------------------------------

describe('full pipeline runs for every emitted event (cross-check)', () => {
  it('a single emission with a value in every stage surface is sanitized + URL-scrubbed + redacted + control-char-guarded + frozen at the transport', () => {
    const fixture = makeSecretFixture();
    class CredentialBag {
      readonly password = fixture.password;
    }
    const log = createLogger();
    log.info('e2e composite', {
      // Sanitizer: type-tag a class instance carrying a fixture
      // value as a property. The fixture value MUST NOT escape the
      // sanitizer.
      creds: new CredentialBag() as never,
      // URLScrubber: scrub the `token` query param.
      callback_url: `https://example.com/back?token=${fixture.token}&page=2`,
      // Redactor (key rule): `password` is denied → masked.
      password: fixture.password,
      // Redactor (shape rule): JWT-shape leaf string under a
      // non-denied key is masked.
      claim: fixture.jwt,
      // ControlCharGuard: bell + line separator in a non-denied
      // attribute. Guard escapes; sanitizer does not.
      note: 'before\x07after continued',
    });

    expect(capture.calls).toHaveLength(1);
    const event = capture.calls[0]!;

    // Stage cross-checks — confirms each stage actually ran.
    // Sanitizer:
    expect(event.attributes.creds).toBe('[CredentialBag]');
    // URLScrubber:
    expect(event.attributes.callback_url).toBe(
      'https://example.com/back?token=%5BREDACTED%5D&page=2',
    );
    // Redactor (key):
    expect(event.attributes.password).toBe('[REDACTED]');
    // Redactor (shape):
    expect(event.attributes.claim).toBe('[REDACTED]');
    // ControlCharGuard:
    expect(event.attributes.note).toBe('before\\u0007after\\u2028continued');
    // Freeze(dev): the dispatcher fans the frozen reference out
    // directly (post-T066). Nested attributes/context are also
    // recursively frozen by `freezeInDev`.
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.attributes)).toBe(true);
    expect(Object.isFrozen(event.context)).toBe(true);
    // Application context is still attached.
    expect(event.context.application).toEqual(APP);

    // The load-bearing assertion: no fixture value anywhere in the
    // event's JSON form.
    expect(findLeaks(event)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Per-location placement sweep — every fixture value, every stage's
// "responsible" location, every event level
// ---------------------------------------------------------------------------

describe('every fixture value in every documented location is masked end-to-end', () => {
  // Each row: { label, place(fixture, log, attrs) }. `attrs` is the
  // attributes object the test builds; the placement function decides
  // where the fixture value goes.
  type Placement = {
    readonly label: string;
    readonly place: (
      fixture: ReturnType<typeof makeSecretFixture>,
      attrs: Attributes,
    ) => Attributes;
  };

  const PLACEMENTS: ReadonlyArray<Placement> = [
    {
      label: 'top-level attribute under denied key (password)',
      place: (f, a) => ({ ...a, password: f.password }),
    },
    {
      label: 'nested attribute under denied key (outer.api_key)',
      place: (f, a) => ({ ...a, outer: { api_key: f.apiKey } }),
    },
    {
      label: 'array-of-objects with denied key (entries[].token)',
      place: (f, a) => ({
        ...a,
        entries: [{ token: f.token }, { token: f.token }],
      }),
    },
    {
      label: 'URL query parameter (callback_url has ?token=...)',
      place: (f, a) => ({
        ...a,
        callback_url: `https://example.com/cb?token=${f.token}&safe=ok`,
      }),
    },
    {
      label: 'JWT-shape leaf string under non-denied key (claim)',
      place: (f, a) => ({ ...a, claim: f.jwt }),
    },
    {
      label: 'Bearer-shape leaf string under non-denied key (header)',
      place: (f, a) => ({ ...a, header: f.bearerToken }),
    },
  ];

  for (const { label, place } of PLACEMENTS) {
    it(`masks: ${label}`, () => {
      const fixture = makeSecretFixture();
      const log = createLogger();
      log.info('placement-sweep', place(fixture, {}));
      expect(capture.calls).toHaveLength(1);
      const event = capture.calls[0]!;
      expect(findLeaks(event)).toEqual([]);
    });
  }

  it('masks fixture values in context.attributes (set at configureLogging time)', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: {
        attributes: {
          authorization: fixture.authorization,
          session_id: fixture.sessionId,
        },
      },
    });
    const log = createLogger();
    log.info('context-attrs');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.authorization).toBe('[REDACTED]');
    expect(event.context.attributes?.session_id).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks fixture values in event.message (whole-string Bearer / JWT)', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.info(fixture.bearerToken);
    log.warn(fixture.jwt);
    expect(capture.calls).toHaveLength(2);
    for (const event of capture.calls) {
      expect(event.message).toBe('[REDACTED]');
      expect(findLeaks(event)).toEqual([]);
    }
  });

  it('masks fixture values in error.message (Bearer / JWT shape)', () => {
    const fixture = makeSecretFixture();
    const log = createLogger();
    log.error(
      'auth-fail',
      { reason: 'invalid' },
      new Error(fixture.bearerToken),
    );
    log.error('jwt-fail', { phase: 'decode' }, new Error(fixture.jwt));
    expect(capture.calls).toHaveLength(2);
    for (const event of capture.calls) {
      expect(event.error?.message).toBe('[REDACTED]');
      expect(findLeaks(event)).toEqual([]);
    }
  });

  it('masks correlation()-supplied fixture values', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      correlation: () => ({
        attributes: {
          authorization: fixture.authorization,
          cookie: fixture.cookie,
        },
      }),
    });
    const log = createLogger();
    log.info('correlation-supplies-secret');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.authorization).toBe('[REDACTED]');
    expect(event.context.attributes?.cookie).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks fixture values in child-logger attributes', () => {
    const fixture = makeSecretFixture();
    const child = createLogger().child({
      attributes: { secret: fixture.secret },
    });
    child.info('child-with-secret');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.secret).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });

  it('masks fixture values in withContext-supplied attributes', () => {
    const fixture = makeSecretFixture();
    const log = createLogger().withContext({
      attributes: { credit_card: fixture.creditCard },
    });
    log.info('with-context-secret');
    const event = capture.calls[0]!;
    expect(event.context.attributes?.credit_card).toBe('[REDACTED]');
    expect(findLeaks(event)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Multi-transport fan-out: every transport receives the masked event
// ---------------------------------------------------------------------------

describe('direct transport fan-out: every transport receives the masked event (no leak path through a sibling)', () => {
  it('three sibling transports each receive the same masked event', () => {
    const fixture = makeSecretFixture();
    const t1 = makeCapturingTransport('t1');
    const t2 = makeCapturingTransport('t2');
    const t3 = makeCapturingTransport('t3');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [t1, t2, t3],
    });
    const log = createLogger();
    log.info('fan-out-secret', {
      password: fixture.password,
      authorization: fixture.authorization,
      callback_url: `https://api.example.com/r?token=${fixture.token}`,
    });

    expect(t1.calls).toHaveLength(1);
    expect(t2.calls).toHaveLength(1);
    expect(t3.calls).toHaveLength(1);

    const leakReport = findLeaksAcrossTransports([t1, t2, t3]);
    expect(leakReport).toEqual([]);

    // Cross-transport consistency: every transport's event has the
    // same masked values.
    for (const t of [t1, t2, t3] as const) {
      const event = t.calls[0]!;
      expect(event.attributes.password).toBe('[REDACTED]');
      expect(event.attributes.authorization).toBe('[REDACTED]');
      expect(event.attributes.callback_url).toBe(
        'https://api.example.com/r?token=%5BREDACTED%5D',
      );
    }
  });

  it('mixing the built-in NoopTransport + ConsoleTransport with the capture transport does not leak any fixture to console.* output', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [NoopTransport(), ConsoleTransport(), capture],
    });
    const log = createLogger();
    log.info('every-transport', {
      password: fixture.password,
      api_key: fixture.apiKey,
      authorization: fixture.authorization,
    });

    // Capture transport received the masked event.
    expect(capture.calls).toHaveLength(1);
    expect(findLeaks(capture.calls[0]!)).toEqual([]);

    // Console transport: scan everything it wrote. No fixture value
    // should appear in any console.* invocation's arguments.
    const consoleOutput = consoleSpy.getCalls().join('\n');
    for (const v of FIXTURE_VALUES) {
      expect(consoleOutput.includes(v)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Whole-fixture single event: every documented key + JWT-shape leaf
// ---------------------------------------------------------------------------

describe('one event carrying the entire fixture bag leaks nothing', () => {
  it('every documented denied key + shape value, on every level, leaks zero values', () => {
    const fixture = makeSecretFixture();
    const everyKey: Record<string, string> = {
      password: fixture.password,
      passwd: fixture.passwd,
      token: fixture.token,
      access_token: fixture.accessToken,
      refresh_token: fixture.refreshToken,
      bearer_token: fixture.bearerToken,
      authorization: fixture.authorization,
      auth: fixture.auth,
      cookie: fixture.cookie,
      'set-cookie': fixture.setCookie,
      secret: fixture.secret,
      api_key: fixture.apiKey,
      session_id: fixture.sessionId,
      sid: fixture.sid,
      ssn: fixture.ssn,
      credit_card: fixture.creditCard,
      cardNumber: fixture.cardNumber,
      cvv: fixture.cvv,
      // JWT under a non-denied key — shape rule masks it.
      claim_jwt: fixture.jwt,
    };

    const log = createLogger();
    log.debug('every-secret-debug', everyKey);
    log.info('every-secret-info', everyKey);
    log.warn('every-secret-warn', everyKey);
    log.error('every-secret-error', everyKey, new Error(fixture.bearerToken));

    expect(capture.calls).toHaveLength(4);
    for (const event of capture.calls) {
      expect(findLeaks(event)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// LevelFilter: dropped events leak nothing to transports
// ---------------------------------------------------------------------------

describe('LevelFilter: dropped events never reach a transport (so they cannot leak)', () => {
  it('a debug emission at level=warn never reaches the transport even when carrying every fixture', () => {
    const fixture = makeSecretFixture();
    configureLogging({
      application: APP,
      environment: 'production',
      level: 'warn',
      transports: [capture],
    });
    const log = createLogger();
    log.debug('filtered-debug', { password: fixture.password });
    log.info('filtered-info', { token: fixture.token });
    // Neither makes it through the level filter — no transport call,
    // therefore no leak channel.
    expect(capture.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Federated-style scenario: many module loggers, one host runtime,
// no leaks anywhere
// ---------------------------------------------------------------------------

describe('federated scenario: many module loggers share one runtime; no module leaks via a sibling transport', () => {
  it('20 module loggers, each emitting events with secrets, deliver only masked values to all transports', () => {
    const fixture = makeSecretFixture();
    const t1 = makeCapturingTransport('module-transport-1');
    const t2 = makeCapturingTransport('module-transport-2');
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [t1, t2],
    });

    for (let i = 0; i < 20; i++) {
      const mod = createLogger({
        module: { name: `mod-${String(i)}`, version: '1.0.0' },
        context: { attributes: { idx: i } },
      });
      mod.info(`module-${String(i)}-event`, {
        password: fixture.password,
        api_key: fixture.apiKey,
        callback_url: `https://mod-${String(i)}.example.com/cb?token=${fixture.token}`,
      });
    }

    expect(t1.calls).toHaveLength(20);
    expect(t2.calls).toHaveLength(20);

    const leakReport = findLeaksAcrossTransports([t1, t2]);
    expect(leakReport).toEqual([]);

    // Spot-check: module context is attached, attributes are masked.
    for (const t of [t1, t2] as const) {
      for (let i = 0; i < 20; i++) {
        const event = t.calls[i]!;
        expect(event.context.module?.name).toBe(`mod-${String(i)}`);
        expect(event.attributes.password).toBe('[REDACTED]');
        expect(event.attributes.api_key).toBe('[REDACTED]');
        expect(event.attributes.callback_url).toBe(
          `https://mod-${String(i)}.example.com/cb?token=%5BREDACTED%5D`,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Failing transport sibling: a throwing transport does not cause a leak
// path through `onInternalError`
// ---------------------------------------------------------------------------

describe('failure-isolated fan-out: a throwing transport sibling does not leak a fixture value through the error sink', () => {
  it('onInternalError notice text does not contain any fixture value', () => {
    const fixture = makeSecretFixture();
    const internalErrors: Error[] = [];
    const thrower: Transport = {
      name: 'throwing-on-secret',
      send(_event: LogEvent) {
        throw new Error(`transport explosion handling ${_event.message}`);
      },
    };
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [thrower, capture],
      onInternalError: (err) => {
        internalErrors.push(err);
      },
    });
    const log = createLogger();
    log.info('emit-with-secret', {
      password: fixture.password,
      authorization: fixture.authorization,
    });

    // Capture transport saw the masked event.
    expect(capture.calls).toHaveLength(1);
    expect(findLeaks(capture.calls[0]!)).toEqual([]);

    // The internal-error sink fired once (per-transport notice
    // budget). The notice text must not contain a raw fixture
    // value either: the thrown error's `message` is constructed by
    // the test from `_event.message`, which the redactor has
    // already masked.
    expect(internalErrors.length).toBeGreaterThanOrEqual(1);
    for (const e of internalErrors) {
      for (const v of FIXTURE_VALUES) {
        expect(e.message.includes(v), `internal error notice leaked ${v}`).toBe(
          false,
        );
      }
    }
  });
});
