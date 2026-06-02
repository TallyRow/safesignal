/**
 * Unit test: extractCauseChain (specs/016-error-breadcrumbs — BC-4, BC-5).
 */

import { describe, expect, it } from 'vitest';
import {
  extractCauseChain,
  MAX_CAUSE_DEPTH,
} from '../../../src/breadcrumbs/breadcrumb-buffer.js';

describe('extractCauseChain', () => {
  it('returns [] when there is no cause', () => {
    expect(extractCauseChain(new Error('top'), MAX_CAUSE_DEPTH)).toEqual([]);
    expect(extractCauseChain('plain', MAX_CAUSE_DEPTH)).toEqual([]);
    expect(extractCauseChain(undefined, MAX_CAUSE_DEPTH)).toEqual([]);
  });

  it('unrolls nested causes outermost→root, excluding the top error', () => {
    const root = new TypeError('root');
    const mid = new Error('mid', { cause: root });
    const top = new Error('top', { cause: mid });
    expect(extractCauseChain(top, MAX_CAUSE_DEPTH)).toEqual([
      { name: 'Error', message: 'mid' },
      { name: 'TypeError', message: 'root' },
    ]);
  });

  it('reduces a non-Error cause via String()', () => {
    const top = new Error('top', { cause: 42 });
    expect(extractCauseChain(top, MAX_CAUSE_DEPTH)).toEqual([
      { name: 'NonError', message: '42' },
    ]);
  });

  it('is depth-bounded', () => {
    // Build a chain deeper than the bound.
    let cur = new Error('leaf');
    for (let i = 0; i < 20; i++) cur = new Error(`e${i}`, { cause: cur });
    const chain = extractCauseChain(cur, MAX_CAUSE_DEPTH);
    expect(chain).toHaveLength(MAX_CAUSE_DEPTH);
  });

  it('is cycle-safe (no infinite loop)', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as { cause?: unknown }).cause = b;
    (b as { cause?: unknown }).cause = a;
    const chain = extractCauseChain(a, MAX_CAUSE_DEPTH);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain.length).toBeLessThanOrEqual(MAX_CAUSE_DEPTH);
  });
});
