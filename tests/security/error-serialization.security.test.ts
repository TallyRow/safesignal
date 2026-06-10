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

// ---------------------------------------------------------------------------
// ES-11 — feature-016 cause-chain attribute suppression (FR-014) [US1]
// ---------------------------------------------------------------------------

describe('ES-11: safesignal.errorCauses is never populated while serializeErrors is enabled', () => {
  it('enabled + breadcrumbs on: no errorCauses attribute; breadcrumb trail unaffected', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      breadcrumbs: true,
      serializeErrors: true,
      onInternalError,
    });
    const log = createLogger();
    log.info('crumb one');
    log.error('boom', {}, makeChainedError());

    const event = capture.calls.at(-1)!;
    expect(event.attributes['safesignal.errorCauses']).toBeUndefined();
    expect(event.error!.causes).toBeDefined();
    expect(event.attributes['safesignal.breadcrumbs']).toBeDefined();
  });

  it('enabled, breadcrumbs off: no errorCauses attribute', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: true,
      onInternalError,
    });
    createLogger().error('boom', {}, makeChainedError());

    expect(
      capture.calls[0]!.attributes['safesignal.errorCauses'],
    ).toBeUndefined();
  });

  it('disabled + breadcrumbs on: feature-016 errorCauses behavior is unchanged', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      breadcrumbs: true,
      onInternalError,
    });
    createLogger().error('boom', {}, makeChainedError());

    const causes = capture.calls[0]!.attributes['safesignal.errorCauses'];
    expect(causes).toEqual([
      { name: 'Error', message: 'mid failure' },
      { name: 'TypeError', message: 'root failure' },
    ]);
    expect(capture.calls[0]!.error!.causes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ES-9 — pipeline coverage of cause-chain nodes (FR-008 / SC-004) [US1]
// ---------------------------------------------------------------------------

describe('ES-9 (chains): cause-entry strings pass redaction and URL scrubbing', () => {
  const JWT =
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

  it('a JWT-shaped cause message is shape-redacted before the transport', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: true,
      onInternalError,
    });
    const top = new Error('top', { cause: new Error(JWT) });
    createLogger().error('boom', {}, top);

    const entry = capture.calls[0]!.error!.causes![0]!;
    expect(entry.message).toBe('[REDACTED]');
    expect(JSON.stringify(capture.calls[0])).not.toContain(JWT);
  });

  it('a token query param inside a cause message URL is scrubbed', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: true,
      onInternalError,
    });
    const top = new Error('top', {
      cause: new Error('https://api.example.com/path?token=supersecret123&x=1'),
    });
    createLogger().error('boom', {}, top);

    const entry = capture.calls[0]!.error!.causes![0]!;
    expect(entry.message).toContain('token=%5BREDACTED%5D');
    expect(entry.message).not.toContain('supersecret123');
  });

  it('a huge cause message is bounded by maxStringLength', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      sanitizerLimits: { maxStringLength: 64 },
      serializeErrors: true,
      onInternalError,
    });
    const top = new Error('top', { cause: new Error('y'.repeat(10000)) });
    createLogger().error('boom', {}, top);

    const entry = capture.calls[0]!.error!.causes![0]!;
    expect(entry.message).toBe(`${'y'.repeat(64)}...[truncated]`);
  });
});

// ---------------------------------------------------------------------------
// ES-9 — pipeline coverage of aggregate member nodes (FR-008) [US2]
// ---------------------------------------------------------------------------

describe('ES-9 (members): member-node strings pass redaction and URL scrubbing at depth', () => {
  it('a JWT-shaped message on a nested member is shape-redacted', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: true,
      onInternalError,
    });
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const inner = new AggregateError([new Error(jwt)], 'inner agg');
    const top = new AggregateError([inner], 'top agg');
    createLogger().error('boom', {}, top);

    const deepMember = capture.calls[0]!.error!.members![0]!.members![0]!;
    expect(deepMember.message).toBe('[REDACTED]');
    expect(JSON.stringify(capture.calls[0])).not.toContain(jwt);
  });

  it('a URL with a secret param in a member message is scrubbed', () => {
    configureLogging({
      application: APP,
      level: 'debug',
      transports: [capture],
      serializeErrors: true,
      onInternalError,
    });
    const agg = new AggregateError(
      [new Error('https://api.example.com/cb?api_key=sk-live-12345&ok=1')],
      'agg',
    );
    createLogger().error('boom', {}, agg);

    const member = capture.calls[0]!.error!.members![0]!;
    expect(member.message).not.toContain('sk-live-12345');
    expect(member.message).toContain('api_key=%5BREDACTED%5D');
  });
});
