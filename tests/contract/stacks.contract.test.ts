/**
 * Contract test: readable, source-mapped error stacks end-to-end
 * (specs/017-readable-error-stacks — ST-1, ST-2, ST-3, ST-5, ST-7, ST-8).
 * Exercised via configureLogging + a capturing transport, with controlled
 * error.stack fixtures for determinism.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import type { StackFrame } from '../../src/index.js';
import { createStackNormalizer } from '../../src/stacks/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const STACK_KEY = 'safesignal.stack';

const V8_STACK = [
  'Error: boom',
  '    at checkout (https://app.example/main.js:10:5)',
  '    at onClick (https://app.example/main.js:20:9)',
  '    at run (/app/node_modules/dep/index.js:3:1)',
].join('\n');

/** An error whose stack is a fixed fixture (not the test runner's stack). */
function errWithStack(stack: string): Error {
  const e = new Error('boom');
  e.stack = stack;
  return e;
}

let cap: CapturingTransport;
function lastError() {
  return cap.calls.filter((e) => e.level === 'error').at(-1)!;
}
function frames() {
  return lastError().attributes[STACK_KEY] as unknown as StackFrame[];
}

afterEach(() => vi.restoreAllMocks());

describe('error stacks — disabled by default (ST-1)', () => {
  it('no safesignal.stack when normalizeStack is not configured', () => {
    cap = makeCapturingTransport();
    configureLogging({ environment: 'test', transports: [cap] });
    createLogger().error('boom', {}, errWithStack(V8_STACK));
    expect(lastError().attributes[STACK_KEY]).toBeUndefined();
  });
});

describe('error stacks — normalized frames (ST-2, ST-3, ST-4)', () => {
  beforeEach(() => {
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      normalizeStack: createStackNormalizer(),
    });
  });

  it('attaches ordered, trimmed frames to the error event', () => {
    createLogger().error('boom', {}, errWithStack(V8_STACK));
    expect(frames().map((f) => f.function)).toEqual(['checkout', 'onClick']); // node_modules trimmed
    expect(frames()[0]).toEqual({
      function: 'checkout',
      file: 'https://app.example/main.js',
      line: 10,
      column: 5,
    });
    // The raw error.stack is preserved.
    expect(lastError().error?.stack).toContain('at checkout');
  });

  it('preserves the raw stack and adds no frames for an unparseable stack', () => {
    createLogger().error('boom', {}, errWithStack('totally unparseable'));
    expect(lastError().attributes[STACK_KEY]).toBeUndefined();
    expect(lastError().error?.stack).toBe('totally unparseable');
  });

  it('non-error events get no frames', () => {
    configureLogging({
      environment: 'test',
      level: 'debug',
      transports: [cap],
      normalizeStack: createStackNormalizer(),
    });
    createLogger().info('hello');
    expect(cap.calls.at(-1)!.attributes[STACK_KEY]).toBeUndefined();
  });
});

describe('error stacks — source-map resolution (ST-5)', () => {
  it('resolvable frames carry original source positions', () => {
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      normalizeStack: createStackNormalizer({
        resolver: (f) =>
          f.line === 10
            ? { file: 'src/checkout.ts', line: 42, column: 7, name: 'checkout' }
            : null,
      }),
    });
    createLogger().error('boom', {}, errWithStack(V8_STACK));
    expect(frames()[0]!.original).toEqual({
      file: 'src/checkout.ts',
      line: 42,
      column: 7,
      name: 'checkout',
    });
    expect(frames()[1]!.original).toBeUndefined();
  });
});

describe('error stacks — fail-safe + synchronous exactly-once (ST-7, ST-8)', () => {
  it('a throwing normalizer is swallowed; the error is still delivered once', () => {
    const onInternalError = vi.fn();
    cap = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      normalizeStack: () => {
        throw new Error('parser exploded');
      },
      onInternalError,
    });
    expect(() =>
      createLogger().error('boom', {}, errWithStack(V8_STACK)),
    ).not.toThrow();
    // Delivered exactly once, without frames; failure routed to the hook.
    expect(cap.calls.filter((e) => e.level === 'error')).toHaveLength(1);
    expect(lastError().attributes[STACK_KEY]).toBeUndefined();
    expect(lastError().error?.message).toBe('boom');
    expect(onInternalError).toHaveBeenCalled();
  });
});
