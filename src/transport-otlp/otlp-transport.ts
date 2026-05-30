/**
 * `createOtlpTransport` — factory for the `./transport-otlp` subpath.
 *
 * Composes the subpath primitives into a `Transport` that delivers
 * fully-processed `LogEvent`s to an OTLP logs backend as OTLP/HTTP+JSON,
 * batched, fire-and-forget (no retry), fail-closed.
 *
 * Delivery policy (research D6/D7, contracts TO-2..TO-8):
 *
 *   send(event)
 *     ├── if shutdownComplete: no-op
 *     ├── lazily install the pagehide best-effort flush (first send)
 *     ├── if serialized record > maxRecordBytes → oversized_event drop
 *     ├── if buffered >= maxBufferedEvents → buffer_overflow drop
 *     └── batcher.push(event)            // flush on size / age
 *
 *   flush(batch)  // batcher callback
 *     ├── serialize(batch) (fail-closed: serialize_failed → drop)
 *     └── deliver(endpoint, headers, body)  // fetch keepalive, never throws
 *           ├── delivered ─────────────────── done
 *           ├── unavailable ───────────────── delivery_unavailable notice
 *           ├── send_failed ───────────────── send_failed notice (+cause)
 *           └── partial_rejection ─────────── partial_rejection notice
 *
 * Every notice is rate-limited to one per failure class per instance per
 * session and NEVER carries a configured header/secret value (FR-009).
 * `send`/`flush`/`shutdown` NEVER throw or reject to the caller; only
 * construction-time validation throws, at the consumer's call site.
 *
 * Boundary discipline (TO-7): the only `src/` import is a type-only import
 * from `'../api/types.js'`. No `@opentelemetry/*` and no
 * `../internal/telemetry/otel/` import — the payload is hand-serialized.
 *
 * Specs: `specs/007-transport-otlp/contracts/*`, `data-model.md`.
 */

import type { LogEvent, Transport } from '../api/types.js';

import { type Batcher, createBatcher } from './batcher.js';
import { type DeliveryResult, deliver } from './delivery.js';
import { validateEndpoint } from './endpoint-validation.js';
import {
  freshNotifiedLedger,
  type NotifyContext,
  notifyOnce,
  type OtlpFailureCode,
} from './errors.js';
import { encode, serializeBatch, toLogRecord } from './otlp-serializer.js';

// ---------------------------------------------------------------------------
// Public options shape (data-model.md § OtlpTransportOptions)
// ---------------------------------------------------------------------------

export interface OtlpTransportOptions {
  /** Full OTLP logs endpoint URL (e.g. `https://otlp.example.com/v1/logs`). */
  endpoint: string;
  /** Static request headers (e.g. auth). Sent only on the wire. */
  headers?: Record<string, string>;
  /** Batch flush triggers. */
  batching?: {
    maxBatchSize: number;
    maxBatchAgeMs?: number;
  };
  /** Hard cap on buffered events; over-cap events are dropped. Default 1000. */
  maxBufferedEvents?: number;
  /** Per-record size guard in bytes; larger records are dropped. Default 64 KiB. */
  maxRecordBytes?: number;
  /** Stable diagnostic identifier (`Transport.name`). Default `'otlp'`. */
  name?: string;
  /** Permit `http://` localhost/127.0.0.1/[::1] only. Default false. */
  allowInsecureLoopback?: boolean;
  /** Receives rate-limited diagnostic notices. Never carries header values. */
  onInternalError?: (err: Error) => void;
}

// ---------------------------------------------------------------------------
// Internal per-instance state (data-model.md § OtlpTransportState)
// ---------------------------------------------------------------------------

interface OtlpTransportState extends NotifyContext {
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly name: string;
  readonly onInternalError: (err: Error) => void;
  readonly maxBufferedEvents: number;
  readonly maxRecordBytes: number;
  readonly notified: Record<OtlpFailureCode, boolean>;
  batcher: Batcher;
  pagehideInstalled: boolean;
  pagehideUninstall: (() => void) | null;
  shutdownComplete: boolean;
  inFlight: Set<Promise<void>>;
  /**
   * Events accepted but not yet delivered (buffered in the batcher + in
   * flight). The true memory bound in this no-retry design: incremented on
   * accept, decremented when a batch's delivery settles. Capped at
   * `maxBufferedEvents` so a slow/failing backend cannot grow memory
   * unboundedly.
   */
  pending: number;
}

