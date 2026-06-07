/**
 * Integration test: breadcrumbs end-to-end (specs/016-error-breadcrumbs —
 * BC-9, BC-11, FR-011, Edge Cases). Verifies integrity, origin attribution,
 * dropped-not-recorded, no re-entrancy, and multi-transport enrichment.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureLogging,
  createLogger,
  getRootLogger,
} from '../../src/index.js';
import type { LogEvent, Redactor } from '../../src/api/types.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const TRAIL = 'safesignal.breadcrumbs';

function errorsOf(cap: CapturingTransport): LogEvent[] {
  return cap.calls.filter((e) => e.level === 'error');
}
function trail(e: LogEvent) {
  return e.attributes[TRAIL] as unknown as Array<{
    message: string;
    app?: string;
    module?: string;
  }>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('breadcrumbs integration', () => {
  let cap: CapturingTransport;

  beforeEach(() => {
    cap = makeCapturingTransport();
    configureLogging({
      application: { name: 'host-app' },
      environment: 'test',
      level: 'debug',
      transports: [cap],
      breadcrumbs: true,
    });
  });

  it('BC-9: non-error events are unchanged and the delivered error is not mutated later', () => {
    const log = createLogger();
    log.info('first');
    expect(
      cap.calls.find((e) => e.message === 'first')!.attributes[TRAIL],
    ).toBeUndefined();

    log.error('boom1');
    const err1 = errorsOf(cap)[0]!;
    const lenAtDelivery = trail(err1).length;

    // Emitting more must not retro-mutate the already-delivered error event.
    log.info('later');
    log.info('later2');
    expect(trail(err1)).toHaveLength(lenAtDelivery);
  });

  it('FR-011: host vs. federated-module breadcrumbs stay origin-distinguishable', () => {
    getRootLogger().info('from host');
    createLogger({ module: { name: 'cart' } }).info('from cart module');
    getRootLogger().error('boom');

    const t = trail(errorsOf(cap)[0]!);
    const host = t.find((b) => b.message === 'from host')!;
    const cart = t.find((b) => b.message === 'from cart module')!;
    expect(host.app).toBe('host-app');
    expect(host.module).toBeUndefined();
    expect(cart.module).toBe('cart');
  });

  it('no re-entrancy: emitting one error produces exactly one delivered event', () => {
    createLogger().error('solo');
    expect(cap.calls).toHaveLength(1);
  });

  it('two transports both receive the enriched error event', () => {
    const cap2 = makeCapturingTransport('cap2');
    configureLogging({
      environment: 'test',
      level: 'debug',
      transports: [cap, cap2],
      breadcrumbs: true,
    });
    const log = createLogger();
    log.info('lead-up');
    log.error('boom');
    expect(trail(errorsOf(cap).at(-1)!)).toHaveLength(1);
    expect(trail(errorsOf(cap2).at(-1)!)).toHaveLength(1);
  });

  it('Edge case: a pipeline-dropped event is not recorded into the trail', () => {
    // A redactor that DROPS events carrying { drop: true } (returns null).
    const droppingRedactor: Redactor = (e) =>
      e.attributes.drop === true ? null : e;
    const cap3 = makeCapturingTransport('cap3');
    configureLogging({
      environment: 'test',
      level: 'debug',
      transports: [cap3],
      redactor: droppingRedactor,
      breadcrumbs: true,
    });
    const log = createLogger();
    log.info('kept');
    log.info('dropped', { drop: true }); // dropped by the redactor
    log.error('boom');
    const t = errorsOf(cap3).at(-1)!.attributes[TRAIL] as unknown as Array<{
      message: string;
    }>;
    expect(t.map((b) => b.message)).toEqual(['kept']); // 'dropped' never recorded
  });
});
