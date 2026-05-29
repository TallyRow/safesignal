/**
 * Reconfigure-with-retained-references integration test (T061).
 *
 * Locks FR-031 and SC-012:
 *   - Reconfiguring logging at runtime is **full-replace via atomic
 *     swap** (clarified by the /speckit-clarify session, 2026-05-27).
 *   - `Logger` references held by application or module code BEFORE
 *     the reconfiguration continue to function and deliver events
 *     through the NEW transports after the swap, without consumers
 *     having to re-acquire references.
 *   - The previous runtime's transports get `flush()` and
 *     `shutdown()` called, each isolated in try/catch.
 *   - No exception escapes any of this path.
 *   - Logger references created BEFORE the first `configureLogging()`
 *     call (against the lazy safe-defaults runtime) also pick up the
 *     subsequent runtime.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEvent, Transport } from '../../src/api/types.js';
import {
  configureLogging,
  createLogger,
  getRootLogger,
} from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';

const APP_V1 = { name: 'app', version: '1.0' };
const APP_V2 = { name: 'app', version: '2.0' };

beforeEach(() => {
  clearActiveRuntimeForTests();
});

interface InstrumentedTransport extends Transport {
  readonly calls: ReadonlyArray<LogEvent>;
  readonly flushCount: number;
  readonly shutdownCount: number;
}

function makeInstrumented(name: string): InstrumentedTransport {
  const calls: LogEvent[] = [];
  let flushCount = 0;
  let shutdownCount = 0;
  return {
    name,
    send(event: LogEvent) {
      calls.push(event);
    },
    async flush() {
      flushCount++;
    },
    async shutdown() {
      shutdownCount++;
    },
    get calls() {
      return calls;
    },
    get flushCount() {
      return flushCount;
    },
    get shutdownCount() {
      return shutdownCount;
    },
  };
}

// ---------------------------------------------------------------------------
// Core: retained references pick up the new runtime after reconfigure
// ---------------------------------------------------------------------------

describe('FR-031 / SC-012: retained Logger references survive configureLogging() and use the NEW transports', () => {
  it('a Logger created before configureLogging() emits through the new transport set', async () => {
    const t1 = makeInstrumented('t1');
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [t1],
    });
    const log = createLogger(); // <-- held across reconfigure

    log.info('before-reconfigure');
    expect(t1.calls).toHaveLength(1);

    const t2 = makeInstrumented('t2');
    configureLogging({
      application: APP_V2,
      environment: 'development',
      level: 'debug',
      transports: [t2],
    });

    log.info('after-reconfigure');
    expect(t2.calls).toHaveLength(1);
    expect(t2.calls[0]!.message).toBe('after-reconfigure');
    expect(t2.calls[0]!.context.application?.version).toBe('2.0');
    // t1 received only the pre-reconfigure event.
    expect(t1.calls).toHaveLength(1);
    expect(t1.calls[0]!.message).toBe('before-reconfigure');

    // Give the fire-and-forget shutdown a tick to settle.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(t1.flushCount).toBe(1);
    expect(t1.shutdownCount).toBe(1);
  });

  it('a child Logger held across reconfigure emits through the new transport, keeping its child context', async () => {
    const t1 = makeInstrumented('t1');
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [t1],
    });
    const child = createLogger().child({
      attributes: { requestId: 'r-1', lane: 'A' },
    });
    child.info('before');
    expect(t1.calls[0]!.context.attributes?.requestId).toBe('r-1');

    const t2 = makeInstrumented('t2');
    configureLogging({
      application: APP_V2,
      environment: 'development',
      level: 'debug',
      transports: [t2],
    });
    child.info('after');
    expect(t2.calls).toHaveLength(1);
    expect(t2.calls[0]!.context.attributes?.requestId).toBe('r-1');
    expect(t2.calls[0]!.context.attributes?.lane).toBe('A');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(t1.flushCount).toBe(1);
    expect(t1.shutdownCount).toBe(1);
  });

  it('many retained references survive multiple sequential reconfigurations', async () => {
    const transports: InstrumentedTransport[] = [];
    transports.push(makeInstrumented('t0'));
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [transports[0]!],
    });
    const handles = Array.from({ length: 20 }, () => createLogger());
    handles[0]!.info('cycle-0');
    expect(transports[0]!.calls).toHaveLength(1);

    // Reconfigure 5 times; on each reconfigure, every retained handle
    // emits and the new transport sees it.
    for (let i = 1; i <= 5; i++) {
      const newT = makeInstrumented(`t${i}`);
      transports.push(newT);
      configureLogging({
        application: APP_V1,
        environment: 'development',
        level: 'debug',
        transports: [newT],
      });
      handles[i]!.info(`cycle-${String(i)}`);
      expect(newT.calls).toHaveLength(1);
      expect(newT.calls[0]!.message).toBe(`cycle-${String(i)}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // Every previous transport got flush+shutdown exactly once.
    for (let i = 0; i < transports.length - 1; i++) {
      expect(transports[i]!.flushCount).toBe(1);
      expect(transports[i]!.shutdownCount).toBe(1);
    }
    // The currently-active transport has NOT been shut down.
    expect(transports[transports.length - 1]!.flushCount).toBe(0);
    expect(transports[transports.length - 1]!.shutdownCount).toBe(0);
  });

  it('getRootLogger() reference survives reconfigure', async () => {
    const t1 = makeInstrumented('t1');
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [t1],
    });
    const root = getRootLogger();
    root.info('a');
    const t2 = makeInstrumented('t2');
    configureLogging({
      application: APP_V2,
      environment: 'development',
      level: 'debug',
      transports: [t2],
    });
    root.info('b');
    expect(t1.calls).toHaveLength(1);
    expect(t2.calls).toHaveLength(1);
    expect(t2.calls[0]!.message).toBe('b');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

// ---------------------------------------------------------------------------
// Pre-configure references picked up by subsequent configureLogging()
// ---------------------------------------------------------------------------

describe('FR-031 edge: Loggers created BEFORE the first configureLogging() still pick up the runtime', () => {
  it('a Logger created against the lazy safe-defaults runtime emits through the host transport after configureLogging()', async () => {
    // No explicit configureLogging() yet.
    const log = createLogger(); // lazy-installs safe defaults runtime
    // Safe defaults filter info/debug in 'unknown' environment, so
    // log.warn through to verify the path.
    log.warn('pre-config');
    // No transport configured at this point — the auto-NoopTransport
    // is the only one, and it swallows silently.

    const t = makeInstrumented('main');
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [t],
    });
    log.info('post-config'); // now the runtime allows info
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]!.message).toBe('post-config');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});

// ---------------------------------------------------------------------------
// No exception escapes the reconfigure path
// ---------------------------------------------------------------------------

describe('FR-031 + no-throw invariant: reconfigure never propagates exceptions to the caller', () => {
  it('a previous transport whose flush() throws does not propagate; new runtime is fully active', async () => {
    let flushed = false;
    const onInternalError = vi.fn();
    const flaky: Transport = {
      name: 'flaky-flush',
      send() {
        /* no-op */
      },
      async flush() {
        flushed = true;
        throw new Error('flush explosion');
      },
    };
    configureLogging({
      application: APP_V1,
      environment: 'development',
      level: 'debug',
      transports: [flaky],
      onInternalError,
    });
    const log = createLogger();
    log.info('pre');

    const t2 = makeInstrumented('t2');
    // Reconfigure with new transports. The previous flush throws; we
    // must observe NO escape and a valid new active runtime.
    expect(() =>
      configureLogging({
        application: APP_V2,
        environment: 'development',
        level: 'debug',
        transports: [t2],
        onInternalError,
      }),
    ).not.toThrow();

    log.info('post');
    expect(t2.calls).toHaveLength(1);

    // Give microtasks/async shutdowns a tick.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(flushed).toBe(true);
  });

  it('a previous transport whose shutdown() throws does not propagate', async () => {
    const flaky: Transport = {
      name: 'flaky-shutdown',
      send() {
        /* no-op */
      },
      async shutdown() {
        throw new Error('shutdown explosion');
      },
    };
    configureLogging({
      application: APP_V1,
      environment: 'development',
      transports: [flaky],
    });
    const t2 = makeInstrumented('t2');
    expect(() =>
      configureLogging({
        application: APP_V2,
        environment: 'development',
        transports: [t2],
      }),
    ).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});
