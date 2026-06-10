/**
 * Unit test: synchronous source-map resolver application (specs/017 — ST-5, ST-7).
 */

import { describe, expect, it, vi } from 'vitest';
import { createStackNormalizer } from '../../../src/stacks/index.js';

const STACK = [
  'Error: boom',
  '    at checkout (https://app.example/main.abc.js:1:48201)',
  '    at onClick (https://app.example/main.abc.js:1:39044)',
].join('\n');

describe('createStackNormalizer — resolver', () => {
  it('sets `original` on resolvable frames via a sync resolver', () => {
    const resolver = vi.fn(
      (f: { file: string; line: number; column: number }) =>
        f.column === 48201
          ? { file: 'src/checkout.ts', line: 42, column: 7, name: 'checkout' }
          : null,
    );
    const frames = createStackNormalizer({ resolver })(STACK)!;
    expect(frames[0]!.original).toEqual({
      file: 'src/checkout.ts',
      line: 42,
      column: 7,
      name: 'checkout',
    });
    // Unmappable frame is left at its original position (no `original`).
    expect(frames[1]!.original).toBeUndefined();
    expect(frames[1]!.column).toBe(39044);
  });

  it('only offers frames with numeric line/col to the resolver', () => {
    const resolver = vi.fn(
      (_f: { file: string; line: number; column: number }) => null,
    );
    createStackNormalizer({ resolver })(STACK);
    for (const call of resolver.mock.calls) {
      expect(typeof call[0].line).toBe('number');
      expect(typeof call[0].column).toBe('number');
    }
  });

  it('swallows a per-frame resolver throw — other frames still resolve', () => {
    const resolver = (f: { file: string; line: number; column: number }) => {
      if (f.column === 48201) throw new Error('map blew up');
      return { file: 'src/onClick.ts', line: 9, column: 1 };
    };
    const normalize = createStackNormalizer({ resolver });
    let frames: import('../../../src/index.js').StackFrame[] | null = null;
    expect(() => {
      frames = normalize(STACK);
    }).not.toThrow();
    expect(frames).not.toBeNull();
    const out =
      frames as unknown as import('../../../src/index.js').StackFrame[];
    expect(out[0]!.original).toBeUndefined(); // threw → left un-resolved
    expect(out[1]!.original).toEqual({
      file: 'src/onClick.ts',
      line: 9,
      column: 1,
    });
  });
});
