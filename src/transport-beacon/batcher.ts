/**
 * Batcher state machine for opt-in beacon-transport batching.
 *
 * T027 replaces T024's stub with the working state machine. T028
 * wires this batcher into `createBeaconTransport`'s send path.
 *
 * Behaviour (data-model.md § BatcherOptions + contracts/batching.md):
 *
 *   - `push(event)` appends to the in-memory buffer.
 *     - If this is the first event in an empty batch AND
 *       `maxBatchAgeMs` is set, arm a one-shot timer.
 *     - If the buffer reaches `maxBatchSize`, flush synchronously
 *       at the end of `push`.
 *   - `flush()` drains any pending buffer through the consumer's
 *     `flush` callback. Empty buffer → no-op.
 *   - `shutdown()` cancels the timer and nulls the flush callback
 *     reference, so any timer/microtask queued before shutdown
 *     becomes a no-op when it fires.
 *
 * Buffer-clear ordering (B-5c): the buffer is cleared BEFORE the
 * consumer's flush callback is invoked. A re-entrant `push()`
 * during the callback sees an empty buffer and starts a fresh
 * batch — no double-flush, no re-push.
 *
 * Throw safety (B-5d): if the consumer's flush callback throws,
 * the throw is swallowed. The events that were drained into the
 * callback are gone — the batcher does NOT re-push them. The
 * batcher itself never throws from `push`/`flush`/`shutdown`.
 *
 * Boundary discipline (TB-11): the only `src/` import is
 * `import type` from `'../api/types.js'`. The module is import-pure
 * — no listeners at module scope, no timers at module scope.
 */

import type { LogEvent } from '../api/types.js';

export interface BatcherOptions {
  /** Maximum events per batch. Positive integer in [1, 1000]. */
  maxBatchSize: number;
  /**
   * Optional age trigger. When set, a one-shot timer fires `maxBatchAgeMs`
   * ms after the first event enters an empty batch, flushing whatever is
   * pending. Cancelled on any other flush trigger.
   */
  maxBatchAgeMs?: number;
  /**
   * Callback invoked with the drained event array on every flush trigger
   * (size-threshold, age-timer, manual `flush()`). Throws are swallowed
   * — the events are considered lost from the batcher's perspective.
   */
  flush: (events: LogEvent[]) => void;
}

export interface Batcher {
  /** Push an event onto the buffer. May trigger an immediate flush. */
  push(event: LogEvent): void;
  /** Drain whatever is pending. No-op when the buffer is empty. */
  flush(): void;
  /** Cancel the age timer and inhibit further flush callbacks. */
  shutdown(): void;
}

export function createBatcher(opts: BatcherOptions): Batcher {
  const buffer: LogEvent[] = [];
  let maxAgeTimer: ReturnType<typeof setTimeout> | null = null;
  let flushCallback: ((events: LogEvent[]) => void) | null = opts.flush;

  const clearTimer = (): void => {
    if (maxAgeTimer !== null) {
      clearTimeout(maxAgeTimer);
      maxAgeTimer = null;
    }
  };

  const armTimer = (): void => {
    if (opts.maxBatchAgeMs === undefined) return;
    maxAgeTimer = setTimeout(() => {
      maxAgeTimer = null;
      doFlush();
    }, opts.maxBatchAgeMs);
  };

  const doFlush = (): void => {
    if (buffer.length === 0) return;
    // Post-shutdown: discard the buffered events silently. The caller
    // is responsible for draining via `flush()` before `shutdown()`
    // if it wants the data delivered.
    if (flushCallback === null) {
      buffer.length = 0;
      clearTimer();
      return;
    }
    // B-5c: copy + clear BEFORE the user callback runs, so a
    // re-entrant push during the callback starts a fresh batch.
    const events = buffer.slice();
    buffer.length = 0;
    clearTimer();
    try {
      flushCallback(events);
    } catch {
      // B-5d: swallow. The events are gone — they were copied out and
      // the consumer's callback chose to throw. Re-pushing into the
      // buffer would conflict with the "single-flush-attempt" model
      // in contracts/batching.md B-5.
    }
  };

  return {
    push(event: LogEvent): void {
      // Post-shutdown sends are silently dropped. The transport-level
      // shutdownComplete flag (T028) handles the same guarantee at
      // the createBeaconTransport boundary; this is defense in depth.
      if (flushCallback === null) return;
      buffer.push(event);
      // B-8a: arm timer when first event enters an empty batch.
      if (buffer.length === 1 && opts.maxBatchAgeMs !== undefined) {
        armTimer();
      }
      // B-5b: size threshold reached → flush synchronously at the end
      // of this push call.
      if (buffer.length >= opts.maxBatchSize) {
        doFlush();
      }
    },
    flush(): void {
      doFlush();
    },
    shutdown(): void {
      clearTimer();
      // Discard any buffered events. The caller (T028's beacon-
      // transport.ts shutdown handler) calls flush() before shutdown()
      // if it wants the pending batch drained.
      buffer.length = 0;
      flushCallback = null;
    },
  };
}
