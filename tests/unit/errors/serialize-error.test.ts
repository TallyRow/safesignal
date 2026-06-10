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

// ---------------------------------------------------------------------------
// ES-5 — node budget binding (pathological inputs, SC-006) [US2]
// ---------------------------------------------------------------------------

interface Nodeish {
  causes?: Nodeish[];
  members?: Nodeish[];
}

function countNodes(info: Nodeish): number {
  let count = 0;
  const walk = (node: Nodeish): void => {
    for (const child of node.causes ?? []) {
      count++;
      walk(child);
    }
    for (const child of node.members ?? []) {
      count++;
      walk(child);
    }
  };
  walk(info);
  return count;
}

describe('ES-5: the node budget is the binding outer limit', () => {
  it('a 1000-member aggregate clips to maxMembers with the original count recorded', () => {
    const members = Array.from(
      { length: 1000 },
      (_, i) => new Error(`m${String(i)}`),
    );
    const info = serializeError(
      new AggregateError(members, 'huge'),
      DEFAULT_LIMITS,
    );
    expect(info.members).toHaveLength(10);
    expect(info.membersTotal).toBe(1000);
    expect(info.budgetExhausted).toBeUndefined(); // inner limit clipped first
  });

  it('deeply nested aggregates never exceed maxNodes and set budgetExhausted', () => {
    // Each level: aggregate of 3 members, nested 10 deep - far over budget 12.
    const makeTree = (depth: number): Error =>
      depth === 0
        ? new Error('leaf')
        : new AggregateError(
            [makeTree(depth - 1), makeTree(depth - 1), makeTree(depth - 1)],
            `level-${String(depth)}`,
          );
    const info = serializeError(makeTree(10), {
      ...DEFAULT_LIMITS,
      maxNodes: 12,
    });
    expect(countNodes(info as Nodeish)).toBeLessThanOrEqual(12);
    expect(info.budgetExhausted).toBe(true);
  });

  it('depth-first order: a node chain is captured before its members', () => {
    // Budget 3: chain (2 entries) wins over members; only 1 member fits.
    const top = new AggregateError(
      [new Error('m0'), new Error('m1'), new Error('m2')],
      'top',
    );
    (top as Error & { cause: unknown }).cause = new Error('c0', {
      cause: new Error('c1'),
    });
    const info = serializeError(top, { ...DEFAULT_LIMITS, maxNodes: 3 });
    expect(info.causes).toHaveLength(2);
    expect(info.members).toHaveLength(1);
    expect(info.membersTotal).toBe(3);
    expect(info.budgetExhausted).toBe(true);
  });

  it('a self-containing aggregate terminates within the budget', () => {
    const agg = new AggregateError([new Error('seed')], 'self');
    (agg.errors as unknown[]).push(agg);
    const info = serializeError(agg, { ...DEFAULT_LIMITS, maxNodes: 20 });
    expect(countNodes(info as Nodeish)).toBeLessThanOrEqual(20);
  });

  it('inner limits stay subordinate: high maxMembers cannot exceed the budget', () => {
    const members = Array.from(
      { length: 90 },
      (_, i) => new Error(`m${String(i)}`),
    );
    const info = serializeError(new AggregateError(members, 'wide'), {
      ...DEFAULT_LIMITS,
      maxMembers: 100,
      maxNodes: 5,
    });
    expect(info.members).toHaveLength(5);
    expect(info.membersTotal).toBe(90);
    expect(info.budgetExhausted).toBe(true);
  });
});
