/**
 * Default-mode `createBeaconTransport` factory.
 *
 * Composes the primitives from T004 (BeaconError), T005
 * (validateEndpoint), T006 (delivery primitives), and T007
 * (installPagehideHandler) into the `Transport`-shaped factory the
 * `./transport-beacon` subpath exports.
 *
 * Per-event delivery policy (D-3..D-7, F-2..F-7):
 *
 *   send(event)
 *     ├── if shutdownComplete: no-op
 *     ├── payload = JSON.stringify(event)            // F-4 cause if throws
 *     ├── if size > 64 KiB → oversized_event drop   // F-2 (D-3)
 *     ├── lazy install pagehide listener            // FR-008 / D-10
 *     ├── if !sendBeacon AND !fetch → beacon_unavailable drop  // F-3 (D-7)
 *     ├── tryBeacon(endpoint, payload)              // D-4
 *     │   └── true ────────────────────────────── delivered
 *     └── tryFetchKeepalive(endpoint, payload)      // D-5, D-6
 *         ├── 2xx ───────────────────────────────── delivered
 *         ├── non-2xx → transport_send_failed       // F-4
 *         └── reject  → transport_send_failed       // F-4, F-7 (with .cause)
 *
 * Every notice is rate-limited per `state.notified[code]` — one
 * notice per failure class per transport instance per session (F-8).
 *
 * The factory NEVER throws from `send()`, `flush()`, or `shutdown()`.
 * Construction-time errors (invalid options, non-HTTPS endpoint) are
 * the only throws — and they happen at the consumer's call site,
 * outside the emit hot path.
 *
 * Boundary discipline (TB-11): the only `src/` import in this file
 * is `import type` from `'../api/types.js'`; the other imports are
 * intra-subpath.
 *
 * Specs: `specs/002-beacon-transport/contracts/delivery.md` D-1..D-12;
 * `specs/002-beacon-transport/contracts/failure-modes.md` F-1..F-10;
 * `specs/002-beacon-transport/data-model.md` § BeaconTransportState.
 */

import type { LogEvent, Transport } from '../api/types.js';

import { BeaconError, type BeaconErrorCode } from './errors.js';
import { validateEndpoint } from './endpoint-validation.js';
import {
  BEACON_SIZE_LIMIT_BYTES,
  getPayloadByteLength,
  tryBeacon,
  tryFetchKeepalive,
} from './delivery.js';
import { installPagehideHandler } from './lifecycle.js';

// ---------------------------------------------------------------------------
// Public options shape (data-model.md § BeaconTransportOptions)
// ---------------------------------------------------------------------------

export interface BeaconTransportOptions {
  endpoint: string;
  batching?: {
    maxBatchSize: number;
    maxBatchAgeMs?: number;
  };
  allowInsecureLoopback?: boolean;
  name?: string;
  onInternalError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Internal per-instance state (data-model.md § BeaconTransportState)
// ---------------------------------------------------------------------------

interface BeaconTransportState {
  readonly endpoint: string;
  readonly name: string;
  readonly onInternalError: (err: Error) => void;
  readonly batching: BeaconTransportOptions['batching'] | undefined;
  buffer: LogEvent[];
  pagehideInstalled: boolean;
  pagehideUninstall: (() => void) | null;
  shutdownComplete: boolean;
  notified: {
    oversized_event: boolean;
    beacon_unavailable: boolean;
    transport_send_failed: boolean;
    beacon_batch_drop: boolean;
    transport_shutdown_failed: boolean;
  };
}

// ---------------------------------------------------------------------------
// Construction-time validation (F-1, TB-6)
// ---------------------------------------------------------------------------

function validateOptions(options: BeaconTransportOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('beacon transport: options must be a non-null object');
  }

  if (options.batching !== undefined) {
    if (typeof options.batching !== 'object' || options.batching === null) {
      throw new TypeError('beacon transport: options.batching must be an object');
    }
    const { maxBatchSize, maxBatchAgeMs } = options.batching;
    if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 1000) {
      throw new RangeError(
        `beacon transport: batching.maxBatchSize must be an integer in [1, 1000], got ${String(maxBatchSize)}`,
      );
    }
    if (maxBatchAgeMs !== undefined) {
      if (!Number.isFinite(maxBatchAgeMs) || maxBatchAgeMs < 0) {
        throw new RangeError(
          `beacon transport: batching.maxBatchAgeMs must be a non-negative finite number, got ${String(maxBatchAgeMs)}`,
        );
      }
    }
  }

  if (
    options.allowInsecureLoopback !== undefined &&
    typeof options.allowInsecureLoopback !== 'boolean'
  ) {
    throw new TypeError(
      `beacon transport: allowInsecureLoopback must be a boolean, got ${typeof options.allowInsecureLoopback}`,
    );
  }

  if (
    options.name !== undefined &&
    (typeof options.name !== 'string' || options.name.length === 0)
  ) {
    throw new TypeError('beacon transport: name must be a non-empty string');
  }

  if (
    options.onInternalError !== undefined &&
    typeof options.onInternalError !== 'function'
  ) {
    throw new TypeError('beacon transport: onInternalError must be a function');
  }
}

// ---------------------------------------------------------------------------
// Notice routing (F-2..F-7, F-8 rate-limit)
// ---------------------------------------------------------------------------

function notify(
  state: BeaconTransportState,
  code: BeaconErrorCode,
  message: string,
  cause?: unknown,
): void {
  if (state.notified[code]) return;
  state.notified[code] = true;
  const err = new BeaconError(code, state.name, message, cause);
  try {
    state.onInternalError(err);
  } catch {
    // Consumer's onInternalError threw. Swallow — we cannot re-enter the
    // same callback in response to a failed notification (FR-003).
  }
}

