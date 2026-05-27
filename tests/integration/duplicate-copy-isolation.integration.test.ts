/**
 * Duplicate-package-copy isolation integration test (T064).
 *
 * Locks FR-033's documented classification: **isolated**. When
 * module bundlers cause multiple physical copies of this package to
 * load on a single page, each copy maintains its own internal
 * `runtime-ref` slot — there is NO shared global registry. Each
 * copy must be configured independently; emitting through one
 * copy's logger reaches only that copy's transports.
 *
 * Strategy: use `vi.isolateModules()` to load the package's runtime
 * module + `configureLogging` factory inside two independent
 * module-registry isolates. Each isolate gets its own
 * `runtime-ref.ts` instance (its own `let active`), its own
 * `configureLogging` function, and its own `createLogger`. We
 * configure each side with distinct transports and assert no
 * cross-routing.
 *
 * The vi.isolateModules approach exercises the same property that
 * a module-federation bundler triggers in production: two physical
 * copies, each with their own internal closure-private state, no
 * runtime back door between them.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

beforeEach(() => {
  // Reset the test-realm's own runtime-ref slot. Each isolated module
  // load will have its own slot independent of this realm.
  clearActiveRuntimeForTests();
});

/**
 * Helper: load a fresh copy of the package's public surface against
 * a freshly-reset module registry. Each call to `vi.resetModules()`
 * clears the module cache; subsequent dynamic imports produce
 * brand-new module instances — including a brand-new
 * `runtime-ref.ts` instance with its own `let active` slot. That
 * matches the duplicate-package-copy property in production: two
 * physical bundles, each closed over their own runtime-ref state,
 * with no globalThis/Symbol.for back door connecting them.
 *
 * The returned function bindings retain CLOSURE references to the
 * specific module instance they were imported from, so calls on
 * `copyA.configureLogging` operate on copy A's slot exclusively,
 * even after copy B is loaded later.
 */
async function loadIsolatedCopy(): Promise<{
  configureLogging: typeof import('../../src/index.js').configureLogging;
  createLogger: typeof import('../../src/index.js').createLogger;
  clearActiveRuntimeForTests: typeof clearActiveRuntimeForTests;
}> {
  vi.resetModules();
  const pkg = await import('../../src/index.js');
  const slot = await import('../../src/runtime/runtime-ref.js');
  return {
    configureLogging: pkg.configureLogging,
    createLogger: pkg.createLogger,
    clearActiveRuntimeForTests: slot.clearActiveRuntimeForTests,
  };
}

// ---------------------------------------------------------------------------
// FR-033: isolated classification
// ---------------------------------------------------------------------------

