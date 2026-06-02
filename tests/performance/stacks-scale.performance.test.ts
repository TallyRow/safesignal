/**
 * Performance/scale test: stack normalization is runtime-level with no
 * per-`Logger` cost (specs/017-readable-error-stacks — ST-10, SC-006).
 *
 * Deterministic structural assertions (no wall-clock thresholds): the normalizer
 * is configured once at the runtime level; creating many loggers triggers no
 * normalization, and a re-config is isolated.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const STACK_KEY = 'safesignal.stack';

afterEach(() => vi.restoreAllMocks());

describe('error stacks scale (ST-10)', () => {
  it('the normalizer runs only per error — creating loggers triggers 0 calls', () => {
    const normalize = vi.fn(() => [
      { function: 'f', file: 'a.js', line: 1, column: 1 },
    ]);
    const cap: CapturingTransport = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      level: 'debug',
      transports: [cap],
      normalizeStack: normalize,
    });

    // Creating many loggers + many NON-error emits → 0 normalization.
    for (let i = 0; i < 500; i++) {
      const log = createLogger({ name: `l${i}` });
      log.info(`info ${i}`);
      log.warn(`warn ${i}`);
    }
    expect(normalize).not.toHaveBeenCalled();

    // One error → exactly one normalization (runtime-level, shared).
    const e = new Error('boom');
    e.stack = 'Error: boom\n    at f (https://a/x.js:1:1)';
    createLogger().error('boom', {}, e);
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(cap.calls.at(-1)!.attributes[STACK_KEY]).toBeDefined();
  });

  it('a re-configureLogging() swaps the normalizer (isolated)', () => {
    const cap2: CapturingTransport = makeCapturingTransport();
    configureLogging({ environment: 'test', transports: [cap2] }); // no normalizeStack
    const e = new Error('boom');
    e.stack = 'Error: boom\n    at f (https://a/x.js:1:1)';
    createLogger().error('boom', {}, e);
    expect(cap2.calls.at(-1)!.attributes[STACK_KEY]).toBeUndefined();
  });
});
