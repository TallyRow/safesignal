/**
 * Security contract test for `assertTransportContract` (T-S1..T-S5
 * from `contracts/transport.md`).
 *
 * Drives the published helper from `src/testing/` against:
 *   (a) a good beacon-style transport using `navigator.sendBeacon` with
 *       a JSON `Blob` (must PASS — no leak in URLs, body-only delivery,
 *       no mutation, idempotent flush/shutdown)
 *   (b) a good fetch-style transport using POST with a JSON body to an
 *       HTTPS URL (must PASS — same properties via the other transport
 *       shape)
 *   (c) a deliberately bad URL-based transport that pushes event data
 *       through `fetch('https://x/log?evt=<encoded event>')` (must FAIL
 *       with a T-S1 diagnostic)
 *   (d) a deliberately bad GET-method transport that uses the request
 *       body for nothing (must FAIL with a T-S2 diagnostic)
 *   (e) a deliberately bad plain-HTTP transport (must FAIL with a T-S3
 *       diagnostic)
 *   (f) a deliberately bad mutating transport (must FAIL with a T-S4
 *       diagnostic)
 *   (g) a deliberately bad transport whose `flush()` throws on a
 *       repeated call (must FAIL with a T-S5 diagnostic)
 *
 * The `assertTransportContract` helper installs a fetch/sendBeacon
 * interceptor for the duration of each assertion, so the bad
 * transports' calls never leave the runtime — verified indirectly by
 * the absence of network egress: the test's `fetchCallSites` set is
 * populated only by the interceptor, never by the original `fetch`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogEvent, Transport } from '../../src/index.js';
import {
  assertTransportContract,
  FIXTURE_VALUES,
} from '../../src/testing/index.js';

describe('Transport security contract via assertTransportContract', () => {
  // Belt-and-braces leak guard. `assertTransportContract` patches and
  // restores `fetch` / `sendBeacon` inside its own try/finally, but if
  // a future helper change ever lets a real network call through, the
  // spies installed in beforeEach will record it and the assertion in
  // afterEach catches the leak. This also pins the contract that the
  // bad transports below never actually reach the network.
  const realFetch = vi.fn(() => Promise.resolve(new Response('', { status: 204 })));
  const realSendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(
    () => true,
  );

  beforeEach(() => {
    realFetch.mockClear();
    realSendBeacon.mockClear();
    globalThis.fetch = realFetch as unknown as typeof fetch;
    if (globalThis.navigator !== undefined) {
      globalThis.navigator.sendBeacon =
        realSendBeacon as unknown as Navigator['sendBeacon'];
    }
  });

  afterEach(() => {
    // Nothing observed at this layer means the helper's interceptor
    // owned every transport call, as intended.
    expect(realFetch).not.toHaveBeenCalled();
    expect(realSendBeacon).not.toHaveBeenCalled();
  });

  describe('PASS: good consumer transports', () => {
    it('beacon-style: sendBeacon(url, Blob([JSON])) passes T-S1..T-S5', async () => {
      const transport = makeBeaconTransport();
      await expect(assertTransportContract(transport)).resolves.toBeUndefined();
    });

    it('fetch-style: POST https://… with JSON body passes T-S1..T-S5', async () => {
      const transport = makeFetchPostTransport();
      await expect(assertTransportContract(transport)).resolves.toBeUndefined();
    });

    it('relative-URL fetch: POST /log with JSON body passes T-S1..T-S3', async () => {
      // Same-origin (relative URL) inherits the page's scheme — T-S3
      // explicitly skips the HTTPS check for relative URLs.
      const transport: Transport = {
        name: 'relative-fetch',
        send(event) {
          void fetch('/log', {
            method: 'POST',
            body: JSON.stringify(event),
            headers: { 'content-type': 'application/json' },
          });
        },
      };
      await expect(assertTransportContract(transport)).resolves.toBeUndefined();
    });
  });

  describe('FAIL: URL-based delivery (T-S1)', () => {
    it('event data in the query string fails with a T-S1 diagnostic', async () => {
      const transport: Transport = {
        name: 'url-leak',
        send(event) {
          // Classic anti-pattern: shove the whole event into a query
          // string. The fixture values inside event.attributes appear
          // verbatim in the captured URL, which is exactly what T-S1
          // is designed to catch.
          const encoded = encodeURIComponent(JSON.stringify(event));
          void fetch(`https://example.invalid/log?evt=${encoded}`, {
            method: 'GET',
          });
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /T-S1 violation/,
      );
    });

    it('probe-message in URL fails with a T-S1 diagnostic', async () => {
      // Even without fixture attribute values, the probe message
      // itself appearing in the URL is treated as event-content leak.
      const transport: Transport = {
        name: 'probe-leak',
        send(event) {
          // Put the (already-canonical) message directly into the URL.
          void fetch(`https://example.invalid/${encodeURIComponent(event.message)}`, {
            method: 'POST',
            body: '{}',
            headers: { 'content-type': 'application/json' },
          });
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /probe event message/,
      );
    });
  });

  describe('FAIL: non-body delivery (T-S2)', () => {
    it('GET method (no body) fails with a T-S2 diagnostic', async () => {
      const transport: Transport = {
        name: 'get-no-body',
        send(_event) {
          void fetch('https://example.invalid/log', { method: 'GET' });
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /POST\/PUT\/PATCH with body \(T-S2\)/,
      );
    });

    it('POST without a body fails with a T-S2 diagnostic', async () => {
      const transport: Transport = {
        name: 'post-no-body',
        send(_event) {
          void fetch('https://example.invalid/log', { method: 'POST' });
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /no body/,
      );
    });
  });

  describe('FAIL: insecure scheme (T-S3)', () => {
    it('http:// absolute URL fails with a T-S3 diagnostic', async () => {
      const transport: Transport = {
        name: 'plain-http',
        send(event) {
          void fetch('http://example.invalid/log', {
            method: 'POST',
            body: JSON.stringify(event),
            headers: { 'content-type': 'application/json' },
          });
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /T-S3/,
      );
    });
  });

  describe('FAIL: event mutation (T-S4)', () => {
    it('a transport that mutates event.attributes fails with a T-S4 diagnostic', async () => {
      const transport: Transport = {
        name: 'mutator',
        send(event) {
          // Direct mutation. The helper records JSON before/after and
          // diffs them — even subtle additions are caught.
          (event.attributes as Record<string, unknown>)['leaked'] = 'true';
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /T-S4 violation/,
      );
    });
  });

  describe('FAIL: non-idempotent flush/shutdown (T-S5)', () => {
    it('flush() that throws on a repeated call fails with a T-S5 diagnostic', async () => {
      let calls = 0;
      const transport: Transport = {
        name: 'flush-once',
        send(_event) {
          // no-op
        },
        flush(): Promise<void> {
          calls++;
          if (calls > 1) {
            return Promise.reject(new Error('flush already called'));
          }
          return Promise.resolve();
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /flush\(\) is not idempotent/,
      );
    });

    it('shutdown() that throws on a repeated call fails with a T-S5 diagnostic', async () => {
      let calls = 0;
      const transport: Transport = {
        name: 'shutdown-once',
        send(_event) {
          // no-op
        },
        shutdown(): Promise<void> {
          calls++;
          if (calls > 1) {
            return Promise.reject(new Error('shutdown already called'));
          }
          return Promise.resolve();
        },
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /shutdown\(\) is not idempotent/,
      );
    });
  });

  describe('Negative API shape', () => {
    it('a transport missing send() fails with a structural diagnostic', async () => {
      const transport = {
        name: 'no-send',
      } as unknown as Transport;
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /transport\.send must be a function/,
      );
    });

    it('a transport with an empty name fails with a structural diagnostic', async () => {
      const transport: Transport = {
        name: '',
        send: () => undefined,
      };
      await expect(assertTransportContract(transport)).rejects.toThrow(
        /name must be a non-empty string/,
      );
    });
  });

  describe('FIXTURE_VALUES surface', () => {
    it('exposes a non-empty list of secret-shaped values for consumer scans', () => {
      expect(FIXTURE_VALUES.length).toBeGreaterThan(0);
      for (const value of FIXTURE_VALUES) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
      // At least one entry must be long enough to make an .includes()
      // scan meaningful — used by assertTransportContract's URL-leak
      // check. (Some fixtures like `cvv` are intentionally short to
      // mirror real CVV shape.)
      const longEnough = FIXTURE_VALUES.filter((v) => v.length >= 16);
      expect(longEnough.length).toBeGreaterThan(0);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// Sample-transport factories
// ──────────────────────────────────────────────────────────────────────

/**
 * Reference body-only transport using `navigator.sendBeacon` with a
 * JSON `Blob`. Mirrors the canonical sample documented in T029 and
 * used by `examples/host-app/`.
 */
function makeBeaconTransport(): Transport {
  return {
    name: 'good-beacon',
    send(event: LogEvent) {
      const body = new Blob([JSON.stringify(event)], {
        type: 'application/json',
      });
      // sendBeacon is body-only by spec — no params land in the URL.
      navigator.sendBeacon('https://logs.example.com/ingest', body);
    },
    async flush() {
      // No batching state to drain — sendBeacon delivers immediately.
    },
    async shutdown() {
      // No long-lived resources — idempotent by construction.
    },
  };
}

/**
 * Reference body-only transport using `fetch` with `POST` and a JSON
 * body to an HTTPS endpoint. Acceptable substitute when `sendBeacon`
 * is unavailable.
 */
function makeFetchPostTransport(): Transport {
  return {
    name: 'good-fetch-post',
    send(event: LogEvent) {
      void fetch('https://logs.example.com/ingest', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'content-type': 'application/json' },
        keepalive: true,
      });
    },
    async flush() {
      // No batching state.
    },
    async shutdown() {
      // No long-lived resources.
    },
  };
}
