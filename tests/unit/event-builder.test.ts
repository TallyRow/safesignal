/**
 * Unit tests for `src/pipeline/event-builder.ts`.
 *
 * Locks the T020 negative-runtime invariants directly at the builder:
 *   - consumer-supplied `timestamp` is impossible (no such parameter) and
 *     even an extra key on the input is ignored — every event gets a fresh
 *     ISO-8601 timestamp;
 *   - per-call `attributes` and `context.attributes` remain separate
 *     references; mutating one does not bleed into the other;
 *   - `errorValue` is reduced to the documented `ErrorInfo` shape (no raw
 *     `Error` instance ever attached).
 *
 * Complements the integration-level coverage in
 * `tests/contract/log-event.contract.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  buildLogEvent,
  reduceError,
} from '../../src/pipeline/event-builder.js';

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('buildLogEvent', () => {
  describe('timestamp assignment', () => {
    it('assigns an ISO-8601 timestamp on every call', () => {
      const event = buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: undefined,
      });
      expect(event.timestamp).toMatch(ISO_8601_RE);
      expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
    });

    it('the input shape has no `timestamp` parameter (type-level)', () => {
      buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: undefined,
        // @ts-expect-error — `timestamp` is NOT part of BuildLogEventInput
        timestamp: '1999-01-01T00:00:00.000Z',
      });
    });

    it('even when an extra `timestamp` key is forced at runtime, the assigned timestamp is fresh', () => {
      // Bypass the type system via `as unknown as ...` to simulate a
      // consumer ignoring TypeScript (e.g., JavaScript-only callers).
      const forcedInput = {
        level: 'info',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: undefined,
        timestamp: '1999-01-01T00:00:00.000Z',
      } as unknown as Parameters<typeof buildLogEvent>[0];
      const event = buildLogEvent(forcedInput);
      expect(event.timestamp).not.toBe('1999-01-01T00:00:00.000Z');
      expect(event.timestamp).toMatch(ISO_8601_RE);
    });

    it('two successive emits produce timestamps that are both well-formed and not stuck at the same value across a short delay', async () => {
      const a = buildLogEvent({
        level: 'info',
        message: 'a',
        attributes: undefined,
        context: {},
        errorValue: undefined,
      });
      // Yield long enough that the millisecond field can advance.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const b = buildLogEvent({
        level: 'info',
        message: 'b',
        attributes: undefined,
        context: {},
        errorValue: undefined,
      });
      expect(a.timestamp).toMatch(ISO_8601_RE);
      expect(b.timestamp).toMatch(ISO_8601_RE);
      expect(Date.parse(b.timestamp)).toBeGreaterThanOrEqual(Date.parse(a.timestamp));
    });
  });

  describe('attributes / context separation', () => {
    it('defaults attributes to {} when undefined is passed', () => {
      const event = buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: undefined,
      });
      expect(event.attributes).toEqual({});
      expect(typeof event.attributes).toBe('object');
      expect(Array.isArray(event.attributes)).toBe(false);
    });

    it('event.attributes and event.context.attributes are separate references', () => {
      const callAttrs = { call: 1 };
      const contextAttrs = { ctx: 2 };
      const event = buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: callAttrs,
        context: { attributes: contextAttrs },
        errorValue: undefined,
      });
      expect(event.attributes).not.toBe(event.context.attributes);
    });

    it('mutating event.attributes does NOT bleed into event.context.attributes', () => {
      const callAttrs = { call: 1 };
      const contextAttrs = { ctx: 2 };
      const event = buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: callAttrs,
        context: { attributes: contextAttrs },
        errorValue: undefined,
      });
      (event.attributes as Record<string, unknown>).injected = 'value';
      expect(event.context.attributes).toEqual({ ctx: 2 });
      expect(
        (event.context.attributes as Record<string, unknown>).injected,
      ).toBeUndefined();
    });

    it('buildLogEvent does NOT mutate the input context or attributes objects', () => {
      const ctxAttrs = { x: 1 };
      const ctx = { attributes: ctxAttrs };
      const callAttrs = { y: 2 };
      buildLogEvent({
        level: 'info',
        message: 'm',
        attributes: callAttrs,
        context: ctx,
        errorValue: undefined,
      });
      // Originals are untouched.
      expect(ctx.attributes).toBe(ctxAttrs);
      expect(ctxAttrs).toEqual({ x: 1 });
      expect(callAttrs).toEqual({ y: 2 });
    });
  });

  describe('error reduction', () => {
    it('event.error is undefined when errorValue is undefined', () => {
      const event = buildLogEvent({
        level: 'error',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: undefined,
      });
      expect(event.error).toBeUndefined();
    });

    it('reduces Error to ErrorInfo with name + message + stack; never holds the raw Error', () => {
      const original = new TypeError('boom');
      const event = buildLogEvent({
        level: 'error',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: original,
      });
      expect(event.error?.name).toBe('TypeError');
      expect(event.error?.message).toBe('boom');
      expect(typeof event.error?.stack).toBe('string');
      expect(event.error).not.toBeInstanceOf(Error);
      // No reference to the original Error instance.
      expect(event.error).not.toBe(original);
    });

    it('reduces non-Error values to { name: "NonError", message: String(value) }', () => {
      const event = buildLogEvent({
        level: 'error',
        message: 'm',
        attributes: undefined,
        context: {},
        errorValue: 'plain string',
      });
      expect(event.error).toEqual({ name: 'NonError', message: 'plain string' });
    });

    it('reduces objects, numbers, and null without throwing', () => {
      for (const value of [42, null, { a: 1 }, [], false]) {
        const event = buildLogEvent({
          level: 'error',
          message: 'm',
          attributes: undefined,
          context: {},
          errorValue: value,
        });
        expect(event.error?.name).toBe('NonError');
        expect(typeof event.error?.message).toBe('string');
      }
    });
  });

  describe('event shape', () => {
    it('produces an event with exactly the documented keys when no error is passed', () => {
      const event = buildLogEvent({
        level: 'info',
        message: 'hi',
        attributes: { a: 1 },
        context: { application: { name: 'app' } },
        errorValue: undefined,
      });
      const keys = Object.keys(event).sort();
      expect(keys).toEqual(['attributes', 'context', 'level', 'message', 'timestamp']);
    });

    it('adds the `error` key only when errorValue is provided', () => {
      const withError = buildLogEvent({
        level: 'error',
        message: 'oops',
        attributes: undefined,
        context: {},
        errorValue: new Error('boom'),
      });
      expect(Object.keys(withError).sort()).toEqual([
        'attributes',
        'context',
        'error',
        'level',
        'message',
        'timestamp',
      ]);
    });
  });
});

describe('reduceError (exported helper)', () => {
  it('Error subclass → preserves name', () => {
    expect(reduceError(new RangeError('r'))).toMatchObject({
      name: 'RangeError',
      message: 'r',
    });
  });

  it('Error with no stack → ErrorInfo without stack', () => {
    const err = new Error('m');
    // Some runtimes set stack on construction; deleting forces the
    // no-stack branch deterministically.
    delete (err as { stack?: string }).stack;
    const info = reduceError(err);
    expect(info.name).toBe('Error');
    expect(info.message).toBe('m');
    expect('stack' in info).toBe(false);
  });

  it('coerces object to NonError with String(value) message', () => {
    expect(reduceError({ foo: 'bar' })).toEqual({
      name: 'NonError',
      message: '[object Object]',
    });
  });

  it('coerces undefined to NonError with "undefined" message', () => {
    expect(reduceError(undefined)).toEqual({
      name: 'NonError',
      message: 'undefined',
    });
  });
});
