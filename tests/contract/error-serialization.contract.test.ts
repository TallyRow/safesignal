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

// ---------------------------------------------------------------------------
// ES-4 — AggregateError members [US2]
// ---------------------------------------------------------------------------

describe('ES-4: AggregateError members appear as error.members', () => {
  it('three members are listed in original order with names and messages (SC-002)', () => {
    configure();
    const agg = new AggregateError(
      [new TypeError('first'), new Error('second'), new RangeError('third')],
      'all failed',
    );
    createLogger().error('boom', {}, agg);

    const error = capture.calls[0]!.error!;
    expect(error.name).toBe('AggregateError');
    expect(error.members).toEqual([
      { name: 'TypeError', message: 'first' },
      { name: 'Error', message: 'second' },
      { name: 'RangeError', message: 'third' },
    ]);
    expect(error.membersTotal).toBeUndefined();
  });

  it('members above maxMembers clip and record the original count', () => {
    configure({ maxMembers: 2 });
    const agg = new AggregateError(
      [new Error('m0'), new Error('m1'), new Error('m2'), new Error('m3')],
      'all failed',
    );
    createLogger().error('boom', {}, agg);

    const error = capture.calls[0]!.error!;
    expect(error.members).toHaveLength(2);
    expect(error.members![0]!.message).toBe('m0');
    expect(error.members![1]!.message).toBe('m1');
    expect(error.membersTotal).toBe(4);
  });

  it('a member with its own cause chain captures it within bounds (US2.3)', () => {
    configure();
    const member = new Error('member failed', {
      cause: new TypeError('member root'),
    });
    const agg = new AggregateError([member], 'all failed');
    createLogger().error('boom', {}, agg);

    const error = capture.calls[0]!.error!;
    expect(error.members![0]!.causes).toEqual([
      { name: 'TypeError', message: 'member root' },
    ]);
  });

  it('an AggregateError nested inside a cause chain carries members on the chain entry', () => {
    configure();
    const agg = new AggregateError([new Error('inner member')], 'agg failed');
    const top = new Error('top', { cause: agg });
    createLogger().error('boom', {}, top);

    const error = capture.calls[0]!.error!;
    const entry = error.causes![0]!;
    expect(entry.name).toBe('AggregateError');
    expect(entry.members).toEqual([{ name: 'Error', message: 'inner member' }]);
    expect(entry.causes).toBeUndefined();
  });

  it('non-error members coerce to NonError', () => {
    configure();
    const agg = new AggregateError(['raw failure', 7], 'all failed');
    createLogger().error('boom', {}, agg);

    expect(capture.calls[0]!.error!.members).toEqual([
      { name: 'NonError', message: 'raw failure' },
      { name: 'NonError', message: '7' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ES-6 / ES-7 — extra fields, DOMException code, no nested stacks [US3]
// ---------------------------------------------------------------------------

describe('ES-6: custom subclass extra fields are captured value-filtered', () => {
  class HttpError extends Error {
    status: number;
    url: string;
    constructor(message: string, status: number, url: string) {
      super(message);
      this.name = 'HttpError';
      this.status = status;
      this.url = url;
    }
  }

  it('own enumerable JSON-safe fields appear under error.fields', () => {
    configure();
    createLogger().error(
      'boom',
      {},
      new HttpError('bad gateway', 502, 'https://api.example.com/orders'),
    );

    const error = capture.calls[0]!.error!;
    expect(error.name).toBe('HttpError');
    expect(error.fields).toEqual({
      status: 502,
      url: 'https://api.example.com/orders',
    });
  });

  it('functions, symbols, and class instances are never captured', () => {
    configure();
    const err = new Error('plain') as Error & Record<string, unknown>;
    err.handler = () => 'nope';
    err.sym = Symbol('nope');
    err.instance = new Map([['a', 1]]);
    err.ok = 'kept';
    createLogger().error('boom', {}, err);

    const error = capture.calls[0]!.error!;
    expect(error.fields).toEqual({ ok: 'kept' });
  });

  it('prototype-inherited properties are never captured', () => {
    configure();
    const proto = { inherited: 'never' };
    const err = Object.create(proto) as Record<string, unknown>;
    err.name = 'ProtoError';
    err.message = 'msg';
    err.own = 'kept';
    createLogger().error('boom', {}, err);

    const error = capture.calls[0]!.error!;
    expect(error.fields).toEqual({ own: 'kept' });
  });

  it('fields above maxFields clip with fieldsTruncated', () => {
    configure({ maxFields: 2 });
    const err = new Error('plain') as Error & Record<string, unknown>;
    err.a = 1;
    err.b = 2;
    err.c = 3;
    createLogger().error('boom', {}, err);

    const error = capture.calls[0]!.error!;
    expect(Object.keys(error.fields!)).toHaveLength(2);
    expect(error.fieldsTruncated).toBe(true);
  });

  it('maxFields: 0 disables field capture entirely', () => {
    configure({ maxFields: 0 });
    const err = new Error('plain') as Error & Record<string, unknown>;
    err.a = 1;
    createLogger().error('boom', {}, err);

    expect(capture.calls[0]!.error!.fields).toBeUndefined();
  });

  it('a DOMException exposes its legacy numeric code as fields.code', () => {
    // happy-dom's DOMException does not implement the legacy `code`
    // property, so this locks the behavior against a spec-faithful stand-in:
    // `code` is a PROTOTYPE getter (never an own enumerable property), which
    // is exactly why FR-005 special-cases it.
    class PlatformLikeDOMException extends Error {
      constructor(message: string, name: string) {
        super(message);
        this.name = name;
      }
      get code(): number {
        return 20; // ABORT_ERR
      }
    }
    configure();
    createLogger().error(
      'boom',
      {},
      new PlatformLikeDOMException('The operation was aborted.', 'AbortError'),
    );

    const error = capture.calls[0]!.error!;
    expect(error.name).toBe('AbortError');
    expect(error.fields).toEqual({ code: 20 });
  });

  it('nested member fields are captured too', () => {
    configure();
    const member = new Error('member') as Error & Record<string, unknown>;
    member.status = 429;
    const agg = new AggregateError([member], 'agg');
    createLogger().error('boom', {}, agg);

    expect(capture.calls[0]!.error!.members![0]!.fields).toEqual({
      status: 429,
    });
  });
});

describe('ES-7: nested nodes never carry stack text', () => {
  it('member nodes have no stack key; top-level stack is unchanged', () => {
    configure();
    const agg = new AggregateError(
      [new Error('m0', { cause: new Error('c0') })],
      'agg',
    );
    createLogger().error('boom', {}, agg);

    const error = capture.calls[0]!.error!;
    expect(error.stack).toBeDefined();
    const member = error.members![0]! as Record<string, unknown>;
    expect(member.stack).toBeUndefined();
    const memberCause = (member.causes as Array<Record<string, unknown>>)[0]!;
    expect(memberCause.stack).toBeUndefined();
  });
});
