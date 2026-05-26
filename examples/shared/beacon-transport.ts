/**
 * Canonical body-only beacon transport, shared by `examples/host-app/`
 * (today) and `examples/federated-module/` (T056). The file lives in
 * `examples/shared/` so both projects can reference the same
 * implementation without duplicating the safe-delivery pattern.
 *
 * Why this exact shape:
 *   - The Transport security contract (`contracts/transport.md`
 *     T-S1..T-S5) requires body-only delivery — event data MUST NOT
 *     appear in URL paths, query strings, or fragments.
 *   - `navigator.sendBeacon(url, blob)` is the right primitive on
 *     browsers because it survives page unload and is body-only by
 *     spec.
 *   - When `sendBeacon` is unavailable (older browser, hostile env),
 *     fall back to `fetch(url, { method: 'POST', keepalive: true })`
 *     with a JSON body.
 *   - HTTPS is required for cross-origin delivery (T-S3). Same-origin
 *     relative URLs are allowed and inherit the page's scheme.
 *
 * What this transport does NOT do (these belong in a production-grade
 * transport you build yourself — the package intentionally ships only
 * the contract, not an HTTP/beacon transport in v1):
 *   - Batching, retry, backoff, jitter.
 *   - Compression.
 *   - Auth header injection (do that in your build / runtime config,
 *     never via URL query params).
 *   - Sampling or deduplication.
 *
 * Verify your own customizations with `assertTransportContract` from
 * the package's `./testing` subpath:
 *
 *   ```ts
 *   import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
 *   import { makeBeaconTransport } from '../shared/beacon-transport.js';
 *
 *   await assertTransportContract(makeBeaconTransport({
 *     endpoint: 'https://logs.example.com/ingest',
 *   }));
 *   ```
 */

import type { LogEvent, Transport } from '@your-org/frontend-logging-sdk';

export interface BeaconTransportOptions {
  /**
   * Absolute or same-origin URL. Cross-origin URLs MUST use `https://`
   * (T-S3). Same-origin relative URLs like `/log` are allowed and
   * inherit the page's scheme.
   */
  endpoint: string;
  /**
   * Optional transport name override for diagnostics. Defaults to
   * `'beacon'` so a misbehaving instance is easy to identify in the
   * `onInternalError` notice.
   */
  name?: string;
}

/**
 * Build a body-only beacon transport. Tries `navigator.sendBeacon`
 * first (best behavior on page unload), then falls back to
 * `fetch(POST, keepalive: true)` with a JSON body. Both paths put
 * the event in the body — never in the URL.
 *
 * The factory returns a `Transport` (not a TransportFactory); pass it
 * directly to `configureLogging({ transports: [...] })`.
 */
export function makeBeaconTransport(
  options: BeaconTransportOptions,
): Transport {
  const { endpoint, name = 'beacon' } = options;

  if (isCrossOriginNonHttps(endpoint)) {
    throw new Error(
      `beacon transport: cross-origin endpoint must use https:// — got '${endpoint}'`,
    );
  }

  return {
    name,
    send(event: LogEvent): void {
      // JSON-serialize the already-sanitized LogEvent. The package
      // pipeline (Sanitize → URLScrub → Redact → ControlCharGuard →
      // Freeze) has already run by the time this method is called.
      const payload = JSON.stringify(event);

      // Prefer sendBeacon: body-only by spec, survives page unload.
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        const blob = new Blob([payload], { type: 'application/json' });
        const ok = navigator.sendBeacon(endpoint, blob);
        if (ok) return;
        // sendBeacon returned false (queue full or browser refused) —
        // fall through to fetch keepalive below.
      }

      // Fallback: fetch with POST + keepalive. Still body-only.
      if (typeof fetch === 'function') {
        // Fire-and-forget; the package's SafeTransport wrapper isolates
        // any rejected Promise so we don't have to catch here.
        void fetch(endpoint, {
          method: 'POST',
          body: payload,
          headers: { 'content-type': 'application/json' },
          // keepalive lets the request outlive the page unload event.
          keepalive: true,
          // Don't send cookies or auth headers cross-origin by
          // default — your real transport should set this explicitly.
          credentials: 'same-origin',
        });
      }
      // If neither sendBeacon nor fetch is available, drop the event
      // silently. The hard invariant is "emission never throws"; the
      // package's SafeTransport would catch a throw anyway.
    },

    // sendBeacon delivers immediately; fetch keepalive is also fire-
    // and-forget. There's no batching state, so flush() / shutdown()
    // are no-ops — and idempotent by construction (T-S5).
    async flush(): Promise<void> {
      // Nothing to drain.
    },
    async shutdown(): Promise<void> {
      // Nothing to release.
    },
  };
}

/**
 * Return `true` when `endpoint` is an absolute URL that uses anything
 * other than `https:`. Same-origin relative URLs and `https://` URLs
 * pass.
 */
function isCrossOriginNonHttps(endpoint: string): boolean {
  // Absolute? Must look like `<scheme>://...`
  const match = /^([a-z][a-z0-9+.-]*):\/\//i.exec(endpoint);
  if (match === null) return false; // relative — same-origin, OK
  const scheme = match[1]?.toLowerCase();
  return scheme !== 'https';
}
