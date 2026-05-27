/**
 * Federated-context integration test (T053).
 *
 * Locks US4's load-bearing behavior end-to-end:
 *   - A host logger and one or more federated-module loggers share
 *     the same `configureLogging()` call, the same transports, and
 *     the same `application` identity.
 *   - Each module logger carries its own `context.module.{name,version}`
 *     so events from different origins remain distinguishable at the
 *     transport.
 *   - `child()` and `withContext()` derivation produces NEW loggers
 *     whose context layers over the parent's. Parents are NOT mutated
 *     by any child derivation; siblings do NOT see each other's
 *     context.
 *   - The merge order (root → per-logger → child → correlation) holds
 *     across host and module loggers consistently.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import type { LogEvent } from '../../src/api/types.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const HOST_APP = { name: 'checkout-web', version: '2026.05.0' };

let capture = makeCapturingTransport('federated');

beforeEach(() => {
  capture = makeCapturingTransport('federated');
  configureLogging({
    application: HOST_APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

function pick(predicate: (event: LogEvent) => boolean): LogEvent[] {
  return capture.calls.filter(predicate);
}

// ---------------------------------------------------------------------------
// Host + module share one configureLogging() call
// ---------------------------------------------------------------------------

describe('Host + module loggers share one configureLogging() call', () => {
  it('every event reaches the host-configured transport (host + modules + derived all flow through the same SafeTransport list)', () => {
    const hostLog = createLogger();
    const modA = createLogger({ module: { name: 'product-recs', version: '0.4.2' } });
    const modB = createLogger({ module: { name: 'cart-widget', version: '1.0.0' } });

    hostLog.info('host-1');
    modA.info('mod-a-1');
    modB.info('mod-b-1');
    modA.warn('mod-a-2');
    hostLog.error('host-2');

    expect(capture.calls).toHaveLength(5);
  });

  it('every event carries the host application identity (modules do NOT override application by default)', () => {
    const hostLog = createLogger();
    const modA = createLogger({ module: { name: 'product-recs', version: '0.4.2' } });

    hostLog.info('host');
    modA.info('mod-a');

    for (const event of capture.calls) {
      expect(event.context.application?.name).toBe(HOST_APP.name);
      expect(event.context.application?.version).toBe(HOST_APP.version);
    }
  });

  it('host events have NO module identity', () => {
    const hostLog = createLogger();
    hostLog.info('host event');
    expect(capture.calls[0]!.context.module).toBeUndefined();
  });

  it('module events have distinct module.name and module.version per logger', () => {
    const modA = createLogger({ module: { name: 'product-recs', version: '0.4.2' } });
    const modB = createLogger({ module: { name: 'cart-widget', version: '1.0.0' } });

    modA.info('a-event');
    modB.info('b-event');

    const aEvents = pick((e) => e.message === 'a-event');
    const bEvents = pick((e) => e.message === 'b-event');

    expect(aEvents[0]!.context.module).toEqual({
      name: 'product-recs',
      version: '0.4.2',
    });
    expect(bEvents[0]!.context.module).toEqual({
      name: 'cart-widget',
      version: '1.0.0',
    });
  });

  it('multiple modules can emit concurrently and stay attributed correctly', () => {
    const modules = ['mod-1', 'mod-2', 'mod-3', 'mod-4', 'mod-5'];
    const loggers = modules.map((name) =>
      createLogger({ module: { name, version: '1.0' } }),
    );

    // Interleave emissions to simulate concurrent module activity.
    for (let i = 0; i < 10; i++) {
      for (let m = 0; m < loggers.length; m++) {
        loggers[m]!.info(`evt-${String(i)}`, { from: modules[m] });
      }
    }

    expect(capture.calls).toHaveLength(50);
    for (const event of capture.calls) {
      const moduleName = event.context.module?.name;
      const fromAttr = event.attributes.from;
      // The module identity in context matches the attribute from the
      // calling module — proving no cross-attribution.
      expect(moduleName).toBe(fromAttr);
    }
  });
});

// ---------------------------------------------------------------------------
// child() / withContext() do not mutate parents
// ---------------------------------------------------------------------------

describe('child() and withContext() derivation does not mutate parents', () => {
  it('a child logger emits with the child context layered over the parent', () => {
    const parent = createLogger();
    const child = parent.child({ attributes: { requestId: 'r-1' } });
    child.info('child event');
    expect(capture.calls[0]!.context.attributes?.requestId).toBe('r-1');
  });

  it('the parent does NOT pick up the child\'s context after a child emission', () => {
    const parent = createLogger();
    const child = parent.child({ attributes: { requestId: 'r-1' } });
    child.info('child event');
    parent.info('parent event');
    expect(capture.calls[0]!.context.attributes?.requestId).toBe('r-1');
    expect(capture.calls[1]!.context.attributes?.requestId).toBeUndefined();
  });

  it('two sibling children carry independent context layers (no cross-pollination)', () => {
    const parent = createLogger();
    const childA = parent.child({ attributes: { lane: 'A' } });
    const childB = parent.child({ attributes: { lane: 'B' } });
    childA.info('a');
    childB.info('b');
    parent.info('p');

    expect(capture.calls[0]!.context.attributes?.lane).toBe('A');
    expect(capture.calls[1]!.context.attributes?.lane).toBe('B');
    expect(capture.calls[2]!.context.attributes?.lane).toBeUndefined();
  });

  it('grandchild logger inherits and extends parent + child layers', () => {
    const parent = createLogger();
    const child = parent.child({ attributes: { lane: 'A' } });
    const grandchild = child.child({ attributes: { requestId: 'r-1' } });
    grandchild.info('gc');
    expect(capture.calls[0]!.context.attributes).toMatchObject({
      lane: 'A',
      requestId: 'r-1',
    });
  });

  it('withContext() behaves the same as child() (alias)', () => {
    const parent = createLogger();
    const derivedViaChild = parent.child({ attributes: { kind: 'child' } });
    const derivedViaWith = parent.withContext({ attributes: { kind: 'withContext' } });
    derivedViaChild.info('a');
    derivedViaWith.info('b');
    expect(capture.calls[0]!.context.attributes?.kind).toBe('child');
    expect(capture.calls[1]!.context.attributes?.kind).toBe('withContext');
  });

  it('child() on a module logger preserves the module identity in derived events', () => {
    const modLog = createLogger({ module: { name: 'shop', version: '1.0' } });
    const requestLog = modLog.child({ attributes: { requestId: 'r-1' } });
    requestLog.info('request');
    expect(capture.calls[0]!.context.module).toEqual({ name: 'shop', version: '1.0' });
    expect(capture.calls[0]!.context.attributes?.requestId).toBe('r-1');
  });

  it('a child layer can OVERRIDE the parent\'s module identity (later wins)', () => {
    const modLog = createLogger({ module: { name: 'shop', version: '1.0' } });
    const overrideLog = modLog.child({
      module: { name: 'shop-checkout', version: '1.1' },
    });
    overrideLog.info('override');
    modLog.info('original');
    expect(capture.calls[0]!.context.module).toEqual({
      name: 'shop-checkout',
      version: '1.1',
    });
    expect(capture.calls[1]!.context.module).toEqual({
      name: 'shop',
      version: '1.0',
    });
  });
});

// ---------------------------------------------------------------------------
// Merge order across host + module + child + correlation
// ---------------------------------------------------------------------------

describe('Merge order: root → per-logger → child → correlation', () => {
  it('correlation() takes highest precedence; child overrides per-logger; per-logger overrides root', () => {
    configureLogging({
      application: HOST_APP,
      environment: 'development',
      level: 'debug',
      transports: [capture],
      context: { attributes: { layer: 'root', from_root: true } },
      correlation: () => ({ attributes: { layer: 'correlation', from_corr: true } }),
    });
    const modLog = createLogger({
      module: { name: 'mod', version: '1' },
      context: { attributes: { layer: 'logger', from_logger: true } },
    });
    const childLog = modLog.child({
      attributes: { layer: 'child', from_child: true },
    });
    childLog.info('all-layers');

    const ctx = capture.calls[0]!.context.attributes!;
    expect(ctx.layer).toBe('correlation'); // correlation wins for `layer`
    // Earlier layers' unique keys are preserved by the merge.
    expect(ctx.from_root).toBe(true);
    expect(ctx.from_logger).toBe(true);
    expect(ctx.from_child).toBe(true);
    expect(ctx.from_corr).toBe(true);
  });
});
