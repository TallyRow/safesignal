/**
 * T013 + T034 — End-to-end secret sweep for the beacon transport.
 *
 * Mirrors feature 001's
 * `tests/integration/secret-sweep.integration.test.ts` but observes
 * the wire via a test-double `sendBeacon` instead of an in-memory
 * `Transport`. The load-bearing assertion is:
 *
 *   Every body emitted by the beacon transport, scanned against the
 *   full FIXTURE_VALUES list, contains NONE of those values.
 *
 * Plus: every recorded URL is exactly the configured endpoint string
 * — no fixture value reaches a query parameter, fragment, or path
 * segment (FR-015, T-S1..T-S5).
 *
 * T034 expansion: the original T013 file had a latent bug — the
 * `recordedBodies()` helper read only `c.body` (the SYNC string
 * field), but the beacon transport always passes Blob bodies, so
 * `c.body === null` for every call and the for-of loops iterated
 * over empty arrays (vacuous pass). T034 reworks the helper to read
 * Blob bodies asynchronously via `c.blob?.text()`, then adds a
 * batching-mode describe block applying the same fixture sweep to
 * the `{ events: LogEvent[] }` envelopes.
 *
 * Locks SC-004 for BOTH default and batching modes.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  configureLogging,
  createLogger,
} from '../../src/index.js';
import { FIXTURE_VALUES, makeSecretFixture } from '../../src/testing/secret-fixtures.js';
import { createBeaconTransport } from '../../src/transport-beacon/index.js';
import {
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

const ENDPOINT = 'https://logs.example.com/ingest';

interface Harness {
  beacon: ReturnType<typeof installSendBeaconDouble>;
  fetch: ReturnType<typeof installFetchDouble>;
  notices: Error[];
}

let harness: Harness | null = null;

beforeEach(() => {
  harness = {
    beacon: installSendBeaconDouble({ returnValue: true }),
    fetch: installFetchDouble({ behavior: { kind: 'resolve', status: 204 } }),
    notices: [],
  };
});

afterEach(() => {
  harness?.beacon.uninstall();
  harness?.fetch.uninstall();
  harness = null;
});

/**
 * Read every recorded body as a string. The beacon transport passes
 * Blob bodies to sendBeacon (per D-4), so we await `blob.text()` for
 * each call; happy-dom has no sync Blob accessor.
 */
async function recordedBodies(): Promise<string[]> {
  if (harness === null) return [];
  const texts: string[] = [];
  for (const call of harness.beacon.calls) {
    if (typeof call.body === 'string') {
      texts.push(call.body);
    } else if (call.blob !== null) {
      texts.push(await call.blob.text());
    }
  }
  return texts;
}

function recordedUrls(): string[] {
  if (harness === null) return [];
  return harness.beacon.calls.map((c) => c.endpoint);
}

/**
 * Re-serialize a recorded body with `error.stack` (if present)
 * stripped from each event. Matches feature 001's `findLeaks`
 * convention from `tests/integration/secret-sweep.integration.test.ts`:
 * stack traces are debugging detail, NOT under the redactor's
 * scope, so fixture values that flow into Error messages (and
 * therefore into the stack's first line) are out-of-scope for the
 * secret-sweep contract. Consumers who put sensitive data into
 * Error messages own that decision.
 */
function withoutStacks(body: string): string {
  const parsed = JSON.parse(body) as Record<string, unknown>;
  const stripEvent = (ev: Record<string, unknown>): Record<string, unknown> => {
    if (ev.error !== undefined && ev.error !== null) {
      const e = ev.error as Record<string, unknown>;
      ev = { ...ev, error: { name: e.name, message: e.message } };
    }
    return ev;
  };
  if (Array.isArray(parsed.events)) {
    // Batched envelope: { events: LogEvent[] }
    parsed.events = (parsed.events as Array<Record<string, unknown>>).map(stripEvent);
  } else {
    Object.assign(parsed, stripEvent(parsed));
  }
  return JSON.stringify(parsed);
}

