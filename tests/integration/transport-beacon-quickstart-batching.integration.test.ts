/**
 * T029 [US3] — Scripted quickstart-batching drift guard and runtime
 * smoke.
 *
 * Mirrors T019's pattern for the "Opt-in batching" section of
 * `specs/002-beacon-transport/quickstart.md`. Two `it` blocks:
 *
 *   (1) Drift guard — extracts the code block under
 *       "## Opt-in batching (high-volume telemetry)" from
 *       quickstart.md and asserts it matches
 *       `EMBEDDED_QUICKSTART_BATCHING_CODE` line-for-line. Any future
 *       edit to either side fails the test until both are
 *       re-synchronised.
 *
 *   (2) Runtime smoke — wraps the literal factory call from the
 *       quickstart in `configureLogging({...})`, emits 50 events,
 *       and asserts exactly one beacon call carrying the documented
 *       `{ events: LogEvent[] }` envelope shape.
 *
 * Locks SC-001 (the batching variant), SC-003 (the
 * assertTransportContract contract — already locked by TB-7 in the
 * contract file, but exercised end-to-end here), and SC-009 (the
 * "one drop notice per dropped batch" guarantee is exercised
 * separately by T025's B-9/B-10/F-8 cases; this file just runs the
 * happy path).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NoopTransport, configureLogging, createLogger } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

import {
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

// ---------------------------------------------------------------------------
// The literal "Opt-in batching" code block, embedded line-for-line.
// ---------------------------------------------------------------------------

const EMBEDDED_QUICKSTART_BATCHING_CODE = `createBeaconTransport({
  endpoint: 'https://logs.example.com/ingest',
  batching: {
    maxBatchSize: 50,        // flush when 50 events accumulate
    maxBatchAgeMs: 10_000,   // ...or after 10 seconds, whichever first
  },
});`;

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

function extractBatchingBlock(): string {
  const path = resolve(process.cwd(), 'specs/002-beacon-transport/quickstart.md');
  const md = readFileSync(path, 'utf8');
  const sectionIdx = md.indexOf('## Opt-in batching');
  if (sectionIdx === -1) {
    throw new Error(`quickstart.md: '## Opt-in batching' section not found`);
  }
  const fenceStart = md.indexOf('```ts', sectionIdx);
  if (fenceStart === -1) {
    throw new Error(`quickstart.md: code fence start not found after section header`);
  }
  const bodyStart = fenceStart + '```ts\n'.length;
  const fenceEnd = md.indexOf('\n```', bodyStart);
  if (fenceEnd === -1) {
    throw new Error(`quickstart.md: code fence end not found`);
  }
  return md.slice(bodyStart, fenceEnd);
}

describe('quickstart batching drift guard', () => {
  it('embedded code matches `specs/002-beacon-transport/quickstart.md` line-for-line', () => {
    expect(extractBatchingBlock()).toBe(EMBEDDED_QUICKSTART_BATCHING_CODE);
  });
});

// ---------------------------------------------------------------------------
// Runtime smoke
// ---------------------------------------------------------------------------

interface Harness {
  beacon: ReturnType<typeof installSendBeaconDouble>;
  fetch: ReturnType<typeof installFetchDouble>;
}

let harness: Harness | null = null;

beforeEach(() => {
  harness = {
    beacon: installSendBeaconDouble({ returnValue: true }),
    fetch: installFetchDouble({ behavior: { kind: 'resolve', status: 204 } }),
  };
});

afterEach(() => {
  // Reset the runtime BEFORE uninstalling the doubles so that any
  // buffered batch from a partial-flush test gets drained through
  // the test doubles (sendBeacon double returns true; no real
  // network), not through a real `fetch` against
  // `logs.example.com` that would surface as an unhandled
  // rejection during the next test file's setup.
  configureLogging({ transports: [NoopTransport] });
  harness?.beacon.uninstall();
  harness?.fetch.uninstall();
  harness = null;
});

describe('quickstart batching runtime smoke', () => {
  it('50 events trigger exactly 1 batched flush with the documented envelope shape', async () => {
    if (harness === null) throw new Error('harness not initialised');

    // -------- BEGIN copy of the quickstart code (drift-guarded above) --------
    const transport = createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      batching: {
        maxBatchSize: 50, // flush when 50 events accumulate
        maxBatchAgeMs: 10_000, // ...or after 10 seconds, whichever first
      },
    });
    // -------- END copy of the quickstart code --------

    configureLogging({
      application: { name: 'high-volume-app', version: '1.0.0' },
      environment: 'production',
      transports: [transport],
    });
    const logger = createLogger();
    for (let i = 0; i < 50; i += 1) {
      logger.warn(`event ${i}`, { seq: i });
    }

    // 50 events × maxBatchSize 50 → exactly 1 flush. The age timer
    // (10s) does NOT fire — the size threshold beats it.
    expect(harness.beacon.calls.length).toBe(1);
    const call = harness.beacon.calls[0];
    expect(call?.endpoint).toBe('https://logs.example.com/ingest');
    expect(call?.bodyType).toBe('application/json');
    expect(call?.blob).toBeInstanceOf(Blob);

    const bodyText = await call?.blob?.text();
    if (bodyText === undefined) throw new Error('expected Blob body');
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;

    // Envelope shape: exactly { events: [...] } with no extra fields.
    expect(Object.keys(parsed).sort()).toEqual(['events']);
    const events = parsed.events as Array<{ message: string; attributes: { seq: number } }>;
    expect(events.length).toBe(50);

    // Order preserved (B-4): seq 0..49 in order.
    for (let i = 0; i < 50; i += 1) {
      expect(events[i]?.attributes.seq).toBe(i);
    }

    // No fetch fallback needed — sendBeacon accepted the first attempt.
    expect(harness.fetch.calls.length).toBe(0);
  });

  it('a partial batch (below maxBatchSize) is not flushed without an age or pagehide trigger', () => {
    if (harness === null) throw new Error('harness not initialised');

    const transport = createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
      batching: {
        maxBatchSize: 50,
        // No maxBatchAgeMs — no age trigger to race against.
      },
    });
    configureLogging({
      application: { name: 'partial-app' },
      environment: 'production',
      transports: [transport],
    });
    const logger = createLogger();
    for (let i = 0; i < 25; i += 1) logger.warn(`event ${i}`);

    // 25 < 50 → no flush.
    expect(harness.beacon.calls.length).toBe(0);
  });
});
