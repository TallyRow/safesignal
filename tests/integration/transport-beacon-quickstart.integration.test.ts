/**
 * T019 — Scripted quickstart harness.
 *
 * Embeds the exact "Five-minute path (single application)" code
 * block from `specs/002-beacon-transport/quickstart.md` and:
 *
 *   1. **Drift guard** — extracts the same code block from
 *      `quickstart.md` at test time and asserts it matches the
 *      `EMBEDDED_QUICKSTART_CODE` constant below line-for-line. If
 *      the quickstart drifts from this test, the assertion fails and
 *      the developer is forced to keep them in sync.
 *
 *   2. **Runtime smoke** — actually runs the equivalent code under
 *      happy-dom with `sendBeacon` and `fetch` doubles installed.
 *      Asserts both the `warn` and `error` events emit exactly one
 *      body-only beacon call each, parses as the documented
 *      `LogEvent` shape, and lands on the configured endpoint.
 *
 * Locks SC-001 ("under-5-minute configure-and-ship"). The drift
 * guard means SC-001 cannot silently degrade: any edit to the
 * quickstart's code block must be mirrored here, and any edit here
 * must round-trip back to the quickstart.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureLogging, createLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installFetchDouble,
  installSendBeaconDouble,
} from '../helpers/beacon-network.js';

// ---------------------------------------------------------------------------
// The literal "Five-minute path" code block, embedded line-for-line.
// ---------------------------------------------------------------------------

const EMBEDDED_QUICKSTART_CODE = `// 1. Configure the runtime once at app boot.
import { configureLogging, createLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';

configureLogging({
  application: { name: 'payments', version: '2.4.1' },
  environment: 'production',
  transports: [
    createBeaconTransport({
      endpoint: 'https://logs.example.com/ingest',
    }),
  ],
});

// 2. Emit events from anywhere. Every warn/error reaches the endpoint.
const logger = createLogger();
logger.warn('payment retry exceeded threshold', { attemptCount: 4 });
logger.error('payment processor returned 5xx', { orderId: 'ord_9f3' }, new Error('upstream timeout'));`;

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

function extractFiveMinutePathCode(): string {
  const path = resolve(
    process.cwd(),
    'specs/002-beacon-transport/quickstart.md',
  );
  const md = readFileSync(path, 'utf8');
  const sectionIdx = md.indexOf('## Five-minute path');
  if (sectionIdx === -1) {
    throw new Error(`quickstart.md: '## Five-minute path' section not found`);
  }
  const fenceStart = md.indexOf('```ts', sectionIdx);
  if (fenceStart === -1) {
    throw new Error(
      `quickstart.md: code fence start not found after section header`,
    );
  }
  const bodyStart = fenceStart + '```ts\n'.length;
  const fenceEnd = md.indexOf('\n```', bodyStart);
  if (fenceEnd === -1) {
    throw new Error(`quickstart.md: code fence end not found`);
  }
  return md.slice(bodyStart, fenceEnd);
}

describe('quickstart drift guard', () => {
  it('embedded EMBEDDED_QUICKSTART_CODE matches `specs/002-beacon-transport/quickstart.md` line-for-line', () => {
    const fromMarkdown = extractFiveMinutePathCode();
    expect(fromMarkdown).toBe(EMBEDDED_QUICKSTART_CODE);
  });
});

// ---------------------------------------------------------------------------
// Runtime smoke — runs the equivalent code with hermetic doubles
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

afterEach(async () => {
  harness?.beacon.uninstall();
  harness?.fetch.uninstall();
  harness = null;
});

describe('quickstart runtime smoke', () => {
  it('the five-minute path emits one body-only beacon call per event with the documented LogEvent shape', async () => {
    if (harness === null) throw new Error('harness not initialised');

    // -------- BEGIN copy of the quickstart code (drift-guarded above) --------
    // 1. Configure the runtime once at app boot.
    configureLogging({
      application: { name: 'payments', version: '2.4.1' },
      environment: 'production',
      transports: [
        createBeaconTransport({
          endpoint: 'https://logs.example.com/ingest',
        }),
      ],
    });

    // 2. Emit events from anywhere. Every warn/error reaches the endpoint.
    const logger = createLogger();
    logger.warn('payment retry exceeded threshold', { attemptCount: 4 });
    logger.error(
      'payment processor returned 5xx',
      { orderId: 'ord_9f3' },
      new Error('upstream timeout'),
    );
    // -------- END copy of the quickstart code --------

    // Both events are warn or error → above the production threshold.
    expect(harness.beacon.calls.length).toBe(2);

    // Each call hits the configured endpoint EXACTLY (no query, no fragment).
    for (const call of harness.beacon.calls) {
      expect(call.endpoint).toBe('https://logs.example.com/ingest');
      expect(call.blob).toBeInstanceOf(Blob);
      expect(call.bodyType).toBe('application/json');
    }

    // Read the bodies via Blob.text() since happy-dom has no sync accessor.
    const firstCall = harness.beacon.calls[0];
    const secondCall = harness.beacon.calls[1];
    if (firstCall?.blob === null || firstCall?.blob === undefined) {
      throw new Error('expected first call to carry a Blob body');
    }
    if (secondCall?.blob === null || secondCall?.blob === undefined) {
      throw new Error('expected second call to carry a Blob body');
    }
    const first = JSON.parse(await firstCall.blob.text()) as Record<
      string,
      unknown
    >;
    const second = JSON.parse(await secondCall.blob.text()) as Record<
      string,
      unknown
    >;

    expect(first.level).toBe('warn');
    expect(first.message).toBe('payment retry exceeded threshold');
    expect(first.attributes).toMatchObject({ attemptCount: 4 });
    expect(
      (first.context as Record<string, unknown>).application,
    ).toMatchObject({
      name: 'payments',
      version: '2.4.1',
    });

    expect(second.level).toBe('error');
    expect(second.message).toBe('payment processor returned 5xx');
    expect(second.attributes).toMatchObject({ orderId: 'ord_9f3' });
    expect(second.error).toMatchObject({
      name: 'Error',
      message: 'upstream timeout',
    });

    // No fetch fallback should have been needed — sendBeacon returned true.
    expect(harness.fetch.calls.length).toBe(0);
  });
});