describe('transport-beacon end-to-end secret sweep', () => {
  it('emits 100+ events carrying every fixture value across attributes / message / context / error', () => {
    if (harness === null) throw new Error('harness not initialised');
    const onInternalError = (err: Error): void => {
      harness!.notices.push(err);
    };

    configureLogging({
      application: { name: 'secret-sweep-beacon', version: '2026.05' },
      environment: 'production',
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          onInternalError,
        }),
      ],
      onInternalError,
    });

    const logger = createLogger({ module: { name: 'sweep' } });
    const fixture = makeSecretFixture();

    // Emit 100+ events, varying which fixture slot the value lives in.
    let emitted = 0;
    for (let i = 0; i < 20; i += 1) {
      // Feature 001 convention: explicitly map fixture JS property
      // names to redactor-denylist-matching keys (e.g., setCookie →
      // 'set-cookie', apiKey → 'api_key'). The fixture object's
      // raw shape is consumer-friendly camelCase; the redactor's
      // denylist matches the wire-form kebab/snake_case.
      const fixtureAttrs = {
        password: fixture.password,
        token: fixture.token,
        accessToken: fixture.accessToken,
        refreshToken: fixture.refreshToken,
        bearerToken: fixture.bearerToken,
        authorization: fixture.authorization,
        auth: fixture.auth,
        cookie: fixture.cookie,
        'set-cookie': fixture.setCookie,
        secret: fixture.secret,
        api_key: fixture.apiKey,
        session_id: fixture.sessionId,
        sid: fixture.sid,
        jwt: fixture.jwt,
      };
      logger.warn(`event ${i}`, fixtureAttrs);
      logger.warn(`event ${i}`, { nested: fixtureAttrs });
      logger.error(`event ${i} error`, fixtureAttrs, new Error(fixture.bearerToken));
      logger.warn(`event ${i} url`, { url: `https://app.example.com/cb?token=${fixture.token}` });
      logger.warn(`event ${i}`, { ...fixtureAttrs, Authorization: fixture.bearerToken });
      emitted += 5;
    }
    expect(emitted).toBeGreaterThanOrEqual(100);
    expect(harness!.beacon.calls.length).toBeGreaterThanOrEqual(emitted);
  });

  it('zero fixture values reach the wire body', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT })],
    });
    const logger = createLogger();
    const fixture = makeSecretFixture();
    const fixtureAttrs = {
      password: fixture.password,
      token: fixture.token,
      accessToken: fixture.accessToken,
      refreshToken: fixture.refreshToken,
      bearerToken: fixture.bearerToken,
      authorization: fixture.authorization,
      auth: fixture.auth,
      cookie: fixture.cookie,
      'set-cookie': fixture.setCookie,
      secret: fixture.secret,
      api_key: fixture.apiKey,
      session_id: fixture.sessionId,
      sid: fixture.sid,
      jwt: fixture.jwt,
    };
    for (let i = 0; i < 20; i += 1) {
      logger.warn('sweep', fixtureAttrs);
      logger.error('sweep err', fixtureAttrs, new Error(fixture.bearerToken));
    }
    const bodies = await recordedBodies();
    // Sanity: we DID record bodies. Without this guard the per-fixture
    // assertion below could pass vacuously.
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const safe = withoutStacks(body);
      for (const fv of FIXTURE_VALUES) {
        expect(safe.includes(fv), `fixture value '${fv}' leaked in body: ${safe}`).toBe(false);
      }
    }
  });

  it('zero fixture values reach the wire URL (T-S1..T-S5)', () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT })],
    });
    const logger = createLogger();
    const fixture = makeSecretFixture();
    for (let i = 0; i < 20; i += 1) {
      logger.warn('sweep', fixture);
    }
    for (const url of recordedUrls()) {
      expect(url).toBe(ENDPOINT); // exact match — no query, no fragment, no path mutation
      for (const fv of FIXTURE_VALUES) {
        expect(url.includes(fv), `fixture value '${fv}' leaked in URL: ${url}`).toBe(false);
      }
    }
  });

  it('every recorded body parses as a JSON LogEvent', async () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT })],
    });
    const logger = createLogger();
    logger.warn('event', { a: 1 });
    const bodies = await recordedBodies();
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('attributes');
      expect(parsed).toHaveProperty('context');
    }
  });
});

