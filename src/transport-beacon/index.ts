/**
 * Public entry of the `./transport-beacon` subpath
 * (`@your-org/frontend-logging-sdk/transport-beacon`).
 *
 * Exposes exactly two names — `createBeaconTransport` (factory) and
 * `BeaconTransportOptions` (options shape) — and nothing else. Locked by
 * TB-1 in `specs/002-beacon-transport/contracts/transport-beacon-public-api.md`.
 *
 * This file is the stub landed by T003. The factory throws on invocation
 * until T016 wires the default-mode implementation; subsequent tasks
 * (T027 + T028) layer the opt-in batching path on top. Tests written
 * before T016 will fail when they invoke `createBeaconTransport()` —
 * that is the TDD signal expected by Phase 3.
 *
 * Boundary discipline (TB-11): the only import permitted in this subpath
 * is `import type` from `../api/types.js`. No runtime imports from any
 * other source directory. No vendor-SDK imports.
 */

import type { LogEvent, Transport } from '../api/types.js';

// ---------------------------------------------------------------------------
// Public options shape
// ---------------------------------------------------------------------------

/**
 * Constructor options for `createBeaconTransport`. Validation rules and
 * field semantics are locked in
 * `specs/002-beacon-transport/data-model.md` § BeaconTransportOptions.
 */
export interface BeaconTransportOptions {
  /**
   * The HTTPS ingestion endpoint. MUST start with `https://` unless
   * `allowInsecureLoopback` is `true`, in which case `http://` is
   * permitted only for `localhost`, `127.0.0.1`, or `[::1]` hosts.
   * Construction throws on any other scheme or host (F-1).
   */
  endpoint: string;

  /**
   * Opt-in batching. Off by default — every accepted event produces
   * exactly one network call. When set, events accumulate in memory
   * until either `maxBatchSize` events have queued or `maxBatchAgeMs`
   * milliseconds have elapsed since the first event in the current
   * batch. See `contracts/batching.md`.
   */
  batching?: {
    /** Positive integer in `[1, 1000]`. Throws at construction if out of range. */
    maxBatchSize: number;
    /** Non-negative finite number of milliseconds. Omit to disable the age trigger. */
    maxBatchAgeMs?: number;
  };

  /**
   * Default `false`. When `true`, the construction-time scheme check
   * permits `http://` for hosts `localhost`, `127.0.0.1`, and `[::1]`
   * only; every other non-HTTPS endpoint still throws.
   *
   * The flag MUST be a literal at the call site. It is never read from
   * ambient state (`process.env`, build-define plugins, etc.).
   */
  allowInsecureLoopback?: boolean;

  /**
   * Optional `Transport.name` override for diagnostic attribution.
   * Defaults to `'beacon'`. Used as the `transportName` on every
   * drop notice this instance emits.
   */
  name?: string;

  /**
   * Optional diagnostics hook. Routes every drop notice this transport
   * emits — both synchronous drops detected inside `send()` and async
   * drops from fetch keepalive rejections, batch timer flush failures,
   * and pagehide-fired flush failures. Recommended: pass the same
   * callback the consumer wires into `LoggerConfig.onInternalError`.
   *
   * Defaults to a no-op. The transport never throws to callers
   * regardless of whether this hook is provided.
   */
  onInternalError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Factory (stub — real implementation lands in T016)
// ---------------------------------------------------------------------------

/**
 * Construct a body-only HTTPS beacon transport that implements the
 * `Transport` contract from `@your-org/frontend-logging-sdk`. Pass the
 * result directly to `configureLogging({ transports: [...] })`.
 *
 * Stub state: throws on every call. T016 replaces this body with the
 * real default-mode implementation; T028 layers batching on top.
 */
export function createBeaconTransport(
  options: BeaconTransportOptions,
): Transport {
  void options;
  void ({} as LogEvent);
  throw new Error(
    'createBeaconTransport: not implemented — landing in T016 (default mode) and T028 (batching).',
  );
}
