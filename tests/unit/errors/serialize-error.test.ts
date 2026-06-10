/**
 * `serializeError()` unit tests — ES-2 (cycles, NonError coercion),
 * cross-realm structural detection (R3), depth/budget interaction on
 * chains. US2 appends ES-5 budget tests; see also
 * `serialize-error-failsafe.test.ts` (ES-8).
 */

import { describe, expect, it } from 'vitest';

import { serializeError } from '../../../src/errors/serialize-error.js';

const DEFAULT_LIMITS = {
  maxCauseDepth: 8,
  maxMembers: 10,
  maxFields: 16,
  maxNodes: 50,
};

describe('ES-2: cyclic cause chains terminate', () => {
  it('a two-error cycle terminates after the visited node, without hanging', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as Error & { cause: unknown }).cause = b;
    (b as Error & { cause: unknown }).cause = a;

    const info = serializeError(a, DEFAULT_LIMITS);
    expect(info.causes).toEqual([{ name: 'Error', message: 'b' }]);
  });

  it('cycle termination does NOT set causesTruncated (a cycle is an end, not a clip)', () => {
    const a = new Error('a');
    const b = new Error('b');
    (a as Error & { cause: unknown }).cause = b;
    (b as Error & { cause: unknown }).cause = a;

    const info = serializeError(a, DEFAULT_LIMITS);
    expect(info.causesTruncated).toBeUndefined();
    expect(info.budgetExhausted).toBeUndefined();
  });

  it('a self-cycle yields no causes at all', () => {
    const a = new Error('a');
    (a as Error & { cause: unknown }).cause = a;

    const info = serializeError(a, DEFAULT_LIMITS);
    expect(info.causes).toBeUndefined();
  });
});

describe('R3: cross-realm / structural error-likeness', () => {
  it('an error-shaped plain object (failing instanceof) serializes structurally', () => {
    const foreign = {
      name: 'DOMException',
      message: 'The operation was aborted.',
      stack: 'DOMException: aborted\n  at fetch',
      cause: { name: 'Error', message: 'underlying' },
    };

    const info = serializeError(foreign, DEFAULT_LIMITS);
    expect(info.name).toBe('DOMException');
    expect(info.message).toBe('The operation was aborted.');
    expect(info.stack).toBe('DOMException: aborted\n  at fetch');
    expect(info.causes).toEqual([{ name: 'Error', message: 'underlying' }]);
  });

  it('a non-error-like value reduces to NonError with no deep capture', () => {
    const info = serializeError('just a string', DEFAULT_LIMITS);
    expect(info).toEqual({ name: 'NonError', message: 'just a string' });
  });

  it('a null cause coerces to NonError and ends the chain', () => {
    const top = new Error('top');
    (top as Error & { cause: unknown }).cause = null;

    const info = serializeError(top, DEFAULT_LIMITS);
    expect(info.causes).toEqual([{ name: 'NonError', message: 'null' }]);
  });
});

describe('depth and budget interaction on chains', () => {
  function chainOf(length: number): Error {
    let cursor = new Error(`link-${String(length)}`);
    for (let i = length - 1; i >= 1; i--) {
      cursor = new Error(`link-${String(i)}`, { cause: cursor });
    }
    return new Error('top', { cause: cursor });
  }

  it('maxCauseDepth clips before the budget when depth is the smaller bound', () => {
    const info = serializeError(chainOf(20), {
      ...DEFAULT_LIMITS,
      maxCauseDepth: 3,
    });
    expect(info.causes).toHaveLength(3);
    expect(info.causesTruncated).toBe(true);
    expect(info.budgetExhausted).toBeUndefined();
  });

  it('the node budget clips the chain and sets both markers when budget is smaller', () => {
    const info = serializeError(chainOf(20), {
      ...DEFAULT_LIMITS,
      maxCauseDepth: 16,
      maxNodes: 4,
    });
    expect(info.causes).toHaveLength(4);
    expect(info.causesTruncated).toBe(true);
    expect(info.budgetExhausted).toBe(true);
  });

  it('a 1000-link chain terminates promptly under default limits (SC-006 chain aspect)', () => {
    const info = serializeError(chainOf(1000), DEFAULT_LIMITS);
    expect(info.causes).toHaveLength(8);
    expect(info.causesTruncated).toBe(true);
  });
});
