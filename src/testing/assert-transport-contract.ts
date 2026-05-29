/**
 * `assertTransportContract(transport)` — runs the documented Transport
 * contract battery against a consumer-provided `Transport`. Throws on the
 * first violation with a clear diagnostic message.
 *
 * Covers `contracts/transport.md`:
 *   - Structural: `name: string`, `send(event)` exists
 *   - T-S1: no `LogEvent` data appears in any `fetch` URL or
 *     `navigator.sendBeacon` URL the transport produces
 *   - T-S2: cross-origin delivery uses request body (POST/PUT/PATCH JSON
 *     or a `sendBeacon` `Blob`) — never URL params
 *   - T-S3: any URL with a scheme uses `https:`
 *   - T-S4: the transport does NOT mutate the event it receives
 *   - T-S5: `flush()` and `shutdown()` are idempotent (safe to call > 1x)
 *
 * The helper temporarily monkey-patches `globalThis.fetch` and
 * `globalThis.navigator.sendBeacon` to capture invocations, then restores
 * the originals when each assertion completes — even on failure. Tests
 * can run multiple consumer transports in series safely.
 *
 * This module is reached only via the package's `./testing` subpath; the
 * runtime entry does NOT re-export it.
 */

import type { LogEvent, Transport } from '../api/types.js';
import { FIXTURE_VALUES, makeSecretFixture } from './secret-fixtures.js';

// ──────────────────────────────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────────────────────────────

/**
 * Run the full Transport contract battery against `transport`. Resolves
 * when all assertions pass; rejects with an `Error` carrying a
 * diagnostic message on the first failure.
 */
export async function assertTransportContract(
  transport: Transport,
): Promise<void> {
  assertStructural(transport);
  await assertSendDoesNotThrow(transport);
  await assertNoEventDataInURLs(transport);
  await assertBodyOnlyDelivery(transport);
  await assertHttpsForAbsoluteUrls(transport);
  await assertEventImmutability(transport);
  await assertFlushIdempotent(transport);
  await assertShutdownIdempotent(transport);
}

// ──────────────────────────────────────────────────────────────────────
// Individual assertions
// ──────────────────────────────────────────────────────────────────────

function assertStructural(transport: Transport): void {
  if (typeof transport !== 'object' || transport === null) {
    throw fail('transport must be an object');
  }
  if (typeof transport.name !== 'string' || transport.name.length === 0) {
    throw fail('transport.name must be a non-empty string');
  }
  if (typeof transport.send !== 'function') {
    throw fail('transport.send must be a function');
  }
}

async function assertSendDoesNotThrow(transport: Transport): Promise<void> {
  const event = makeProbeEvent();
  await withInterceptors(async () => {
    try {
      const result = transport.send(event);
      if (result instanceof Promise) {
        await result;
      }
    } catch (err) {
      throw fail(
        transport,
        'send() threw to the caller — should fail silently or be wrapped',
        err,
      );
    }
  });
}

async function assertNoEventDataInURLs(transport: Transport): Promise<void> {
  const event = makeProbeEvent({ attributes: makeSecretFixture() });
  await withInterceptors(async (captured) => {
    await invokeSendSafely(transport, event);

    for (const url of allUrls(captured)) {
      // 1. Any literal fixture value in the URL is a clear leak.
      const leakedValue = FIXTURE_VALUES.find((v) => url.includes(v));
      if (leakedValue !== undefined) {
        throw fail(
          transport,
          `URL contains a secret fixture value (T-S1 violation): ` +
            `url='${url}', leaked='${leakedValue}'`,
        );
      }
      // 2. The probe event's marker message in the URL also indicates
      //    a leak — the consumer encoded event content there.
      if (url.includes(PROBE_MESSAGE)) {
        throw fail(
          transport,
          `URL contains the probe event message (T-S1 violation): ` +
            `url='${url}'`,
        );
      }
    }
  });
}

async function assertBodyOnlyDelivery(transport: Transport): Promise<void> {
  const event = makeProbeEvent();
  await withInterceptors(async (captured) => {
    await invokeSendSafely(transport, event);

    for (const call of captured.fetchCalls) {
      const method = (call.init?.method ?? 'GET').toUpperCase();
      const allowedMethods = ['POST', 'PUT', 'PATCH'];
      if (!allowedMethods.includes(method)) {
        throw fail(
          transport,
          `fetch used HTTP method '${method}' for delivery — ` +
            `must use POST/PUT/PATCH with body (T-S2): url='${call.url}'`,
        );
      }
      if (call.init?.body === undefined || call.init.body === null) {
        throw fail(
          transport,
          `fetch was called with method='${method}' but no body — ` +
            `events must travel in the request body (T-S2): url='${call.url}'`,
        );
      }
    }

    for (const call of captured.beaconCalls) {
      if (call.data === null || call.data === undefined) {
        throw fail(
          transport,
          `navigator.sendBeacon was called without data — ` +
            `events must travel in the body (T-S2): url='${call.url}'`,
        );
      }
    }
  });
}

