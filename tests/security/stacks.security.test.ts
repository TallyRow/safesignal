/**
 * Security test: frame text carries the pipeline's scrubbing guarantee
 * (specs/017-readable-error-stacks — ST-6, SC-004). A secret in a frame `file`
 * URL's query is scrubbed (whole-value guarantee), since frames ride in attributes.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureLogging, createLogger } from '../../src/index.js';
import { FIXTURE_VALUES, makeSecretFixture } from '../../src/testing/index.js';
import { createStackNormalizer } from '../../src/stacks/index.js';
import {
  type CapturingTransport,
  makeCapturingTransport,
} from '../helpers/failing-transport.js';

const STACK_KEY = 'safesignal.stack';

function errWithStack(stack: string): Error {
  const e = new Error('boom');
  e.stack = stack;
  return e;
}

afterEach(() => vi.restoreAllMocks());

describe('error stacks security (ST-6)', () => {
  it('a secret in a frame file URL query is scrubbed (0 unredacted occurrences)', () => {
    const secret = makeSecretFixture().token; // a `token=` denylisted param value
    const stack = [
      'Error: boom',
      `    at checkout (https://app.example/p?token=${secret}:1:20)`,
    ].join('\n');

    const cap: CapturingTransport = makeCapturingTransport();
    configureLogging({
      environment: 'test',
      transports: [cap],
      normalizeStack: createStackNormalizer(),
    });
    createLogger().error('boom', {}, errWithStack(stack));

    const err = cap.calls.filter((e) => e.level === 'error').at(-1)!;
    const serialized = JSON.stringify(err.attributes[STACK_KEY]);
    // The denylisted token value is gone; the placeholder is present.
    for (const value of FIXTURE_VALUES) {
      expect(serialized.includes(value)).toBe(false);
    }
    // The redaction placeholder is present (URL-encoded as %5BREDACTED%5D in the
    // scrubbed query value) and the non-secret URL part survives.
    expect(serialized).toMatch(/REDACTED/);
    expect(serialized).toContain('https://app.example/p');
  });
});
