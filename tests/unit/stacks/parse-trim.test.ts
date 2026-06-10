/**
 * Unit test: stack parsing + trimming + bounds (specs/017-readable-error-stacks —
 * ST-2, ST-3, ST-4, ST-9).
 */

import { describe, expect, it } from 'vitest';
import {
  createStackNormalizer,
  DEFAULT_MAX_FRAMES,
} from '../../../src/stacks/index.js';

const V8_STACK = [
  'Error: boom',
  '    at checkout (https://app.example/main.js:10:5)',
  '    at onClick (https://app.example/main.js:20:9)',
  '    at processTicks (node:internal/process/task_queues:96:5)',
  '    at Module._compile (/app/node_modules/dep/index.js:3:1)',
].join('\n');

const FF_STACK = [
  'checkout@https://app.example/main.js:10:5',
  'onClick@https://app.example/main.js:20:9',
  '@https://app.example/main.js:1:1',
].join('\n');

describe('createStackNormalizer — parsing', () => {
  it('parses V8 frames into {function,file,line,column}', () => {
    const frames = createStackNormalizer()(V8_STACK)!;
    expect(frames[0]).toEqual({
      function: 'checkout',
      file: 'https://app.example/main.js',
      line: 10,
      column: 5,
    });
    // The `Error: boom` header line is not a frame.
    expect(
      frames.some((f) => f.function === undefined && f.file === undefined),
    ).toBe(false);
  });

  it('parses Firefox/Safari `fn@file:line:col` frames (and bare `@file`)', () => {
    const frames = createStackNormalizer()(FF_STACK)!;
    expect(frames[0]).toEqual({
      function: 'checkout',
      file: 'https://app.example/main.js',
      line: 10,
      column: 5,
    });
    // `@file:1:1` → no function.
    expect(frames[2]).toEqual({
      file: 'https://app.example/main.js',
      line: 1,
      column: 1,
    });
  });

  it('returns null for an unparseable / empty stack', () => {
    expect(createStackNormalizer()('not a stack at all')).toBeNull();
    expect(createStackNormalizer()('')).toBeNull();
  });
});

describe('createStackNormalizer — trimming', () => {
  it('drops node_modules and engine-internal frames by default', () => {
    const files = createStackNormalizer()(V8_STACK)!.map((f) => f.file);
    expect(files.some((f) => f?.includes('node_modules'))).toBe(false);
    expect(files.some((f) => f?.startsWith('node:'))).toBe(false);
    expect(files).toEqual([
      'https://app.example/main.js',
      'https://app.example/main.js',
    ]);
  });

  it('keeps node_modules / internal frames when opted in', () => {
    const frames = createStackNormalizer({
      includeNodeModules: true,
      includeInternal: true,
    })(V8_STACK)!;
    expect(frames).toHaveLength(4);
  });

  it('never returns empty when frames existed (falls back to un-trimmed)', () => {
    // A stack that is ENTIRELY node_modules → trimming would empty it.
    const allNoise = [
      'Error: x',
      '    at a (/app/node_modules/x/i.js:1:1)',
      '    at b (/app/node_modules/y/j.js:2:2)',
    ].join('\n');
    const frames = createStackNormalizer()(allNoise)!;
    expect(frames).toHaveLength(2); // un-trimmed fallback
  });
});

describe('createStackNormalizer — bounds (ST-9)', () => {
  it('caps frames to maxFrames (and clamps the option to [1,100])', () => {
    const deep = [
      'Error: deep',
      ...Array.from(
        { length: 500 },
        (_v, i) => `    at fn${i} (https://app.example/a.js:${i + 1}:1)`,
      ),
    ].join('\n');
    expect(createStackNormalizer({ maxFrames: 10 })(deep)!).toHaveLength(10);
    expect(createStackNormalizer({ maxFrames: 5000 })(deep)!).toHaveLength(100); // clamp max
    expect(createStackNormalizer({ maxFrames: 0 })(deep)!).toHaveLength(1); // clamp min
    expect(createStackNormalizer()(deep)!).toHaveLength(DEFAULT_MAX_FRAMES);
  });
});