function notifyOversized(state: BeaconTransportState, event: LogEvent, bytes: number): void {
  if (state.notified.oversized_event) return;
  state.notified.oversized_event = true;
  // Truncate the event message to 256 chars (F-2 notice integrity: never
  // include attrs/error/context — only the message, bounded).
  const messagePreview =
    event.message.length > 256 ? event.message.slice(0, 256) : event.message;
  const err = new BeaconError(
    'oversized_event',
    state.name,
    `beacon transport '${state.name}' dropped oversized event: bytes=${bytes}, message=${messagePreview}`,
  );
  try {
    state.onInternalError(err);
  } catch {
    // swallow per FR-003
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Construct a body-only HTTPS beacon transport conforming to the
 * `Transport` contract from `@your-org/frontend-logging-sdk`. Pass the
 * result directly to `configureLogging({ transports: [...] })`.
 *
 * Construction throws synchronously on every form of invalid input
 * (non-string endpoint, malformed URL, non-HTTPS endpoint without
 * `allowInsecureLoopback`, batching fields out of range, etc.) — see
 * `contracts/failure-modes.md` F-1.
 *
 * Once constructed, `send()` / `flush()` / `shutdown()` NEVER throw
 * to the caller. Every drop routes through `options.onInternalError`.
 */
export function createBeaconTransport(
  options: BeaconTransportOptions,
): Transport {
  validateOptions(options);

  const allowInsecureLoopback = options.allowInsecureLoopback ?? false;
  const parsedEndpoint = validateEndpoint(options.endpoint, allowInsecureLoopback);
  // We keep the raw endpoint string (not parsedEndpoint.toString()) so the
  // wire matches exactly what the consumer supplied — important for ingestion
  // endpoints that are path-sensitive.
  void parsedEndpoint;

  const state: BeaconTransportState = {
    endpoint: options.endpoint,
    name: options.name ?? 'beacon',
    onInternalError: options.onInternalError ?? noopOnInternalError,
    batching: options.batching,
    buffer: [],
    pagehideInstalled: false,
    pagehideUninstall: null,
    shutdownComplete: false,
    notified: {
      oversized_event: false,
      beacon_unavailable: false,
      transport_send_failed: false,
      beacon_batch_drop: false,
      transport_shutdown_failed: false,
    },
  };

  const pagehideHandler = (): void => {
    // Default mode: no buffered state to flush. T028's batching layer
    // overrides this behaviour by attaching its own pagehide handling.
  };

  function ensureLazyInstall(): void {
    if (state.pagehideInstalled) return;
    state.pagehideInstalled = true;
    state.pagehideUninstall = installPagehideHandler(pagehideHandler);
  }

  function send(event: LogEvent): void {
    if (state.shutdownComplete) return;

    let payload: string;
    try {
      payload = JSON.stringify(event);
    } catch (cause) {
      notify(
        state,
        'transport_send_failed',
        `beacon transport '${state.name}' failed: JSON.stringify threw on the event`,
        cause,
      );
      return;
    }

    const bytes = getPayloadByteLength(payload);
    if (bytes > BEACON_SIZE_LIMIT_BYTES) {
      notifyOversized(state, event, bytes);
      return;
    }

    ensureLazyInstall();

    const nav = (globalThis as { navigator?: Navigator }).navigator;
    const hasSendBeacon = nav !== undefined && typeof nav.sendBeacon === 'function';
    const hasFetch = typeof (globalThis as { fetch?: typeof fetch }).fetch === 'function';

    if (!hasSendBeacon && !hasFetch) {
      notify(
        state,
        'beacon_unavailable',
        `beacon transport '${state.name}' has no usable delivery primitive (sendBeacon and fetch both unavailable)`,
      );
      return;
    }

    if (hasSendBeacon && tryBeacon(state.endpoint, payload)) {
      return; // delivered via sendBeacon
    }

    if (hasFetch) {
      tryFetchKeepalive(state.endpoint, payload).then(
        (ok) => {
          if (!ok) {
            notify(
              state,
              'transport_send_failed',
              `beacon transport '${state.name}' failed: fetch fallback resolved with non-2xx`,
            );
          }
        },
        (cause: unknown) => {
          notify(
            state,
            'transport_send_failed',
            `beacon transport '${state.name}' failed: fetch fallback rejected`,
            cause,
          );
        },
      );
      return;
    }

    // sendBeacon was present but returned false, and fetch is unavailable.
    notify(
      state,
      'transport_send_failed',
      `beacon transport '${state.name}' failed: sendBeacon returned false and fetch fallback is unavailable`,
    );
  }

  function flush(): Promise<void> {
    // Default mode has no buffer to drain.
    return Promise.resolve();
  }

  function shutdown(): Promise<void> {
    if (state.shutdownComplete) return Promise.resolve();
    state.shutdownComplete = true;
    if (state.pagehideUninstall !== null) {
      try {
        state.pagehideUninstall();
      } catch (cause) {
        notify(
          state,
          'transport_shutdown_failed',
          `beacon transport '${state.name}' shutdown: listener removal threw`,
          cause,
        );
      }
      state.pagehideUninstall = null;
      state.pagehideInstalled = false;
    }
    return Promise.resolve();
  }

  return {
    name: state.name,
    send,
    flush,
    shutdown,
  };
}

function noopOnInternalError(_err: Error): void {
  // intentional default — see BeaconTransportOptions.onInternalError docs.
}
