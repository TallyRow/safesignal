/**
 * Context-merge unit test (T054).
 *
 * Locks the deterministic merge algorithm from `data-model.md` and
 * `contracts/logger-config.md` LC-7:
 *
 *   Sources in increasing precedence (later wins):
 *     1. configureLogging({ context })   — root static
 *     2. createLogger({ context })       — per-logger static
 *     3. logger.child(context) chain     — derived loggers
 *     4. correlation() return value      — per-emit dynamic
 *
 *   Per-key rules:
 *     - application / module / environment : shallow replace
 *     - attributes : deep-merge (plain-object × plain-object → recurse;
 *                                arrays / primitives / mismatched shapes
 *                                → later wins)
 *
 *   Pure: mergeContexts() never mutates its inputs.
 */

import { describe, expect, it } from 'vitest';

import type { LogContext } from '../../../src/api/types.js';
import { mergeContexts } from '../../../src/context/context-merge.js';

// ---------------------------------------------------------------------------
// Trivial cases
// ---------------------------------------------------------------------------

describe('mergeContexts: trivial cases', () => {
  it('returns an empty object when given no sources', () => {
    expect(mergeContexts()).toEqual({});
  });

  it('returns an empty object when every source is undefined', () => {
    expect(mergeContexts(undefined, undefined, undefined)).toEqual({});
  });

  it('returns an empty object when sources are all empty', () => {
    expect(mergeContexts({}, {}, {})).toEqual({});
  });

  it('returns a copy of a single source (does not return the input by reference)', () => {
    const src: Partial<LogContext> = {
      application: { name: 'a' },
      attributes: { x: 1 },
    };
    const out = mergeContexts(src);
    expect(out).toEqual(src);
    expect(out.attributes).not.toBe(src.attributes); // deep-merge always allocates
  });

  it('does not write properties whose value is undefined (exactOptionalPropertyTypes)', () => {
    const out = mergeContexts({ application: undefined, module: undefined });
    expect('application' in out).toBe(false);
    expect('module' in out).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Shallow replacement on application / module / environment
// ---------------------------------------------------------------------------

describe('shallow replace for application / module / environment', () => {
  it('later application replaces earlier application wholesale', () => {
    const out = mergeContexts(
      { application: { name: 'host', version: '1.0' } },
      { application: { name: 'override', version: '2.0' } },
    );
    expect(out.application).toEqual({ name: 'override', version: '2.0' });
  });

  it('later module replaces earlier module wholesale', () => {
    const out = mergeContexts(
      { module: { name: 'a', version: '1' } },
      { module: { name: 'b', version: '2' } },
    );
    expect(out.module).toEqual({ name: 'b', version: '2' });
  });

  it('later environment replaces earlier environment', () => {
    const out = mergeContexts(
      { environment: 'development' },
      { environment: 'production' },
    );
    expect(out.environment).toBe('production');
  });

  it('undefined in a later source does NOT overwrite a defined earlier value', () => {
    const out = mergeContexts(
      { application: { name: 'host' } },
      {},
      { application: undefined },
    );
    expect(out.application).toEqual({ name: 'host' });
  });

  it('partial later application replaces wholesale (no field-level shallow merge on AppIdentity)', () => {
    // AppIdentity is treated as an atomic value; a later source's
    // `application` overrides the earlier entirely.
    const out = mergeContexts(
      { application: { name: 'a', version: '1.0' } },
      { application: { name: 'b' } }, // no version
    );
    expect(out.application).toEqual({ name: 'b' });
    expect(out.application?.version).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Deep merge on attributes
// ---------------------------------------------------------------------------

describe('deep merge for attributes', () => {
  it('merges disjoint top-level keys', () => {
    const out = mergeContexts(
      { attributes: { a: 1 } },
      { attributes: { b: 2 } },
    );
    expect(out.attributes).toEqual({ a: 1, b: 2 });
  });

  it('later value wins for overlapping top-level primitive keys', () => {
    const out = mergeContexts(
      { attributes: { x: 'first' } },
      { attributes: { x: 'second' } },
    );
    expect(out.attributes).toEqual({ x: 'second' });
  });

  it('recursively merges nested plain-object values for the same key', () => {
    const out = mergeContexts(
      { attributes: { user: { id: 'u1', role: 'admin' } } },
      { attributes: { user: { id: 'u1', name: 'alice' } } },
    );
    expect(out.attributes).toEqual({
      user: { id: 'u1', role: 'admin', name: 'alice' },
    });
  });

  it('recurses arbitrarily deep', () => {
    const out = mergeContexts(
      { attributes: { a: { b: { c: { x: 1 } } } } },
      { attributes: { a: { b: { c: { y: 2 } } } } },
    );
    expect(out.attributes).toEqual({
      a: { b: { c: { x: 1, y: 2 } } },
    });
  });

  it('replaces arrays wholesale (does NOT concatenate)', () => {
    const out = mergeContexts(
      { attributes: { tags: ['a', 'b'] } },
      { attributes: { tags: ['c'] } },
    );
    expect(out.attributes).toEqual({ tags: ['c'] });
  });

  it('replaces wholesale when earlier value is object and later is primitive', () => {
    const out = mergeContexts(
      { attributes: { x: { nested: 1 } } },
      { attributes: { x: 'replaced' } },
    );
    expect(out.attributes).toEqual({ x: 'replaced' });
  });

  it('replaces wholesale when earlier value is primitive and later is object', () => {
    const out = mergeContexts(
      { attributes: { x: 'first' } },
      { attributes: { x: { now: 'object' } } },
    );
    expect(out.attributes).toEqual({ x: { now: 'object' } });
  });

  it('replaces wholesale when earlier is array and later is object', () => {
    const out = mergeContexts(
      { attributes: { x: [1, 2, 3] } },
      { attributes: { x: { y: 1 } } },
    );
    expect(out.attributes).toEqual({ x: { y: 1 } });
  });

  it('replaces wholesale when earlier is object and later is array', () => {
    const out = mergeContexts(
      { attributes: { x: { y: 1 } } },
      { attributes: { x: [1, 2, 3] } },
    );
    expect(out.attributes).toEqual({ x: [1, 2, 3] });
  });

  it('null is treated as a leaf (later null replaces earlier object)', () => {
    const out = mergeContexts(
      { attributes: { x: { y: 1 } } },
      { attributes: { x: null } },
    );
    expect(out.attributes).toEqual({ x: null });
  });

  it('undefined in a later attribute key does NOT remove an earlier defined value', () => {
    const out = mergeContexts(
      { attributes: { keep: 1, also: 2 } },
      { attributes: { keep: undefined as never } },
    );
    expect(out.attributes).toEqual({ keep: 1, also: 2 });
  });

  it('preserves earlier-only keys when later only adds new keys', () => {
    const out = mergeContexts(
      { attributes: { outer: { a: 1, b: 2 } } },
      { attributes: { outer: { c: 3 } } },
    );
    expect(out.attributes).toEqual({
      outer: { a: 1, b: 2, c: 3 },
    });
  });
});

// ---------------------------------------------------------------------------
// Documented merge precedence: root → per-logger → child → correlation
// ---------------------------------------------------------------------------

describe('merge precedence chain (root → per-logger → child → correlation)', () => {
  it('correlation wins over child, which wins over per-logger, which wins over root, for the same key', () => {
    const out = mergeContexts(
      { attributes: { layer: 'root' } },         // 1. root
      { attributes: { layer: 'logger' } },        // 2. per-logger
      { attributes: { layer: 'child' } },         // 3. child
      { attributes: { layer: 'correlation' } },   // 4. correlation
    );
    expect(out.attributes).toEqual({ layer: 'correlation' });
  });

  it('keys unique to each layer are all preserved in the merged output', () => {
    const out = mergeContexts(
      { attributes: { from_root: true } },
      { attributes: { from_logger: true } },
      { attributes: { from_child: true } },
      { attributes: { from_corr: true } },
    );
    expect(out.attributes).toEqual({
      from_root: true,
      from_logger: true,
      from_child: true,
      from_corr: true,
    });
  });

  it('applies the precedence chain to application / module / environment as well', () => {
    const out = mergeContexts(
      { application: { name: 'root-app' } },
      { module: { name: 'logger-mod' } },
      { module: { name: 'child-mod' } },
      { environment: 'production' },
    );
    expect(out.application).toEqual({ name: 'root-app' });
    expect(out.module).toEqual({ name: 'child-mod' });
    expect(out.environment).toBe('production');
  });
});

// ---------------------------------------------------------------------------
// Purity: no input mutation
// ---------------------------------------------------------------------------

describe('purity: mergeContexts() never mutates its inputs', () => {
  it('does not mutate the earlier source\'s attributes object', () => {
    const earlier: Partial<LogContext> = {
      attributes: { outer: { a: 1 } },
    };
    const earlierCopy = JSON.parse(JSON.stringify(earlier));
    mergeContexts(earlier, { attributes: { outer: { b: 2 } } });
    expect(earlier).toEqual(earlierCopy);
  });

  it('does not mutate the later source\'s attributes object', () => {
    const later: Partial<LogContext> = {
      attributes: { outer: { b: 2 } },
    };
    const laterCopy = JSON.parse(JSON.stringify(later));
    mergeContexts({ attributes: { outer: { a: 1 } } }, later);
    expect(later).toEqual(laterCopy);
  });

  it('returns a fresh attributes object at every nesting level (mutation of the result does not corrupt inputs)', () => {
    const earlier: Partial<LogContext> = {
      attributes: { outer: { a: 1 } },
    };
    const later: Partial<LogContext> = {
      attributes: { outer: { b: 2 } },
    };
    const out = mergeContexts(earlier, later);
    // Mutating the returned object should be possible without
    // affecting either source.
    (out.attributes as Record<string, unknown>).outer = { mutated: true };
    expect(earlier.attributes).toEqual({ outer: { a: 1 } });
    expect(later.attributes).toEqual({ outer: { b: 2 } });
  });
});

// ---------------------------------------------------------------------------
// Edge cases that locked previous regressions
// ---------------------------------------------------------------------------

describe('regression / edge cases', () => {
  it('skips undefined sources in the middle of the precedence chain', () => {
    const out = mergeContexts(
      { application: { name: 'host' } },
      undefined,
      { module: { name: 'mod' } },
      undefined,
      { environment: 'production' },
    );
    expect(out).toEqual({
      application: { name: 'host' },
      module: { name: 'mod' },
      environment: 'production',
    });
  });

  it('handles a source with only attributes (no app/module/env)', () => {
    const out = mergeContexts({ attributes: { x: 1 } });
    expect(out).toEqual({ attributes: { x: 1 } });
  });

  it('handles a source with everything set', () => {
    const out = mergeContexts({
      application: { name: 'app' },
      module: { name: 'mod' },
      environment: 'dev',
      attributes: { x: 1 },
    });
    expect(out).toEqual({
      application: { name: 'app' },
      module: { name: 'mod' },
      environment: 'dev',
      attributes: { x: 1 },
    });
  });
});
