/**
 * Configurable failing-transport helpers for failure-safety, transport-contract,
 * and stress tests.
 *
 * Type stubs were replaced with imports from the canonical public surface
 * (`src/api/types.ts`) once T005 landed. `Transport` and `LogEvent` are
 * re-exported for convenience.
 */

import type { LogEvent, Transport } from '../../src/api/types.js';

export type { LogEvent, Transport };

export interface FailingTransportController {
  /** All events the transport's `send` was *called* with (regardless of outcome). */
  readonly calls: ReadonlyArray<LogEvent>;
  /** Events whose send succeeded (returned undefined / resolved Promise). */
  readonly delivered: ReadonlyArray<LogEvent>;
  /** Number of failed calls so far (sync throws + rejected Promises). */
  readonly failureCount: number;
  /** Reset the internal call/delivered/failure log. */
  reset(): void;
}

export interface ThrowingTransport
  extends Transport,
    FailingTransportController {}

export interface MakeThrowingTransportOptions {
  /** Defaults to `'throwing'`. */
  name?: string;
  /** The Error to throw. Defaults to a new Error with a descriptive message. */
  error?: Error;
}

/**
 * Transport whose `send()` **throws synchronously** on every call.
 * Use to verify `SafeTransport` isolation (FS-1) and the no-throw stress test
 * (T027 / T046 / T058).
 */
export function makeThrowingTransport(
  options: MakeThrowingTransportOptions = {},
): ThrowingTransport {
  const name = options.name ?? 'throwing';
  const error = options.error ?? new Error(`${name}.send threw synchronously`);
  const calls: LogEvent[] = [];
  const delivered: LogEvent[] = [];
  let failureCount = 0;

  return {
    name,
    send(event) {
      calls.push(event);
      failureCount++;
      throw error;
    },
    get calls() {
      return calls;
    },
    get delivered() {
      return delivered;
    },
    get failureCount() {
      return failureCount;
    },
    reset() {
      calls.length = 0;
      delivered.length = 0;
      failureCount = 0;
    },
  };
}

export interface MakeRejectingTransportOptions {
  /** Defaults to `'rejecting'`. */
  name?: string;
  /** The reason to reject with. Defaults to a new Error. */
  reason?: Error;
}

/**
 * Transport whose `send()` returns a **rejected Promise** on every call.
 * Use to verify rejection-swallowing (FS-2) and the no-throw stress test.
 */
export function makeRejectingTransport(
  options: MakeRejectingTransportOptions = {},
): ThrowingTransport {
  const name = options.name ?? 'rejecting';
  const reason = options.reason ?? new Error(`${name}.send rejected`);
  const calls: LogEvent[] = [];
  const delivered: LogEvent[] = [];
  let failureCount = 0;

  return {
    name,
    send(event) {
      calls.push(event);
      failureCount++;
      return Promise.reject(reason);
    },
    get calls() {
      return calls;
    },
    get delivered() {
      return delivered;
    },
    get failureCount() {
      return failureCount;
    },
    reset() {
      calls.length = 0;
      delivered.length = 0;
      failureCount = 0;
    },
  };
}

export interface MakeFlakyTransportOptions {
  /** Defaults to `'flaky'`. */
  name?: string;
  /** Fail every Nth call (1-indexed). Default `2` (every other call fails). */
  failEvery?: number;
  /** Whether failures throw sync (`'throw'`) or reject async (`'reject'`). Default `'throw'`. */
  mode?: 'throw' | 'reject';
}

/**
 * Transport that fails on every Nth call (default: every 2nd). Use for tests
 * that need a mix of successful and failing emissions — the no-throw stress
 * test (T027 / T046) is the primary consumer.
 */
export function makeFlakyTransport(
  options: MakeFlakyTransportOptions = {},
): ThrowingTransport {
  const name = options.name ?? 'flaky';
  const failEvery = Math.max(1, Math.floor(options.failEvery ?? 2));
  const mode = options.mode ?? 'throw';
  const calls: LogEvent[] = [];
  const delivered: LogEvent[] = [];
  let failureCount = 0;
  let callIndex = 0;

  return {
    name,
    send(event) {
      calls.push(event);
      callIndex++;
      if (callIndex % failEvery === 0) {
        failureCount++;
        const err = new Error(
          `${name}.send failed on call ${String(callIndex)}`,
        );
        if (mode === 'reject') {
          return Promise.reject(err);
        }
        throw err;
      }
      delivered.push(event);
      return undefined;
    },
    get calls() {
      return calls;
    },
    get delivered() {
      return delivered;
    },
    get failureCount() {
      return failureCount;
    },
    reset() {
      calls.length = 0;
      delivered.length = 0;
      failureCount = 0;
      callIndex = 0;
    },
  };
}

export interface CapturingTransport
  extends Transport,
    FailingTransportController {}

/**
 * Transport that records every received event and always succeeds. Use to
 * verify "other transports still receive events" semantics (FS-11) when paired
 * with a failing transport, and as the in-memory observer for the
 * security tests (T041, T042, T058).
 */
export function makeCapturingTransport(name = 'capturing'): CapturingTransport {
  const calls: LogEvent[] = [];
  let failureCount = 0;

  return {
    name,
    send(event) {
      calls.push(event);
    },
    get calls() {
      return calls;
    },
    get delivered() {
      return calls;
    },
    get failureCount() {
      return failureCount;
    },
    reset() {
      calls.length = 0;
      failureCount = 0;
    },
  };
}