const DEFAULTS = {
  maxBatchSize: 20,
  maxBatchAgeMs: 5000,
  maxBufferedEvents: 1000,
  maxRecordBytes: 65536,
  name: 'otlp',
} as const;

// ---------------------------------------------------------------------------
// Construction-time validation (TO-2)
// ---------------------------------------------------------------------------

function validateOptions(options: OtlpTransportOptions): void {
  if (typeof options !== 'object' || options === null) {
    throw new TypeError('otlp transport: options must be a non-null object');
  }
  const { headers, batching, maxBufferedEvents, maxRecordBytes } = options;

  if (headers !== undefined) {
    if (typeof headers !== 'object' || headers === null) {
      throw new TypeError('otlp transport: headers must be an object');
    }
    for (const key of Object.keys(headers)) {
      if (typeof headers[key] !== 'string') {
        throw new TypeError(
          `otlp transport: header '${key}' must be a string value`,
        );
      }
    }
  }

  const maxBatchSize = batching?.maxBatchSize ?? DEFAULTS.maxBatchSize;
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new RangeError(
      'otlp transport: batching.maxBatchSize must be an integer >= 1',
    );
  }
  const cap = maxBufferedEvents ?? DEFAULTS.maxBufferedEvents;
  if (!Number.isInteger(cap) || cap < maxBatchSize) {
    throw new RangeError(
      'otlp transport: maxBufferedEvents must be an integer >= maxBatchSize',
    );
  }
  const recBytes = maxRecordBytes ?? DEFAULTS.maxRecordBytes;
  if (!Number.isInteger(recBytes) || recBytes < 1) {
    throw new RangeError(
      'otlp transport: maxRecordBytes must be an integer >= 1',
    );
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOtlpTransport(options: OtlpTransportOptions): Transport {
  validateOptions(options);
  const allowInsecureLoopback = options.allowInsecureLoopback ?? false;
  // Throws at the consumer call site on a bad endpoint (off the hot path).
  validateEndpoint(options.endpoint, allowInsecureLoopback);

  const name = options.name ?? DEFAULTS.name;
  const maxBatchSize = options.batching?.maxBatchSize ?? DEFAULTS.maxBatchSize;
  const maxBatchAgeMs =
    options.batching?.maxBatchAgeMs ?? DEFAULTS.maxBatchAgeMs;

  const state: OtlpTransportState = {
    endpoint: options.endpoint,
    // Copy + freeze the headers so later consumer mutation cannot change
    // what we send, and so nothing outside delivery can read them.
    headers: Object.freeze({ ...(options.headers ?? {}) }),
    name,
    onInternalError: options.onInternalError ?? (() => undefined),
    maxBufferedEvents: options.maxBufferedEvents ?? DEFAULTS.maxBufferedEvents,
    maxRecordBytes: options.maxRecordBytes ?? DEFAULTS.maxRecordBytes,
    notified: freshNotifiedLedger(),
    // Placeholder; real batcher assigned below once the flush closure exists.
    batcher: undefined as unknown as Batcher,
    pagehideInstalled: false,
    pagehideUninstall: null,
    shutdownComplete: false,
    inFlight: new Set<Promise<void>>(),
    pending: 0,
  };

  state.batcher = createBatcher({
    maxBatchSize,
    maxBatchAgeMs,
    flush: (events) => {
      void flushBatch(state, events);
    },
  });

  return {
    name,
    send(event: LogEvent): void {
      if (state.shutdownComplete) return;
      ensurePagehide(state);

      // Per-record size guard (oversized_event) — measure the serialized
      // OTLP LogRecord, drop if it exceeds the budget. Never throws.
      try {
        const record = toLogRecord(event, Date.now());
        if (byteLength(JSON.stringify(record)) > state.maxRecordBytes) {
          notifyOnce(
            state,
            'oversized_event',
            `dropped an event whose serialized record exceeds ${state.maxRecordBytes} bytes`,
          );
          return;
        }
      } catch (cause) {
        notifyOnce(
          state,
          'serialize_failed',
          'dropped an event that failed to serialize',
          cause,
        );
        return;
      }

      // Hard memory cap on undelivered (buffered + in-flight) events.
      if (state.pending >= state.maxBufferedEvents) {
        notifyOnce(
          state,
          'buffer_overflow',
          `${state.maxBufferedEvents} events undelivered; dropping event`,
        );
        return;
      }
      state.pending += 1;
      state.batcher.push(event);
    },
    async flush(): Promise<void> {
      state.batcher.flush();
      await settleInFlight(state);
    },
    async shutdown(): Promise<void> {
      if (state.shutdownComplete) {
        await settleInFlight(state);
        return;
      }
      state.shutdownComplete = true;
      try {
        state.batcher.flush();
        await settleInFlight(state);
      } catch (cause) {
        notifyOnce(state, 'shutdown_failed', 'shutdown flush failed', cause);
      } finally {
        teardownPagehide(state);
        state.batcher.shutdown();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Batch delivery (never throws)
// ---------------------------------------------------------------------------

async function flushBatch(
  state: OtlpTransportState,
  events: LogEvent[],
): Promise<void> {
  const count = events.length;
  let body: string;
  try {
    body = encode(serializeBatch(events, Date.now()));
  } catch (cause) {
    // Fail-closed: drop the batch, but still release its pending budget.
    state.pending = Math.max(0, state.pending - count);
    notifyOnce(
      state,
      'serialize_failed',
      'dropped a batch that failed to serialize',
      cause,
    );
    return;
  }

  const promise = (async (): Promise<void> => {
    const result: DeliveryResult = await deliver(
      state.endpoint,
      state.headers,
      body,
    );
    mapResult(state, result);
  })().catch(() => {
    // Defensive: deliver() is contracted not to reject, but never let an
    // unexpected rejection escape into an unhandled rejection.
  });

  state.inFlight.add(promise);
  void promise.finally(() => {
    state.inFlight.delete(promise);
    // Release this batch's pending budget once delivery settles.
    state.pending = Math.max(0, state.pending - count);
  });
}

function mapResult(state: OtlpTransportState, result: DeliveryResult): void {
  switch (result.kind) {
    case 'delivered':
      return;
    case 'unavailable':
      notifyOnce(
        state,
        'delivery_unavailable',
        'fetch is unavailable; dropping batch',
      );
      return;
    case 'send_failed':
      notifyOnce(
        state,
        'send_failed',
        `delivery failed (${result.detail})`,
        result.cause,
      );
      return;
    case 'partial_rejection':
      notifyOnce(
        state,
        'partial_rejection',
        `backend rejected ${result.rejected} record(s)`,
      );
      return;
  }
}

async function settleInFlight(state: OtlpTransportState): Promise<void> {
  // Snapshot: new deliveries triggered during await are not awaited here
  // (flush() is a point-in-time drain), matching beacon's flush semantics.
  await Promise.all([...state.inFlight]);
}

// ---------------------------------------------------------------------------
// Lazy pagehide best-effort flush (Principle VII — nothing at Logger create)
// ---------------------------------------------------------------------------

function ensurePagehide(state: OtlpTransportState): void {
  if (state.pagehideInstalled) return;
  const target = globalThis as {
    addEventListener?: typeof globalThis.addEventListener;
    removeEventListener?: typeof globalThis.removeEventListener;
  };
  state.pagehideInstalled = true;
  if (typeof target.addEventListener !== 'function') {
    state.pagehideUninstall = null;
    return;
  }
  const handler = (): void => {
    // Best-effort: drain via the keepalive fetch path. Never blocks unload.
    state.batcher.flush();
  };
  target.addEventListener('pagehide', handler);
  state.pagehideUninstall = (): void => {
    if (typeof target.removeEventListener === 'function') {
      target.removeEventListener('pagehide', handler);
    }
  };
}

function teardownPagehide(state: OtlpTransportState): void {
  if (state.pagehideUninstall !== null) {
    state.pagehideUninstall();
    state.pagehideUninstall = null;
  }
  state.pagehideInstalled = false;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
