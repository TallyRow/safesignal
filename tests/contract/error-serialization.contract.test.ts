/**
 * Deep error serialization (Feature 023) — contract tests.
 *
 * Locks (specs/023-error-serialization-depth/contracts/error-serialization.md):
 *   ES-1: flat ordered `causes` (outermost first), absent when no cause,
 *         chain entries never carry their own `causes`.
 *   ES-3: chains longer than `maxCauseDepth` clip with `causesTruncated`.
 *   US1.3: non-error causes coerce to `name: 'NonError'`.
 *   (US2: ES-4 members; US3: ES-6 fields / ES-7 no nested stacks — appended
 *   in their story phases.)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'error-serialization-contract', version: '1.0.0' };

let capture = makeCapturingTransport('capture');
let onInternalError = vi.fn();

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  onInternalError = vi.fn();
});

function configure(serializeErrors: boolean | object = true): void {
  configureLogging({
    application: APP,
    level: 'debug',
    transports: [capture],
    serializeErrors: serializeErrors as never,
    onInternalError,
  });
}

// ---------------------------------------------------------------------------
// ES-1 — flat ordered cause chain
// ---------------------------------------------------------------------------

describe('ES-1: cause chains appear as flat ordered error.causes', () => {
  it('an error wrapping two nested causes exposes all three links in order (SC-001)', () => {
    configure();
    const root = new TypeError('network unreachable');
    const mid = new Error('payment API timeout', { cause: root });
    const top = new Error('checkout failed', { cause: mid });
    createLogger().error('boom', {}, top);

    const error = capture.calls[0]!.error!;
    expect(error.name).toBe('Error');
    expect(error.message).toBe('checkout failed');
    expect(error.causes).toEqual([
      { name: 'Error', message: 'payment API timeout' },
      { name: 'TypeError', message: 'network unreachable' },
    ]);
  });

  it('chain entries never carry a populated causes of their own (flatness)', () => {
    configure();
    const root = new Error('root');
    const mid = new Error('mid', { cause: root });
    const top = new Error('top', { cause: mid });
    createLogger().error('boom', {}, top);

    const error = capture.calls[0]!.error!;
    for (const entry of error.causes!) {
      expect(entry.causes).toBeUndefined();
    }
  });

  it('an error with no cause carries no causes key (no empty placeholder)', () => {
    configure();
    createLogger().error('boom', {}, new Error('plain'));

    const error = capture.calls[0]!.error!;
    expect('causes' in error).toBe(false);
    expect(error.causesTruncated).toBeUndefined();
    expect(error.budgetExhausted).toBeUndefined();
  });

  it('nested entries never carry stack text (ES-7 chain aspect)', () => {
    configure();
    const top = new Error('top', { cause: new Error('inner') });
    createLogger().error('boom', {}, top);

    const error = capture.calls[0]!.error!;
    expect(error.stack).toBeDefined();
    expect((error.causes![0] as Record<string, unknown>).stack).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// US1.3 — non-error causes
// ---------------------------------------------------------------------------

describe('US1.3: non-error causes coerce to NonError', () => {
  it('a string cause becomes { name: NonError, message: String(value) }', () => {
    configure();
    const top = new Error('top', { cause: 'ECONNRESET' });
    createLogger().error('boom', {}, top);

    expect(capture.calls[0]!.error!.causes).toEqual([
      { name: 'NonError', message: 'ECONNRESET' },
    ]);
  });

  it('a number cause is coerced and ends the chain', () => {
    configure();
    const top = new Error('top', { cause: 42 });
    createLogger().error('boom', {}, top);

    expect(capture.calls[0]!.error!.causes).toEqual([
      { name: 'NonError', message: '42' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ES-3 — depth clipping
// ---------------------------------------------------------------------------

describe('ES-3: chains longer than maxCauseDepth clip with causesTruncated', () => {
  it('a 5-link chain under maxCauseDepth=2 exposes 2 entries and the marker', () => {
    configure({ maxCauseDepth: 2 });
    let cursor = new Error('deepest');
    for (let i = 3; i >= 0; i--) {
      cursor = new Error(`level-${String(i)}`, { cause: cursor });
    }
    createLogger().error('boom', {}, cursor);

    const error = capture.calls[0]!.error!;
    expect(error.causes).toHaveLength(2);
    expect(error.causes![0]!.message).toBe('level-1');
    expect(error.causes![1]!.message).toBe('level-2');
    expect(error.causesTruncated).toBe(true);
  });

  it('a chain exactly at maxCauseDepth carries no truncation marker', () => {
    configure({ maxCauseDepth: 2 });
    const top = new Error('top', {
      cause: new Error('one', { cause: new Error('two') }),
    });
    createLogger().error('boom', {}, top);

    const error = capture.calls[0]!.error!;
    expect(error.causes).toHaveLength(2);
    expect(error.causesTruncated).toBeUndefined();
  });
});