// ---------------------------------------------------------------------------
// T034 — Batching-mode secret sweep (SC-004 expansion)
// ---------------------------------------------------------------------------

describe('transport-beacon end-to-end secret sweep (batching mode)', () => {
  it('100+ events with fixture values across slots → zero leak in any batch envelope', async () => {
    if (harness === null) throw new Error('harness not initialised');
    // Batching: maxBatchSize 10 → 100 events produce 10 envelopes.
    configureLogging({
      application: { name: 'secret-sweep-batched' },
      environment: 'production',
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 10 },
        }),
      ],
    });
    const logger = createLogger({ module: { name: 'sweep' } });
    const fixture = makeSecretFixture();
    const fixtureAttrs = {
      password: fixture.password,
      token: fixture.token,
      accessToken: fixture.accessToken,
      refreshToken: fixture.refreshToken,
      bearerToken: fixture.bearerToken,
      authorization: fixture.authorization,
      auth: fixture.auth,
      cookie: fixture.cookie,
      'set-cookie': fixture.setCookie,
      secret: fixture.secret,
      api_key: fixture.apiKey,
      session_id: fixture.sessionId,
      sid: fixture.sid,
      jwt: fixture.jwt,
    };

    let emitted = 0;
    for (let i = 0; i < 20; i += 1) {
      logger.warn(`batched event ${i}`, fixtureAttrs);
      logger.warn(`nested ${i}`, { nested: fixtureAttrs });
      logger.error(`err ${i}`, fixtureAttrs, new Error(fixture.bearerToken));
      logger.warn(`url ${i}`, {
        url: `https://app.example.com/cb?token=${fixture.token}`,
      });
      logger.warn(`auth-like ${i}`, { ...fixtureAttrs, Authorization: fixture.bearerToken });
      emitted += 5;
    }
    expect(emitted).toBeGreaterThanOrEqual(100);

    // 100 events / maxBatchSize 10 = 10 envelopes.
    expect(harness.beacon.calls.length).toBe(10);

    const bodies = await recordedBodies();
    expect(bodies.length).toBe(10);

    // Each body is an envelope: { events: LogEvent[] }
    for (const body of bodies) {
      const parsed = JSON.parse(body) as { events: unknown[] };
      expect(parsed).toHaveProperty('events');
      expect(parsed.events.length).toBe(10);
      // Scan the envelope with error.stack stripped per feature 001's
      // findLeaks convention (stacks are out of redactor scope).
      const safe = withoutStacks(body);
      for (const fv of FIXTURE_VALUES) {
        expect(
          safe.includes(fv),
          `fixture value '${fv}' leaked in batched envelope: ${safe}`,
        ).toBe(false);
      }
    }
  });

  it('zero fixture values reach the wire URL even in batched mode (T-S1..T-S5)', () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [
        createBeaconTransport({
          endpoint: ENDPOINT,
          batching: { maxBatchSize: 10 },
        }),
      ],
    });
    const logger = createLogger();
    const fixture = makeSecretFixture();
    const fixtureAttrs = {
      password: fixture.password,
      token: fixture.token,
      'set-cookie': fixture.setCookie,
      api_key: fixture.apiKey,
      jwt: fixture.jwt,
    };
    for (let i = 0; i < 20; i += 1) logger.warn('sweep', fixtureAttrs);
    for (const url of recordedUrls()) {
      expect(url).toBe(ENDPOINT);
      for (const fv of FIXTURE_VALUES) {
        expect(url.includes(fv), `fixture value '${fv}' leaked in URL: ${url}`).toBe(false);
      }
    }
  });
});
