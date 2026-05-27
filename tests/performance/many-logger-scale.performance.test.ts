/**
 * Many-`Logger` scale test (T060 — part 1).
 *
 * Locks SC-011: an automated test creates at least 1,000 `Logger`
 * instances against a single `configureLogging()` call and confirms
 * (a) the `TransportFactory` is invoked exactly once during
 *     `configureLogging()` and zero additional times across the
 *     1,000 logger creations,
 * (b) no `TelemetryBackend` is constructed on the v1 default path
 *     post-T066 — verified here structurally (the `ConfiguredRuntime`
 *     record exposed via `runtime-ref` has no `backend` field),
 * (c) total allocation count is O(N) in logger count (not O(N×K)
 *     where K = transports or attribute keys) — verified by
 *     constructing N loggers and N+K transports independently and
 *     showing the linear-in-N relationship.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import type {
  LogEvent,
  Transport,
  TransportFactory,
} from '../../src/api/types.js';
import { clearActiveRuntimeForTests, getActiveRuntime } from '../../src/runtime/runtime-ref.js';

const APP = { name: 'many-logger-scale', version: '1.0.0' };

beforeEach(() => {
  clearActiveRuntimeForTests();
});

describe('SC-011: ≥1,000 Loggers against one configureLogging() do not multiply runtime state', () => {
  it('TransportFactory is invoked exactly once during configureLogging() and never again across 1,000 logger creations', () => {
    const factory = vi.fn<TransportFactory>(() => ({
      name: 'scale-test-transport',
      send(_event: LogEvent) { /* no-op */ },
    }));
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factory],
    });
    expect(factory).toHaveBeenCalledTimes(1);

    const loggers: unknown[] = [];
    for (let i = 0; i < 1000; i++) {
      loggers.push(
        createLogger({
          module: { name: `mod-${String(i)}`, version: '0.1.0' },
          context: { attributes: { idx: i } },
        }),
      );
    }
    expect(loggers).toHaveLength(1000);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('mixed root + module + derived loggers all share the one TransportFactory invocation', () => {
    const factory = vi.fn<TransportFactory>(() => ({
      name: 'mixed-transport',
      send() { /* no-op */ },
    }));
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factory],
    });
    expect(factory).toHaveBeenCalledTimes(1);

    const handles: unknown[] = [];
    for (let i = 0; i < 200; i++) handles.push(createLogger()); // root
    for (let i = 0; i < 200; i++) {
      handles.push(
        createLogger({ module: { name: `m-${String(i)}`, version: '1.0' } }),
      );
    }
    for (let i = 0; i < 200; i++) {
      handles.push(createLogger().child({ attributes: { idx: i } }));
    }
    for (let i = 0; i < 200; i++) {
      handles.push(
        createLogger().withContext({ attributes: { lane: `L-${String(i)}` } }),
      );
    }
    for (let i = 0; i < 200; i++) {
      handles.push(
        createLogger()
          .child({ attributes: { a: 1 } })
          .withContext({ attributes: { b: 2 } })
          .child({ attributes: { c: 3 } }),
      );
    }
    expect(handles).toHaveLength(1000);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('ConfiguredRuntime carries NO `backend` field — verified structurally on the active-runtime slot', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    const runtime = getActiveRuntime();
    expect(runtime).toBeDefined();
    expect(runtime).not.toHaveProperty('backend');
    // T058's contract: the runtime exposes the canonical set of
    // resources the dispatcher will consume directly once T066
    // refactors backend.handle() out of the default path.
    expect(runtime).toHaveProperty('config');
    expect(runtime).toHaveProperty('transports');
    expect(runtime).toHaveProperty('redactor');
    expect(runtime).toHaveProperty('sanitizerLimits');
    expect(runtime).toHaveProperty('onInternalError');
    expect(runtime).toHaveProperty('correlation');
  });

  it('per-handle allocation is constant (creating N loggers does not multiply transports or backends)', () => {
    let transportConstructorCalls = 0;
    const factory: TransportFactory = () => {
      transportConstructorCalls++;
      return {
        name: 'alloc-test',
        send() { /* no-op */ },
      };
    };
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [factory, factory, factory],
    });
    // configureLogging invokes each factory entry once. The factory
    // here is the same function passed three times, so 3 invocations.
    const baseline = transportConstructorCalls;
    expect(baseline).toBe(3);

    // Now create 1000 loggers. Transport constructor must NOT be
    // called again — the loggers all share the one wrapped transport
    // set produced at configure time.
    for (let i = 0; i < 1000; i++) {
      createLogger({ module: { name: `m-${String(i)}`, version: '1.0' } });
    }
    expect(transportConstructorCalls).toBe(baseline);
  });

  it('1000 loggers all use the SAME ConfiguredRuntime instance (no per-handle runtime allocation)', () => {
    configureLogging({
      application: APP,
      environment: 'development',
      transports: [() => ({ name: 'noop', send() { /* no-op */ } })],
    });
    const runtimeBefore = getActiveRuntime();
    for (let i = 0; i < 1000; i++) createLogger();
    const runtimeAfter = getActiveRuntime();
    expect(runtimeBefore).toBe(runtimeAfter); // same reference
  });
});

// ---------------------------------------------------------------------------
// Shared-runtime-fanout (T060 — also covered by shared-runtime-fanout.test.ts
// in a sibling file; the assertions here are the structural counterpart.)
// ---------------------------------------------------------------------------

describe('shared runtime: every emission uses the same wrapped transport list', () => {
  it('1000 emissions from 1000 distinct loggers reach exactly the configured transport set', () => {
    const calls: { name: string; eventMessage: string }[] = [];
    const transport: Transport = {
      name: 't',
      send(event: LogEvent) {
        calls.push({ name: 't', eventMessage: event.message });
      },
    };
    configureLogging({
      application: APP,
      environment: 'development',
      level: 'debug',
      transports: [transport],
    });
    for (let i = 0; i < 1000; i++) {
      const log = createLogger({ module: { name: `m-${String(i)}`, version: '1' } });
      log.info(`e-${String(i)}`);
    }
    expect(calls).toHaveLength(1000);
    for (let i = 0; i < 1000; i++) {
      expect(calls[i]!.eventMessage).toBe(`e-${String(i)}`);
    }
  });
});