describe('FR-033: each physical package copy owns an independent ConfiguredRuntime', () => {
  it('two isolated copies each maintain their own active-runtime slot; configuring one does not affect the other', async () => {
    const copyA = await loadIsolatedCopy();
    const copyB = await loadIsolatedCopy();

    const tA = makeCapturingTransport('copy-A-transport');
    const tB = makeCapturingTransport('copy-B-transport');

    copyA.configureLogging({
      application: { name: 'app-A', version: '1.0' },
      environment: 'development',
      level: 'debug',
      transports: [tA],
    });

    // copy B has NOT been configured. It has its own slot — separate
    // from copy A's. Configuring B with its own transports.
    copyB.configureLogging({
      application: { name: 'app-B', version: '2.0' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });

    const logA = copyA.createLogger({ module: { name: 'mod-in-A', version: '1' } });
    const logB = copyB.createLogger({ module: { name: 'mod-in-B', version: '1' } });

    logA.info('from-A');
    logB.info('from-B');

    expect(tA.calls).toHaveLength(1);
    expect(tB.calls).toHaveLength(1);
    expect(tA.calls[0]!.message).toBe('from-A');
    expect(tA.calls[0]!.context.application).toEqual({ name: 'app-A', version: '1.0' });
    expect(tB.calls[0]!.message).toBe('from-B');
    expect(tB.calls[0]!.context.application).toEqual({ name: 'app-B', version: '2.0' });
  });

  it('emitting through copy A reaches only copy A\'s transports — not copy B\'s', async () => {
    const copyA = await loadIsolatedCopy();
    const copyB = await loadIsolatedCopy();

    const tA = makeCapturingTransport('A');
    const tB = makeCapturingTransport('B');

    copyA.configureLogging({
      application: { name: 'app-A' },
      environment: 'development',
      level: 'debug',
      transports: [tA],
    });
    copyB.configureLogging({
      application: { name: 'app-B' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });

    const logA = copyA.createLogger();
    for (let i = 0; i < 50; i++) logA.info(`A-${String(i)}`);

    expect(tA.calls).toHaveLength(50);
    expect(tB.calls).toHaveLength(0);
  });

  it('reconfiguring one copy does not invalidate the other copy\'s runtime', async () => {
    const copyA = await loadIsolatedCopy();
    const copyB = await loadIsolatedCopy();

    const tA1 = makeCapturingTransport('A1');
    const tA2 = makeCapturingTransport('A2');
    const tB = makeCapturingTransport('B');

    copyA.configureLogging({
      application: { name: 'app-A' },
      environment: 'development',
      level: 'debug',
      transports: [tA1],
    });
    copyB.configureLogging({
      application: { name: 'app-B' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });

    const logA = copyA.createLogger();
    const logB = copyB.createLogger();
    logA.info('before-reconfig');
    logB.info('B-first');

    // Reconfigure copy A only. Copy B's runtime stays untouched.
    copyA.configureLogging({
      application: { name: 'app-A' },
      environment: 'development',
      level: 'debug',
      transports: [tA2],
    });

    logA.info('after-reconfig');
    logB.info('B-second');

    expect(tA1.calls).toHaveLength(1);
    expect(tA1.calls[0]!.message).toBe('before-reconfig');
    expect(tA2.calls).toHaveLength(1);
    expect(tA2.calls[0]!.message).toBe('after-reconfig');
    expect(tB.calls).toHaveLength(2);
    expect(tB.calls.map((c) => c.message)).toEqual(['B-first', 'B-second']);
  });

  it('no globalThis / Symbol.for / window / document channel cross-routes events between copies', async () => {
    const copyA = await loadIsolatedCopy();
    const copyB = await loadIsolatedCopy();

    const tA = makeCapturingTransport('A');
    const tB = makeCapturingTransport('B');

    copyA.configureLogging({
      application: { name: 'app-A' },
      environment: 'development',
      level: 'debug',
      transports: [tA],
    });
    copyB.configureLogging({
      application: { name: 'app-B' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });

    // Snapshot globalThis keys before any emission.
    const globalKeysBefore = new Set(Object.keys(globalThis));

    const logA = copyA.createLogger();
    logA.info('test-emission');

    // No new global was created by the emission path.
    const globalKeysAfter = new Set(Object.keys(globalThis));
    expect([...globalKeysAfter].filter((k) => !globalKeysBefore.has(k))).toEqual(
      [],
    );

    // No `Symbol.for(...)` registry entry exists that points at the
    // package's runtime. We can't enumerate the shared symbol
    // registry directly, but we can probe for any of the obvious
    // names the package could have used.
    const probeNames = [
      '@your-org/frontend-logging-sdk/runtime',
      'frontend-logging-sdk/runtime',
      'frontend-logging-sdk',
      'logging-sdk/active-runtime',
    ];
    for (const name of probeNames) {
      const sym = Symbol.for(name);
      const value = (globalThis as Record<symbol, unknown>)[sym];
      expect(value).toBeUndefined();
    }
  });

  it('a Logger reference from copy A held against copy B\'s configureLogging() does not cross-route events', async () => {
    // Two copies of the package. Logger handles from copy A read
    // through copy A's getActiveRuntime() (it's a closure into copy
    // A's runtime-ref module). Copy B has its own getActiveRuntime().
    // A logger from copy A cannot have its emissions delivered by
    // copy B's transports.
    const copyA = await loadIsolatedCopy();
    const copyB = await loadIsolatedCopy();

    const tA = makeCapturingTransport('A');
    const tB = makeCapturingTransport('B');

    copyA.configureLogging({
      application: { name: 'app-A' },
      environment: 'development',
      level: 'debug',
      transports: [tA],
    });
    copyB.configureLogging({
      application: { name: 'app-B' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });

    const logA = copyA.createLogger();
    // Re-call copy B's configureLogging again from the test realm
    // mid-test to verify copy A's logger still emits to tA, not tB.
    copyB.configureLogging({
      application: { name: 'app-B-reconfigured' },
      environment: 'development',
      level: 'debug',
      transports: [tB],
    });
    logA.info('post-B-reconfig');

    expect(tA.calls).toHaveLength(1);
    expect(tA.calls[0]!.message).toBe('post-B-reconfig');
    expect(tA.calls[0]!.context.application?.name).toBe('app-A');
    expect(tB.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Documented sharing pattern: module-federation singleton is a BUILD-time
// concern, NOT a runtime back door.
// ---------------------------------------------------------------------------

describe('FR-033 documentation: cross-copy sharing is the bundler\'s job, not the package\'s', () => {
  it('the package does not look up a shared runtime via globalThis on import', async () => {
    // Plant a fake shared-runtime sentinel on globalThis BEFORE
    // loading a fresh copy. If the package were to look for a
    // shared registry, it would pick this up — and we'd see
    // cross-routing. Since the package does NOT, the new copy gets
    // a fresh, isolated runtime.
    const sentinel = Symbol.for('frontend-logging-sdk:shared-runtime');
    (globalThis as Record<symbol, unknown>)[sentinel] = {
      hijackedRuntime: true,
    };

    try {
      const copy = await loadIsolatedCopy();
      const cap = makeCapturingTransport('cap');
      copy.configureLogging({
        application: { name: 'app' },
        environment: 'development',
        level: 'debug',
        transports: [cap],
      });
      const log = copy.createLogger();
      log.info('test');
      expect(cap.calls).toHaveLength(1);
      // The package did NOT short-circuit through the sentinel —
      // emission went through the fresh copy's own slot.
      expect(cap.calls[0]!.context.application?.name).toBe('app');
    } finally {
      delete (globalThis as Record<symbol, unknown>)[sentinel];
    }
  });
});