async function assertHttpsForAbsoluteUrls(transport: Transport): Promise<void> {
  const event = makeProbeEvent();
  await withInterceptors(async (captured) => {
    await invokeSendSafely(transport, event);

    for (const url of allUrls(captured)) {
      // Relative URLs are same-origin by definition and inherit the
      // page's scheme — skip them. Absolute URLs MUST be HTTPS.
      if (!isAbsoluteUrl(url)) continue;
      if (!url.toLowerCase().startsWith('https://')) {
        throw fail(
          transport,
          `cross-origin URL is not HTTPS (T-S3): url='${url}'`,
        );
      }
    }
  });
}

async function assertEventImmutability(transport: Transport): Promise<void> {
  const event = makeProbeEvent({ attributes: { mutateMe: 'before' } });
  const before = JSON.stringify(event);
  await withInterceptors(async () => {
    await invokeSendSafely(transport, event);
  });
  const after = JSON.stringify(event);
  if (before !== after) {
    throw fail(
      transport,
      `transport mutated the received event (T-S4 violation):\n` +
        `  before: ${before}\n  after:  ${after}`,
    );
  }
}

async function assertFlushIdempotent(transport: Transport): Promise<void> {
  if (typeof transport.flush !== 'function') return; // optional hook
  try {
    await transport.flush();
    await transport.flush();
    await transport.flush();
  } catch (err) {
    throw fail(
      transport,
      'flush() is not idempotent — repeated calls must each resolve (T-S5)',
      err,
    );
  }
}

async function assertShutdownIdempotent(transport: Transport): Promise<void> {
  if (typeof transport.shutdown !== 'function') return; // optional hook
  try {
    await transport.shutdown();
    await transport.shutdown();
    await transport.shutdown();
  } catch (err) {
    throw fail(
      transport,
      'shutdown() is not idempotent — repeated calls must each resolve (T-S5)',
      err,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// fetch / sendBeacon interceptor
// ──────────────────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface BeaconCall {
  url: string;
  data: BodyInit | null | undefined;
}

interface CapturedCalls {
  fetchCalls: FetchCall[];
  beaconCalls: BeaconCall[];
}

/**
 * Run `body` with `globalThis.fetch` and `navigator.sendBeacon` replaced
 * by capturing stubs. Restores originals on success and failure.
 */
async function withInterceptors(
  body: (captured: CapturedCalls) => Promise<void>,
): Promise<void> {
  const captured: CapturedCalls = { fetchCalls: [], beaconCalls: [] };

  const g = globalThis as unknown as {
    fetch?: typeof fetch;
    navigator?: { sendBeacon?: Navigator['sendBeacon'] };
  };

  const originalFetch = g.fetch;
  const originalBeacon = g.navigator?.sendBeacon?.bind(g.navigator);

  g.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = extractFetchUrl(input);
    captured.fetchCalls.push({ url, init });
    return new Response('', { status: 204 });
  };

  if (g.navigator !== undefined) {
    g.navigator.sendBeacon = (
      url: string | URL,
      data?: BodyInit | null,
    ): boolean => {
      captured.beaconCalls.push({
        url: typeof url === 'string' ? url : url.toString(),
        data,
      });
      return true;
    };
  }

  try {
    await body(captured);
  } finally {
    if (originalFetch === undefined) {
      delete g.fetch;
    } else {
      g.fetch = originalFetch;
    }
    if (g.navigator !== undefined) {
      if (originalBeacon === undefined) {
        delete g.navigator.sendBeacon;
      } else {
        g.navigator.sendBeacon = originalBeacon;
      }
    }
  }
}

function extractFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  // Request
  return input.url;
}

function allUrls(captured: CapturedCalls): string[] {
  return [
    ...captured.fetchCalls.map((c) => c.url),
    ...captured.beaconCalls.map((c) => c.url),
  ];
}

// ──────────────────────────────────────────────────────────────────────
// Probe event + helpers
// ──────────────────────────────────────────────────────────────────────

const PROBE_MESSAGE = 'FLSDK-transport-contract-probe-message';

function makeProbeEvent(overrides: Partial<LogEvent> = {}): LogEvent {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: PROBE_MESSAGE,
    attributes: {},
    context: {
      application: { name: 'transport-contract-probe' },
      environment: 'test',
    },
    ...overrides,
  };
}

async function invokeSendSafely(
  transport: Transport,
  event: LogEvent,
): Promise<void> {
  const result = transport.send(event);
  if (result instanceof Promise) {
    // Some intentionally-bad transports return rejected Promises; allow
    // the rejection to surface only as a contract-failure diagnostic,
    // not as an unhandled rejection in the test runner.
    await result.catch(() => undefined);
  }
}

function isAbsoluteUrl(url: string): boolean {
  // Match an URL scheme followed by `://` (http://, https://, ftp://, etc.)
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
}

function fail(...args: unknown[]): Error;
function fail(message: string): Error;
function fail(transport: Transport, message: string, cause?: unknown): Error;
function fail(...args: unknown[]): Error {
  let message: string;
  let cause: unknown;
  if (typeof args[0] === 'string') {
    message = `[assertTransportContract] ${args[0]}`;
  } else {
    const transport = args[0] as Transport;
    const msg = args[1] as string;
    cause = args[2];
    message = `[assertTransportContract] transport '${transport.name}': ${msg}`;
  }
  const err = new Error(message);
  if (cause !== undefined) {
    (err as Error & { cause?: unknown }).cause = cause;
  }
  return err;
}
