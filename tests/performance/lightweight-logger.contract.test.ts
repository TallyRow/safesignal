/**
 * Lightweight-`Logger` contract test (T059).
 *
 * Locks FR-029: creating a `Logger` MUST NOT initialize a telemetry
 * backend, any observability-vendor SDK, transport, queue, batching
 * loop, retry loop, timer, interval, scheduled callback, global event
 * listener, console patch, document/window observer, or perform any
 * network work, and MUST NOT read ambient browser state.
 *
 * Strategy: install spies on every global side-effect surface before
 * exercising `createLogger()`, `child()`, `withContext()`, and
 * `getRootLogger()`. After each constructor / derivation, assert the
 * spy was NOT called. A separate `TransportFactory` spy proves that
 * the factory is invoked exactly once during `configureLogging()`
 * and zero additional times across many subsequent
 * `createLogger`/`child` calls — handle construction shares a single
 * runtime-resource set per package/runtime boundary (FR-030).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

// A spy of any signature. `vi.spyOn`'s default return type narrows to
// `(this: unknown, ...args: unknown[]) => unknown`, which the concretely
// typed globals (setTimeout, fetch, sendBeacon, …) are not assignable to.
// These spies are only ever asserted with `.toHaveBeenCalled()`, so the
// precise call signature is irrelevant.
type AnySpy = MockInstance<(...args: any[]) => any>;

import { configureLogging, createLogger, getRootLogger } from '../../src/index.js';
import type { LogEvent, Transport, TransportFactory } from '../../src/api/types.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';

const APP = { name: 'lightweight-logger', version: '1.0.0' };

let spies: ReturnType<typeof installSpies>;

beforeEach(() => {
  clearActiveRuntimeForTests();
  spies = installSpies();
});

afterEach(() => {
  spies.restoreAll();
});

interface SpyBag {
  readonly addEventListener: AnySpy;
  readonly setTimeout: AnySpy;
  readonly setInterval: AnySpy;
  readonly queueMicrotask: AnySpy;
  readonly requestAnimationFrame: AnySpy | undefined;
  readonly consoleLog: AnySpy;
  readonly consoleInfo: AnySpy;
  readonly consoleWarn: AnySpy;
  readonly consoleError: AnySpy;
  readonly consoleDebug: AnySpy;
  readonly fetch: AnySpy | undefined;
  readonly sendBeacon: AnySpy | undefined;
  restoreAll(): void;
}

function installSpies(): SpyBag {
  const restorers: Array<() => void> = [];
  const push = <T>(s: T): T => {
    restorers.push(() => (s as { mockRestore?: () => void }).mockRestore?.());
    return s;
  };

  // Generic spy that does NOT call through — these are surfaces we
  // assert the package never touches; if it does, we want the failure
  // to be loud and not produce any side effect.
  const addEventListenerSpy = push(
    vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(() => undefined),
  );
  const setTimeoutSpy = push(
    vi
      .spyOn(globalThis, 'setTimeout')
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setTimeout>),
  );
  const setIntervalSpy = push(
    vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>),
  );
  const queueMicrotaskSpy = push(
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined),
  );
  const rafSpy =
    typeof globalThis.requestAnimationFrame === 'function'
      ? push(
          vi
            .spyOn(globalThis, 'requestAnimationFrame')
            .mockImplementation(() => 0 as unknown as number),
        )
      : undefined;

  const consoleLogSpy = push(vi.spyOn(console, 'log').mockImplementation(() => undefined));
  const consoleInfoSpy = push(vi.spyOn(console, 'info').mockImplementation(() => undefined));
  const consoleWarnSpy = push(vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  const consoleErrorSpy = push(vi.spyOn(console, 'error').mockImplementation(() => undefined));
  const consoleDebugSpy = push(vi.spyOn(console, 'debug').mockImplementation(() => undefined));

  const fetchSpy =
    typeof globalThis.fetch === 'function'
      ? push(
          vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('')),
        )
      : undefined;

  const sendBeaconSpy =
    typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      ? push(vi.spyOn(navigator, 'sendBeacon').mockImplementation(() => true))
      : undefined;

  return {
    addEventListener: addEventListenerSpy,
    setTimeout: setTimeoutSpy,
    setInterval: setIntervalSpy,
    queueMicrotask: queueMicrotaskSpy,
    requestAnimationFrame: rafSpy,
    consoleLog: consoleLogSpy,
    consoleInfo: consoleInfoSpy,
    consoleWarn: consoleWarnSpy,
    consoleError: consoleErrorSpy,
    consoleDebug: consoleDebugSpy,
    fetch: fetchSpy,
    sendBeacon: sendBeaconSpy,
    restoreAll() {
      for (const restore of restorers) restore();
    },
  };
}

function assertNoGlobalSideEffects(bag: SpyBag): void {
  expect(bag.addEventListener).not.toHaveBeenCalled();
  expect(bag.setTimeout).not.toHaveBeenCalled();
  expect(bag.setInterval).not.toHaveBeenCalled();
  expect(bag.queueMicrotask).not.toHaveBeenCalled();
  if (bag.requestAnimationFrame !== undefined) {
    expect(bag.requestAnimationFrame).not.toHaveBeenCalled();
  }
  expect(bag.consoleLog).not.toHaveBeenCalled();
  expect(bag.consoleInfo).not.toHaveBeenCalled();
  expect(bag.consoleWarn).not.toHaveBeenCalled();
  expect(bag.consoleError).not.toHaveBeenCalled();
  expect(bag.consoleDebug).not.toHaveBeenCalled();
  if (bag.fetch !== undefined) {
    expect(bag.fetch).not.toHaveBeenCalled();
  }
  if (bag.sendBeacon !== undefined) {
    expect(bag.sendBeacon).not.toHaveBeenCalled();
  }
}

// ---------------------------------------------------------------------------
// FR-029: handle construction triggers zero global side effects
// ---------------------------------------------------------------------------

describe('FR-029: Logger handle construction is side-effect free', () => {
  it('createLogger() does not call any global listener/timer/console/fetch/sendBeacon', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    // Reset spies AFTER configureLogging — that call DOES legitimately
    // wire up transports; we are asserting handle construction below
    // adds no further side effects.
    spies.addEventListener.mockClear();
    spies.setTimeout.mockClear();
    spies.setInterval.mockClear();
    spies.queueMicrotask.mockClear();
    spies.requestAnimationFrame?.mockClear();
    spies.consoleLog.mockClear();
    spies.consoleInfo.mockClear();
    spies.consoleWarn.mockClear();
    spies.consoleError.mockClear();
    spies.consoleDebug.mockClear();
    spies.fetch?.mockClear();
    spies.sendBeacon?.mockClear();

    createLogger();
    assertNoGlobalSideEffects(spies);
  });

  it('createLogger({ module }) adds no side effects', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    for (const spy of [
      spies.addEventListener,
      spies.setTimeout,
      spies.setInterval,
      spies.queueMicrotask,
      spies.consoleLog,
      spies.consoleInfo,
      spies.consoleWarn,
      spies.consoleError,
      spies.consoleDebug,
    ]) {
      (spy as { mockClear: () => void }).mockClear();
    }
    spies.requestAnimationFrame?.mockClear();
    spies.fetch?.mockClear();
    spies.sendBeacon?.mockClear();

    createLogger({ module: { name: 'mod-a', version: '1.0' } });
    assertNoGlobalSideEffects(spies);
  });

  it('logger.child() and logger.withContext() add no side effects', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    const log = createLogger();
    for (const spy of [
      spies.addEventListener,
      spies.setTimeout,
      spies.setInterval,
      spies.queueMicrotask,
      spies.consoleLog,
      spies.consoleInfo,
      spies.consoleWarn,
      spies.consoleError,
      spies.consoleDebug,
    ]) {
      (spy as { mockClear: () => void }).mockClear();
    }
    spies.requestAnimationFrame?.mockClear();
    spies.fetch?.mockClear();
    spies.sendBeacon?.mockClear();

    log.child({ attributes: { requestId: 'r-1' } });
    log.withContext({ attributes: { lane: 'A' } });
    assertNoGlobalSideEffects(spies);
  });

  it('getRootLogger() adds no side effects', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    for (const spy of [
      spies.addEventListener,
      spies.setTimeout,
      spies.setInterval,
      spies.queueMicrotask,
      spies.consoleLog,
      spies.consoleInfo,
      spies.consoleWarn,
      spies.consoleError,
      spies.consoleDebug,
    ]) {
      (spy as { mockClear: () => void }).mockClear();
    }
    spies.requestAnimationFrame?.mockClear();
    spies.fetch?.mockClear();
    spies.sendBeacon?.mockClear();

    getRootLogger();
    assertNoGlobalSideEffects(spies);
  });
});

// ---------------------------------------------------------------------------
// FR-030: TransportFactory is invoked exactly once per configureLogging()
// ---------------------------------------------------------------------------

describe('FR-030: TransportFactory invocation count is one-per-configureLogging', () => {
  it('factory is called exactly once during configureLogging() — never again as loggers are created', () => {
    const factorySpy = vi.fn<TransportFactory>(() => ({
      name: 'spy-transport',
      send(_event: LogEvent) { /* no-op */ },
    }));
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factorySpy],
    });
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // Create 100 loggers — none of these should call the factory.
    for (let i = 0; i < 100; i++) {
      createLogger({ module: { name: `m-${String(i)}`, version: '1.0' } });
    }
    expect(factorySpy).toHaveBeenCalledTimes(1);

    // Derive a deep child chain — same constraint.
    let chain = createLogger();
    for (let i = 0; i < 50; i++) {
      chain = chain.child({ attributes: { step: i } });
    }
    expect(factorySpy).toHaveBeenCalledTimes(1);
  });

  it('passing a transport INSTANCE (not a factory) also stays at zero post-configure invocations', () => {
    // Use a transport with a getter-only `name` field that counts
    // accesses; the runtime should never re-acquire it after wrapping.
    let nameAccesses = 0;
    const transport: Transport = {
      get name(): string {
        nameAccesses++;
        return 'instance-transport';
      },
      send() { /* no-op */ },
    };
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [transport],
    });
    // configureLogging() invokes SafeTransport's constructor which
    // reads `name` once for diagnostic purposes.
    const baselineAccesses = nameAccesses;
    for (let i = 0; i < 100; i++) {
      createLogger({ module: { name: `m-${String(i)}`, version: '1.0' } });
    }
    expect(nameAccesses).toBe(baselineAccesses);
  });

  it('a fresh configureLogging() re-invokes each factory exactly once (no accumulating handles)', () => {
    const factorySpy = vi.fn<TransportFactory>(() => ({
      name: 'spy',
      send() { /* no-op */ },
    }));
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factorySpy],
    });
    expect(factorySpy).toHaveBeenCalledTimes(1);
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factorySpy],
    });
    expect(factorySpy).toHaveBeenCalledTimes(2);
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factorySpy],
    });
    expect(factorySpy).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Constant per-handle cost (structural check)
// ---------------------------------------------------------------------------

describe('FR-029: per-Logger allocation cost is bounded and constant', () => {
  it('every handle exposes the same Logger shape (no per-instance state bloat)', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    const handles = [
      createLogger(),
      createLogger({ module: { name: 'm1', version: '1' } }),
      createLogger().child({ attributes: { x: 1 } }),
      createLogger().withContext({ attributes: { y: 2 } }),
      getRootLogger(),
    ];
    for (const h of handles) {
      // The public Logger surface is exactly 6 methods. Constructing
      // a Logger MUST NOT bolt on extra fields; the contract test
      // T020 also locks the shape but at the type/runtime-shape
      // level.
      const methodKeys = Object.keys(h);
      expect(methodKeys).toEqual(
        expect.arrayContaining(['debug', 'info', 'warn', 'error', 'child', 'withContext']),
      );
      // The handle shouldn't carry inspectable runtime state — no
      // backend, no config, no transports, no captured loggers.
      expect(methodKeys).not.toContain('backend');
      expect(methodKeys).not.toContain('config');
      expect(methodKeys).not.toContain('transports');
      expect(methodKeys).not.toContain('runtime');
    }
  });
});
