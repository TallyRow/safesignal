/**
 * T013 — End-to-end secret sweep for the beacon transport.
 *
 * Mirrors feature 001's
 * `tests/integration/secret-sweep.integration.test.ts` but observes
 * the wire via a test-double `sendBeacon` instead of an in-memory
 * `Transport`. The assertion is the same load-bearing one:
 *
 *   Every body emitted by the beacon transport, scanned against the
 *   full FIXTURE_VALUES list, contains NONE of those values.
 *
 * Plus: every recorded URL is exactly the configured endpoint string
 * — no fixture value reaches a query parameter, fragment, or path
 * segment (FR-015, T-S1..T-S5).
 *
 * Status: every `it` block is encoded with the FULL test body but
 * marked `.skip` until T016 wires `createBeaconTransport` into the
 * default-mode delivery path. To unlock this suite, remove the four
 * `.skip` annotations and re-run.
 *
 * Locks SC-004, FR-025.
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

function recordedBodies(): string[] {
  if (harness === null) return [];
  return harness.beacon.calls
    .map((c) => c.body)
    .filter((b): b is string => typeof b === 'string');
}

function recordedUrls(): string[] {
  if (harness === null) return [];
  return harness.beacon.calls.map((c) => c.endpoint);
}

describe.skip('transport-beacon end-to-end secret sweep (unlocks at T016)', () => {
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
      logger.warn(`event ${i}`, fixture);
      logger.warn(`event ${i}`, { nested: fixture });
      logger.error(`event ${i} error`, fixture, new Error('boom'));
      logger.warn(`event ${i} url`, { url: `https://app.example.com/cb?token=${fixture.token ?? ''}` });
      logger.warn(`event ${i}`, { ...fixture, ['Authorization']: fixture.token ?? '' });
      emitted += 5;
    }
    expect(emitted).toBeGreaterThanOrEqual(100);
    expect(harness!.beacon.calls.length).toBeGreaterThanOrEqual(emitted);
  });

  it('zero fixture values reach the wire body', () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT })],
    });
    const logger = createLogger();
    const fixture = makeSecretFixture();
    for (let i = 0; i < 20; i += 1) {
      logger.warn('sweep', fixture);
      logger.error('sweep err', fixture, new Error(`boom ${fixture.token}`));
    }
    for (const body of recordedBodies()) {
      for (const fv of FIXTURE_VALUES) {
        expect(body.includes(fv), `fixture value '${fv}' leaked in body: ${body}`).toBe(false);
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

  it('every recorded body parses as a JSON LogEvent', () => {
    if (harness === null) throw new Error('harness not initialised');
    configureLogging({
      transports: [createBeaconTransport({ endpoint: ENDPOINT })],
    });
    const logger = createLogger();
    logger.warn('event', { a: 1 });
    for (const body of recordedBodies()) {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      expect(parsed).toHaveProperty('level');
      expect(parsed).toHaveProperty('message');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('attributes');
      expect(parsed).toHaveProperty('context');
    }
  });
});
