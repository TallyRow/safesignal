/**
 * ES-8 fault-injection tests (FR-006 / SC-003 / US3.4): extraction failure
 * never throws into the host and never drops the event; partial extraction
 * keeps safely-extracted data; `onInternalError` receives
 * `PackageError('error_serialize_failed')` for contained failures.
 */

import { describe, expect, it, vi } from 'vitest';

import { serializeError } from '../../../src/errors/serialize-error.js';
import { buildLogEvent } from '../../../src/pipeline/event-builder.js';

const DEFAULT_LIMITS = {
  maxCauseDepth: 8,
  maxMembers: 10,
  maxFields: 16,
  maxNodes: 50,
};

function code(err: Error): string | undefined {
  return (err as Error & { code?: string }).code;
}

describe('ES-8: hostile getters are contained', () => {
  it('a throwing own enumerable field getter keeps the event and the other fields (US3.4)', () => {
    const onInternalError = vi.fn();
    const err = new Error('partial');
    Object.defineProperty(err, 'bad', {
      get() {
        throw new Error('hostile getter');
      },
      enumerable: true,
    });
    (err as Error & { good?: string }).good = 'kept';

    const info = serializeError(err, DEFAULT_LIMITS, onInternalError);
    expect(info.name).toBe('Error');
    expect(info.message).toBe('partial');
    expect(info.fields).toEqual({ good: 'kept' });
    expect(onInternalError).toHaveBeenCalledTimes(1);
    expect(code(onInternalError.mock.calls[0]![0] as Error)).toBe(
      'error_serialize_failed',
    );
  });

  it('a throwing cause getter yields no chain and does not throw', () => {
    const err = new Error('no chain');
    Object.defineProperty(err, 'cause', {
      get() {
        throw new Error('hostile cause');
      },
    });

    const info = serializeError(err, DEFAULT_LIMITS);
    expect(info.causes).toBeUndefined();
    expect(info.name).toBe('Error');
  });

  it('a throwing errors getter yields no members and does not throw', () => {
    const err = new Error('no members');
    Object.defineProperty(err, 'errors', {
      get() {
        throw new Error('hostile errors');
      },
    });

    const info = serializeError(err, DEFAULT_LIMITS);
    expect(info.members).toBeUndefined();
  });

  it('a hostile Proxy reduces to a coerced node without throwing', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
        ownKeys() {
          throw new Error('trap');
        },
        getPrototypeOf() {
          throw new Error('trap');
        },
      },
    );

    expect(() => serializeError(hostile, DEFAULT_LIMITS)).not.toThrow();
    const info = serializeError(hostile, DEFAULT_LIMITS);
    expect(typeof info.name).toBe('string');
    expect(typeof info.message).toBe('string');
  });

  it('a hostile object in a cause position is coerced, not fatal', () => {
    const hostileCause = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      },
    );
    const top = new Error('top');
    (top as Error & { cause: unknown }).cause = hostileCause;

    expect(() => serializeError(top, DEFAULT_LIMITS)).not.toThrow();
  });
});

describe('ES-8: event-builder wrapper fail-safe (FR-006)', () => {
  it('if deep serialization throws, the event is still delivered with flat error info and one error_serialize_failed notice', async () => {
    vi.resetModules();
    vi.doMock(
      '../../../src/errors/serialize-error.js',
      async (importOriginal) => {
        const original =
          await importOriginal<
            typeof import('../../../src/errors/serialize-error.js')
          >();
        return {
          ...original,
          serializeError: () => {
            throw new Error('synthetic serializer failure');
          },
        };
      },
    );
    const { buildLogEvent: mockedBuild } = await import(
      '../../../src/pipeline/event-builder.js'
    );

    const onInternalError = vi.fn();
    const event = mockedBuild({
      level: 'error',
      message: 'boom',
      attributes: undefined,
      context: {},
      errorValue: new Error('still delivered'),
      serializeErrors: DEFAULT_LIMITS,
      onInternalError,
    });

    expect(event.error).toMatchObject({
      name: 'Error',
      message: 'still delivered',
    });
    expect(event.error!.causes).toBeUndefined();
    expect(onInternalError).toHaveBeenCalledTimes(1);
    expect(code(onInternalError.mock.calls[0]![0] as Error)).toBe(
      'error_serialize_failed',
    );

    vi.doUnmock('../../../src/errors/serialize-error.js');
    vi.resetModules();
  });

  it('without limits, buildLogEvent reduces errors exactly as before', () => {
    const event = buildLogEvent({
      level: 'error',
      message: 'boom',
      attributes: undefined,
      context: {},
      errorValue: new Error('flat', { cause: new Error('ignored') }),
    });

    expect(Object.keys(event.error!).sort()).toEqual([
      'message',
      'name',
      'stack',
    ]);
  });
});
