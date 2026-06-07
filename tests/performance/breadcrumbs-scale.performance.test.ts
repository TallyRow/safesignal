/**
 * Performance/scale test: breadcrumbs stay bounded over volume and add no
 * per-`Logger` cost (specs/016-error-breadcrumbs — BC-6, BC-11, SC-003/SC-007).
 *
 * Deterministic structural assertions (no wall-clock thresholds): the buffer is
 * bounded to `maxEvents` regardless of how many events are logged, and is a
 * single shared runtime resource across many loggers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const TRAIL = 'safesignal.breadcrumbs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('breadcrumbs scale', () => {
  it('BC-6: logging M ≫ maxEvents keeps the trail bounded to the most recent maxEvents', () => {
    const cap: CapturingTransport = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      breadcrumbs: { maxEvents: 10 },
    });
    const log = createLogger();
    const M = 10_000;
    for (let i = 0; i < M; i++) log.warn(`e${i}`);
    log.error('boom');

    const trail = cap.calls.at(-1)!.attributes[TRAIL] as unknown as Array<{
      message: string;
    }>;
    expect(trail).toHaveLength(10);
    expect(trail.map((b) => b.message)).toEqual([
      'e9990',
      'e9991',
      'e9992',
      'e9993',
      'e9994',
      'e9995',
      'e9996',
      'e9997',
      'e9998',
      'e9999',
    ]);
  });

  it('BC-11: one shared buffer across many loggers; a re-config yields a fresh isolated buffer', () => {
    const cap: CapturingTransport = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      breadcrumbs: { maxEvents: 5 },
    });
    // Many loggers writing into the same runtime buffer.
    for (let i = 0; i < 500; i++) createLogger({ name: `l${i}` }).warn(`w${i}`);
    createLogger().error('boom');
    const trail = cap.calls.at(-1)!.attributes[TRAIL] as unknown as unknown[];
    expect(trail).toHaveLength(5); // shared + bounded, not 500 per-logger buffers

    // Re-configure → fresh, isolated buffer (no carryover).
    const cap2 = makeCapturingTransport('cap2');
    configureLogging({
      environment: 'test',
      transports: [cap2],
      breadcrumbs: { maxEvents: 5 },
    });
    createLogger().error('fresh');
    expect(cap2.calls.at(-1)!.attributes[TRAIL]).toBeUndefined(); // empty new buffer
  });
});
