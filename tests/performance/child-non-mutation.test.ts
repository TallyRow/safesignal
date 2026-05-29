/**
 * Child-non-mutation performance test (T062).
 *
 * Complements `tests/integration/federated-context.test.ts` (T053) and
 * `tests/unit/context/context-merge.test.ts` (T054) by asserting the
 * non-mutation property AT SCALE: a parent logger creates many
 * derivations via `child()` / `withContext()`, every derivation
 * emits, every derivation chains further children — and the parent's
 * own emitted context stays structurally identical to its pre-
 * derivation baseline.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { LogEvent } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { clearActiveRuntimeForTests } from '../../src/runtime/runtime-ref.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'child-non-mutation', version: '1.0.0' };

let capture = makeCapturingTransport('cap');

beforeEach(() => {
  clearActiveRuntimeForTests();
  capture = makeCapturingTransport('cap');
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

function findEvent(message: string): LogEvent | undefined {
  return capture.calls.find((e) => e.message === message);
}

function parentEvent(label: string): LogEvent {
  return (
    findEvent(label) ??
    (() => {
      throw new Error(`event ${label} not captured`);
    })()
  );
}

describe('child-non-mutation at scale', () => {
  it('parent context is structurally unchanged after 1,000 sibling-child derivations + emissions', () => {
    const parent = createLogger({
      module: { name: 'p', version: '1' },
      context: { attributes: { parent_tag: 'P' } },
    });

    // Baseline parent emit.
    parent.info('baseline');
    const baseline = JSON.parse(
      JSON.stringify(parentEvent('baseline')),
    ) as LogEvent;

    // Create 1,000 sibling children, each with its own unique attributes.
    for (let i = 0; i < 1000; i++) {
      const sibling = parent.child({
        attributes: { sibling_idx: i, sibling_tag: `S-${String(i)}` },
      });
      sibling.info(`sibling-${String(i)}`);
    }

    // Parent emits again — should match the baseline.
    parent.info('post-siblings');
    const post = parentEvent('post-siblings');

    // Same parent context: module, attributes, application.
    expect(post.context.application).toEqual(baseline.context.application);
    expect(post.context.module).toEqual(baseline.context.module);
    expect(post.context.attributes).toEqual(baseline.context.attributes);

    // Specifically: NO sibling_idx / sibling_tag leaked into the
    // parent's emitted context.
    expect(post.context.attributes?.sibling_idx).toBeUndefined();
    expect(post.context.attributes?.sibling_tag).toBeUndefined();
  });

  it('parent context is unchanged after a deep grandchild chain', () => {
    const parent = createLogger({
      context: { attributes: { parent_tag: 'root' } },
    });
    parent.info('baseline');
    const baseline = JSON.parse(
      JSON.stringify(parentEvent('baseline')),
    ) as LogEvent;

    // Build a 50-deep chain.
    let cursor = parent;
    for (let i = 0; i < 50; i++) {
      cursor = cursor.child({
        attributes: { depth: i, lane: `D-${String(i)}` },
      });
    }
    cursor.info('deepest');
    const deepest = findEvent('deepest')!;

    // The deepest emission carries every layer's contribution.
    expect(deepest.context.attributes?.parent_tag).toBe('root');
    expect(deepest.context.attributes?.depth).toBe(49);

    // Parent context unchanged.
    parent.info('post-chain');
    const post = parentEvent('post-chain');
    expect(post.context.attributes).toEqual(baseline.context.attributes);
    expect(post.context.attributes?.depth).toBeUndefined();
    expect(post.context.attributes?.lane).toBeUndefined();
  });

  it('parent context is unchanged after mixed child() + withContext() derivations', () => {
    const parent = createLogger({
      context: { attributes: { kind: 'parent' } },
    });
    parent.info('baseline');
    const baseline = JSON.parse(
      JSON.stringify(parentEvent('baseline')),
    ) as LogEvent;

    for (let i = 0; i < 200; i++) {
      const derivedChild = parent.child({
        attributes: { via: 'child', idx: i },
      });
      const derivedWith = parent.withContext({
        attributes: { via: 'withContext', idx: i },
      });
      derivedChild.info(`child-${String(i)}`);
      derivedWith.info(`with-${String(i)}`);
    }

    parent.info('post-mixed');
    const post = parentEvent('post-mixed');
    expect(post.context.attributes).toEqual(baseline.context.attributes);
    expect(post.context.attributes?.via).toBeUndefined();
    expect(post.context.attributes?.idx).toBeUndefined();
  });

  it('parent context is unchanged when a child overrides the module identity', () => {
    const parent = createLogger({
      module: { name: 'parent-mod', version: '1.0' },
    });
    parent.info('baseline');
    const baseline = JSON.parse(
      JSON.stringify(parentEvent('baseline')),
    ) as LogEvent;

    for (let i = 0; i < 100; i++) {
      const overridden = parent.child({
        module: { name: `child-mod-${String(i)}`, version: '0.1' },
      });
      overridden.info(`child-${String(i)}`);
    }

    parent.info('post-overrides');
    const post = parentEvent('post-overrides');
    expect(post.context.module).toEqual(baseline.context.module);
    expect(post.context.module?.name).toBe('parent-mod');
  });

  it('grandchild does not mutate the intermediate child', () => {
    const parent = createLogger();
    const child = parent.child({ attributes: { lane: 'L' } });
    child.info('child-baseline');
    const childBaseline = JSON.parse(
      JSON.stringify(parentEvent('child-baseline')),
    ) as LogEvent;

    for (let i = 0; i < 100; i++) {
      const grandchild = child.child({
        attributes: { gc_idx: i, gc_tag: `G-${String(i)}` },
      });
      grandchild.info(`gc-${String(i)}`);
    }

    child.info('child-post');
    const childPost = parentEvent('child-post');
    expect(childPost.context.attributes).toEqual(
      childBaseline.context.attributes,
    );
    expect(childPost.context.attributes?.gc_idx).toBeUndefined();
    expect(childPost.context.attributes?.gc_tag).toBeUndefined();
  });

  it("sibling children do not see each other's context (no cross-pollination)", () => {
    const parent = createLogger();
    const childA = parent.child({ attributes: { sibling: 'A' } });
    const childB = parent.child({ attributes: { sibling: 'B' } });
    const childC = parent.child({ attributes: { sibling: 'C' } });

    for (let i = 0; i < 50; i++) {
      childA.info(`a-${String(i)}`, { idx: i });
      childB.info(`b-${String(i)}`, { idx: i });
      childC.info(`c-${String(i)}`, { idx: i });
    }
    childA.info('A-final');
    childB.info('B-final');
    childC.info('C-final');

    const aFinal = parentEvent('A-final');
    const bFinal = parentEvent('B-final');
    const cFinal = parentEvent('C-final');

    expect(aFinal.context.attributes?.sibling).toBe('A');
    expect(bFinal.context.attributes?.sibling).toBe('B');
    expect(cFinal.context.attributes?.sibling).toBe('C');
  });
});
