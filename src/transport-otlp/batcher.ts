/**
 * Bounded batch buffer for the OTLP transport.
 *
 * A parallel copy of the `./transport-beacon` batcher state machine (the
 * boundary rule forbids importing across subpaths — TO-7). Behaviour
 * (research D7, data-model § Batcher):
 *
 *   - `push(event)` appends to the in-memory buffer.
 *     - First event in an empty batch with `maxBatchAgeMs` set arms a
 *       one-shot age timer.
 *     - Reaching `maxBatchSize` flushes synchronously at end of `push`.
 *   - `flush()` drains the pending buffer through the consumer callback.
 *     Empty buffer → no-op.
 *   - `shutdown()` cancels the timer and inhibits further callbacks.
 *
 * Buffer is copied + cleared BEFORE the callback runs, so a re-entrant
 * `push` during the callback starts a fresh batch. A throwing callback is
 * swallowed (the batcher never throws from push/flush/shutdown). The hard
 * `maxBufferedEvents` cap is enforced by the transport BEFORE `push`, so
 * the batcher itself stays simple.
 */

import type { LogEvent } from '../api/types.js';

export interface BatcherOptions {
  maxBatchSize: number;
  maxBatchAgeMs?: number;
  flush: (events: LogEvent[]) => void;
}

export interface Batcher {
  push(event: LogEvent): void;
  flush(): void;
  shutdown(): void;
  /** Current pending count — used by the transport's buffer-cap guard. */
  size(): number;
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
    if (flushCallback === null) {
      buffer.length = 0;
      clearTimer();
      return;
    }
    const events = buffer.slice();
    buffer.length = 0;
    clearTimer();
    try {
      flushCallback(events);
    } catch {
      // Swallow: the events were copied out; the consumer callback chose
      // to throw. Single-flush-attempt model (no re-push, no retry).
    }
  };

  return {
    push(event: LogEvent): void {
      if (flushCallback === null) return;
      buffer.push(event);
      if (buffer.length === 1 && opts.maxBatchAgeMs !== undefined) {
        armTimer();
      }
      if (buffer.length >= opts.maxBatchSize) {
        doFlush();
      }
    },
    flush(): void {
      doFlush();
    },
    shutdown(): void {
      clearTimer();
      buffer.length = 0;
      flushCallback = null;
    },
    size(): number {
      return buffer.length;
    },
  };
}
