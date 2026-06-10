/**
 * Deep error serialization (Feature 023) — security tests.
 *
 * Locks (contracts/error-serialization.md):
 *   - ES-10: with `serializeErrors` absent/false (the default), the event's
 *     error payload is EXACTLY `{ name, message, stack? }` — no new fields,
 *     no new attributes (SC-005 / FR-009).
 *   - ES-11: while `serializeErrors` is enabled, the feature-016 attribute
 *     `safesignal.errorCauses` is never populated; disabled → 016 unchanged
 *     (FR-014). [US1 block]
 *   - ES-9: every node name/message and every `fields` entry passes
 *     sanitize → URL-scrub → redact before any transport (FR-008 / SC-004).
 *     [US1/US2/US3 blocks]
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'error-serialization-security', version: '1.0.0' };

let capture = makeCapturingTransport('capture');
let onInternalError = vi.fn();

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  onInternalError = vi.fn();
});

function makeChainedError(): Error {
  const root = new TypeError('root failure');
  const mid = new Error('mid failure', { cause: root });
  return new Error('top failure', { cause: mid });
}

// ---------------------------------------------------------------------------
// ES-10 — off by default: locked flat error payload shape
// ---------------------------------------------------------------------------

describe('ES-10: serializeErrors off (default) → error payload is exactly { name, message, stack? }', () => {
  it('absent config: a cause-chained error yields only name/message/stack', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      onInternalError,
    });
    createLogger().error('boom', {}, makeChainedError());

    const error = capture.calls[0]!.error!;
    expect(Object.keys(error).sort()).toEqual(['message', 'name', 'stack']);
    expect(error.causes).toBeUndefined();
    expect(error.members).toBeUndefined();
    expect(error.fields).toBeUndefined();
    expect(error.budgetExhausted).toBeUndefined();
  });

  it('serializeErrors: false behaves identically to absent', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: false,
      onInternalError,
    });
    const subclass = new RangeError('out of range');
    (subclass as unknown as Record<string, unknown>).status = 503;
    createLogger().error('boom', {}, subclass);

    const error = capture.calls[0]!.error!;
    expect(Object.keys(error).sort()).toEqual(['message', 'name', 'stack']);
    expect(error.name).toBe('RangeError');
  });

  it('no new attributes appear when disabled', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      onInternalError,
    });
    createLogger().error('boom', { plain: 'attr' }, makeChainedError());

    const keys = Object.keys(capture.calls[0]!.attributes);
    expect(keys).toEqual(['plain']);
  });

  it('an AggregateError when disabled also yields only the flat shape', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      onInternalError,
    });
    const agg = new AggregateError(
      [new Error('a'), new Error('b')],
      'all failed',
    );
    createLogger().error('boom', {}, agg);

    const error = capture.calls[0]!.error!;
    expect(Object.keys(error).sort()).toEqual(['message', 'name', 'stack']);
    expect(error.name).toBe('AggregateError');
  });
});
