/**
 * Batcher state machine for opt-in beacon-transport batching.
 *
 * STUB — landed by T024 so the unit-test scaffolding in
 * `tests/unit/transport-beacon/batcher.test.ts` can compile its
 * imports. T027 replaces this body with the real state machine; T028
 * wires it into `createBeaconTransport`.
 *
 * Public surface (data-model.md § BatcherOptions and `Batcher`):
 *   - `BatcherOptions` — maxBatchSize, optional maxBatchAgeMs, flush
 *     callback that receives the drained event array.
 *   - `Batcher` — push / flush / shutdown handle.
 *   - `createBatcher(opts)` — factory; currently throws on call.
 *
 * Boundary discipline (TB-11): the only `src/` import permitted in
 * this subpath is `import type` from `'../api/types.js'`.
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
   * (size-threshold, age-timer, manual `flush()`, `shutdown()`).
   * Implementation detail of the caller — typically encodes a
   * `{ events: [...] }` envelope and dispatches via the same primitives
   * the default-mode transport uses.
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

/**
 * Construct a batcher. STUB: throws on invocation until T027 wires the
 * real state machine.
 */
export function createBatcher(_opts: BatcherOptions): Batcher {
  void _opts;
  throw new Error(
    'createBatcher: not implemented — landing in T027 (batcher state machine).',
  );
}
