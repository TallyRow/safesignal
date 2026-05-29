/**
 * Sanitizer unit tests (T037).
 *
 * Covers every row of `contracts/sanitization.md` (S-1..S-9). S-10
 * (sanitizer-limit clamping) is owned by `tests/security/
 * sanitizer-limit-clamp.test.ts` (T047) and is not duplicated here.
 *
 * Coverage target: 100% line coverage in `src/pipeline/sanitizer.ts`
 * per `vitest.config.ts`. Tests exercise:
 *   - every type-tag branch (primitives, Date/Error, DOM nodes,
 *     framework objects, plain object vs. class instance)
 *   - bounds (depth, string length, array length, attribute count)
 *   - cycle handling
 *   - defensive helpers (Proxy-trapping getters, throwing
 *     prototype/constructor access, Invalid Date)
 *   - the "never throws" guarantee against pathological input
 *   - the "getter not invoked on class instances" security property
 */

import { describe, expect, it } from 'vitest';

import type { LogEvent } from '../../../src/api/types.js';
import { normalizeConfig } from '../../../src/config/config.js';
import { sanitize } from '../../../src/pipeline/sanitizer.js';
import { makeLogEvent } from '../../helpers/event-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configWithLimits(limits: {
  maxDepth?: number;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxAttributeCount?: number;
}) {
  return normalizeConfig({ sanitizerLimits: limits });
}

const defaultConfig = normalizeConfig({});

function sanitizeAttrs(
  attrs: Record<string, unknown>,
  config = defaultConfig,
): Record<string, unknown> {
  const event = makeLogEvent({ attributes: attrs as LogEvent['attributes'] });
  const out = sanitize(event, config)!;
  return out.attributes;
}

// ---------------------------------------------------------------------------
// S-1: input/output table rows
// ---------------------------------------------------------------------------

describe('S-1: input/output table', () => {
  it('keeps short strings unchanged', () => {
    expect(sanitizeAttrs({ s: 'hello' }).s).toBe('hello');
  });

  it('keeps finite numbers (including zero, negative, fractional)', () => {
    const out = sanitizeAttrs({ a: 0, b: -1.5, c: 42 });
    expect(out).toEqual({ a: 0, b: -1.5, c: 42 });
  });

  it('coerces NaN, Infinity, and -Infinity to null', () => {
    const out = sanitizeAttrs({ a: NaN, b: Infinity, c: -Infinity });
    expect(out).toEqual({ a: null, b: null, c: null });
  });

  it('coerces bigint to its string representation', () => {
    expect(sanitizeAttrs({ big: 123n as never }).big).toBe('123');
  });

  it('keeps booleans and null', () => {
    expect(sanitizeAttrs({ t: true, f: false, n: null })).toEqual({
      t: true,
      f: false,
      n: null,
    });
  });

  it('drops top-level keys whose value is undefined', () => {
    const out = sanitizeAttrs({ keep: 1, drop: undefined as never });
    expect(out).toEqual({ keep: 1 });
    expect('drop' in out).toBe(false);
  });

  it('coerces a valid Date to its ISO string', () => {
    const d = new Date('2026-05-27T12:34:56.789Z');
    expect(sanitizeAttrs({ d: d as never }).d).toBe('2026-05-27T12:34:56.789Z');
  });

  it('coerces an Invalid Date to null', () => {
    expect(sanitizeAttrs({ d: new Date('not-a-date') as never }).d).toBe(null);
  });

  it('coerces an Error in attributes to {name, message, stack?} and recurses', () => {
    const err = new TypeError('boom');
    const out = sanitizeAttrs({ err: err as never });
    expect(out.err).toMatchObject({ name: 'TypeError', message: 'boom' });
    // stack may or may not be present in happy-dom; if present, it's a string
    if ((out.err as { stack?: unknown }).stack !== undefined) {
      expect(typeof (out.err as { stack: unknown }).stack).toBe('string');
    }
  });

  it('coerces functions to "[Function]"', () => {
    expect(sanitizeAttrs({ f: (() => 1) as never }).f).toBe('[Function]');
  });

  it('coerces symbols to "[Symbol]"', () => {
    expect(sanitizeAttrs({ s: Symbol('x') as never }).s).toBe('[Symbol]');
  });

  it('keeps arrays of primitives unchanged', () => {
    expect(sanitizeAttrs({ a: [1, 'two', true, null] }).a).toEqual([
      1,
      'two',
      true,
      null,
    ]);
  });

  it('coerces undefined entries inside arrays to null', () => {
    const arr = [1, undefined, 3] as never;
    expect(sanitizeAttrs({ a: arr }).a).toEqual([1, null, 3]);
  });

  it('recurses into plain objects with `Object.prototype`', () => {
    expect(sanitizeAttrs({ outer: { inner: 'x' } }).outer).toEqual({ inner: 'x' });
  });

  it('recurses into objects with `null` prototype', () => {
    const nullProto = Object.create(null) as Record<string, unknown>;
    nullProto.inner = 'x';
    expect(sanitizeAttrs({ outer: nullProto as never }).outer).toEqual({ inner: 'x' });
  });
});

// ---------------------------------------------------------------------------
// S-2: never throws (defensive belt)
// ---------------------------------------------------------------------------

describe('S-2: sanitizer never throws on any input', () => {
  it('handles a plain object with a throwing own-property getter without throwing', () => {
    const trap: Record<string, unknown> = {};
    Object.defineProperty(trap, 'boom', {
      enumerable: true,
      get() {
        throw new Error('getter explosion');
      },
    });
    expect(() => sanitizeAttrs({ trap: trap as never })).not.toThrow();
    const out = sanitizeAttrs({ trap: trap as never });
    expect((out.trap as Record<string, unknown>).boom).toBe('[Unserializable]');
  });

  it('handles a Proxy with throwing `ownKeys` trap', () => {
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys explosion');
        },
      },
    );
    expect(() => sanitizeAttrs({ trap: trap as never })).not.toThrow();
  });

  it('handles a Proxy with throwing `getPrototypeOf` trap', () => {
    const trap = new Proxy(
      {},
      {
        getPrototypeOf() {
          throw new Error('proto explosion');
        },
      },
    );
    expect(() => sanitizeAttrs({ trap: trap as never })).not.toThrow();
  });

  it('handles deeply mixed pathological inputs in a single event without throwing', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    expect(() =>
      sanitizeAttrs({
        cyclic: cyclic as never,
        deeplyNested: { a: { b: { c: { d: { e: { f: { g: { h: 'leaf' } } } } } } } } as never,
        invalid: new Date('not-a-date') as never,
        bigArr: new Array(2000).fill(1) as never,
      }),
    ).not.toThrow();
  });

  it('handles an Error whose name/message/stack getters throw', () => {
    const err = new Error('original');
    // Define the `stack` getter FIRST, while `name`/`message` are still
    // plain. On Node 20's V8, `Object.defineProperty(err, 'stack', …)`
    // settles the lazy stack accessor, which formats the error by reading
    // `name`/`message`; if those already threw, the throw would escape
    // here in setup (before the sanitizer runs). Node 22 doesn't do this.
    // Defining stack first keeps the test portable across both.
    Object.defineProperty(err, 'stack', {
      get() {
        throw new Error('stack explosion');
      },
    });
    Object.defineProperty(err, 'name', {
      get() {
        throw new Error('name explosion');
      },
    });
    Object.defineProperty(err, 'message', {
      get() {
        throw new Error('message explosion');
      },
    });
    expect(() => sanitizeAttrs({ err: err as never })).not.toThrow();
    const out = sanitizeAttrs({ err: err as never });
    // safeString fallback for name is 'Error'; message falls back to '';
    // stack is omitted via safeOptional.
    const reduced = out.err as Record<string, unknown>;
    expect(reduced.name).toBe('Error');
    expect(reduced.message).toBe('');
    expect('stack' in reduced).toBe(false);
  });

  it('handles an Error whose name/message/stack getters return non-strings', () => {
    // safeString / safeOptional return their fallback when the captured
    // value is not a string — independent of the throw path tested above.
    const err = new Error('original');
    Object.defineProperty(err, 'name', { get: () => 123 });
    Object.defineProperty(err, 'message', { get: () => [1, 2] });
    Object.defineProperty(err, 'stack', { get: () => true });
    const out = sanitizeAttrs({ err: err as never });
    const reduced = out.err as Record<string, unknown>;
    expect(reduced.name).toBe('Error'); // safeString fallback
    expect(reduced.message).toBe(''); // safeString fallback for empty
    expect('stack' in reduced).toBe(false); // safeOptional → undefined → dropped
  });

  it('handles a class instance whose prototype throws on `constructor` access', () => {
    // Force getConstructorName's catch branch by giving the value a
    // prototype that's itself a Proxy with a throwing `get` trap. The
    // prototype lookup succeeds (returning the proxy), but reading
    // `.constructor` on the proxy invokes the trap and throws.
    const throwingProto = new Proxy(
      {},
      {
        get(_target, key) {
          if (key === 'constructor') throw new Error('constructor explosion');
          return undefined;
        },
      },
    );
    const obj = Object.create(throwingProto) as object;
    expect(sanitizeAttrs({ obj: obj as never }).obj).toBe('[Object]');
  });
});

// ---------------------------------------------------------------------------
// S-3: class instances type-tagged, getters NOT invoked
// ---------------------------------------------------------------------------

describe('S-3: class instances are type-tagged; getters are NOT invoked', () => {
  it('type-tags a class instance by its constructor name', () => {
    class Order {
      id = 1;
    }
    expect(sanitizeAttrs({ o: new Order() as never }).o).toBe('[Order]');
  });

  it('does NOT invoke a `password` getter on a class instance', () => {
    let getterCalls = 0;
    class Account {
      // eslint-disable-next-line @typescript-eslint/class-literal-property-style
      get password(): string {
        getterCalls++;
        return 'secret123';
      }
    }
    const out = sanitizeAttrs({ acct: new Account() as never });
    expect(out.acct).toBe('[Account]');
    expect(getterCalls).toBe(0);
  });

  it('falls back to "Object" when the constructor name is missing or non-string', () => {
    // Object with a custom prototype whose constructor has no name
    const proto = Object.create(Object.prototype) as { constructor: { name: unknown } };
    proto.constructor = { name: '' };
    const instance = Object.create(proto) as object;
    expect(sanitizeAttrs({ i: instance as never }).i).toBe('[Object]');
  });
});

// ---------------------------------------------------------------------------
// S-4: DOM nodes are type-tagged
// ---------------------------------------------------------------------------

describe('S-4: DOM nodes are type-tagged, not recursed', () => {
  it('tags an Element with its lowercase tagName', () => {
    const el = document.createElement('div');
    expect(sanitizeAttrs({ el: el as never }).el).toBe('[Element:div]');
  });

  it('tags a Document with some bracketed type tag (real browsers return "[Document]"; happy-dom returns "[Node]")', () => {
    // The security property is "type-tagged, not recursed". The exact tag
    // varies between real browsers and happy-dom because happy-dom's
    // `document` does not pass `instanceof Document` for the test-realm's
    // `Document` global. In every env the result MUST be a single tag
    // string (no recursion into the document object).
    const tag = sanitizeAttrs({ d: document as never }).d;
    expect(typeof tag).toBe('string');
    expect(tag as string).toMatch(/^\[(Document|Node)\]$/);
  });

  it('tags an object whose prototype chain includes Document.prototype with "[Document]"', () => {
    // Synthetic test that exercises the explicit Document branch even when
    // happy-dom's `document` instance does not pass `instanceof Document`.
    const fakeDoc = Object.create(Document.prototype) as object;
    expect(sanitizeAttrs({ d: fakeDoc as never }).d).toBe('[Document]');
  });

  it('tags a Window with some bracketed type tag (real browsers return "[Window]"; happy-dom returns "[Object]")', () => {
    const tag = sanitizeAttrs({ w: window as never }).w;
    expect(typeof tag).toBe('string');
    // Accepts the canonical tag plus the happy-dom fallback through the
    // class-instance / plain-object path.
    expect(tag as string).toMatch(/^\[(Window|Object|.+Window)\]$/);
  });

  it('tags an object whose prototype chain includes Window.prototype with "[Window]"', () => {
    const fakeWin = Object.create(Window.prototype) as object;
    expect(sanitizeAttrs({ w: fakeWin as never }).w).toBe('[Window]');
  });

  it('falls back to "element" when tagName access throws', () => {
    const el = document.createElement('span');
    Object.defineProperty(el, 'tagName', {
      get() {
        throw new Error('tagName throws');
      },
    });
    expect(sanitizeAttrs({ el: el as never }).el).toBe('[Element:element]');
  });

  it('falls back to "element" when tagName returns a non-string', () => {
    const el = document.createElement('p');
    Object.defineProperty(el, 'tagName', { get: () => 42 });
    expect(sanitizeAttrs({ el: el as never }).el).toBe('[Element:element]');
  });

  it('falls back to "element" when tagName returns an empty string', () => {
    const el = document.createElement('p');
    Object.defineProperty(el, 'tagName', { get: () => '' });
    expect(sanitizeAttrs({ el: el as never }).el).toBe('[Element:element]');
  });
});

// ---------------------------------------------------------------------------
// Framework type tags
// ---------------------------------------------------------------------------

describe('framework type tags (rows from the input/output table)', () => {
  it('tags an Event with its type', () => {
    const ev = new Event('click');
    expect(sanitizeAttrs({ e: ev as never }).e).toBe('[Event:click]');
  });

  it('falls back to "event" when the Event.type access throws', () => {
    const ev = new Event('click');
    Object.defineProperty(ev, 'type', {
      get() {
        throw new Error('type throws');
      },
    });
    expect(sanitizeAttrs({ e: ev as never }).e).toBe('[Event:event]');
  });

  it('falls back to "event" when Event.type returns a non-string', () => {
    const ev = new Event('click');
    Object.defineProperty(ev, 'type', { get: () => 42 });
    expect(sanitizeAttrs({ e: ev as never }).e).toBe('[Event:event]');
  });

  it('tags a Promise', () => {
    expect(sanitizeAttrs({ p: Promise.resolve(1) as never }).p).toBe('[Promise]');
  });

  it('tags Map / Set / WeakMap / WeakSet', () => {
    expect(sanitizeAttrs({ m: new Map() as never }).m).toBe('[Map]');
    expect(sanitizeAttrs({ s: new Set() as never }).s).toBe('[Set]');
    expect(sanitizeAttrs({ wm: new WeakMap() as never }).wm).toBe('[WeakMap]');
    expect(sanitizeAttrs({ ws: new WeakSet() as never }).ws).toBe('[WeakSet]');
  });

  it('tags Blob, FormData, URL', () => {
    expect(sanitizeAttrs({ b: new Blob([]) as never }).b).toBe('[Blob]');
    expect(sanitizeAttrs({ f: new FormData() as never }).f).toBe('[FormData]');
    expect(sanitizeAttrs({ u: new URL('https://x/') as never }).u).toBe('[URL]');
  });

  it('tags Request / Response when available', () => {
    if (typeof Request !== 'undefined') {
      expect(sanitizeAttrs({ r: new Request('https://x/') as never }).r).toBe('[Request]');
    }
    if (typeof Response !== 'undefined') {
      expect(sanitizeAttrs({ r: new Response() as never }).r).toBe('[Response]');
    }
  });
});

// ---------------------------------------------------------------------------
// S-5: cyclic references
// ---------------------------------------------------------------------------

describe('S-5: cyclic references collapse to "[Circular]"', () => {
  it('replaces a direct self-reference with "[Circular]"', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    const out = sanitizeAttrs({ cyclic: cyclic as never });
    const inner = out.cyclic as Record<string, unknown>;
    expect(inner.tag).toBe('root');
    expect(inner.self).toBe('[Circular]');
  });

  it('replaces a cycle through an array with "[Circular]"', () => {
    const cyclic: { items: unknown[] } = { items: [] };
    cyclic.items.push(cyclic);
    const out = sanitizeAttrs({ cyclic: cyclic as never });
    const inner = out.cyclic as { items: unknown[] };
    expect(inner.items[0]).toBe('[Circular]');
  });

  it('does NOT false-positive on the same non-cyclic object referenced twice', () => {
    const shared = { v: 1 };
    const out = sanitizeAttrs({ obj: { a: shared, b: shared } as never });
    const inner = out.obj as Record<string, unknown>;
    expect(inner.a).toEqual({ v: 1 });
    expect(inner.b).toEqual({ v: 1 });
  });
});

// ---------------------------------------------------------------------------
// S-6: depth limit
// ---------------------------------------------------------------------------

describe('S-6: depth limit produces "[MaxDepth]" at the boundary', () => {
  it('returns "[MaxDepth]" when depth exceeds the configured maximum', () => {
    const cfg = configWithLimits({ maxDepth: 2 });
    const out = sanitizeAttrs(
      { a: { b: { c: { d: { e: 'too-deep' } } } } } as Record<string, unknown>,
      cfg,
    );
    // a (depth 1) → object, b (depth 2) → object, c (depth 3 > 2) → '[MaxDepth]'
    const a = out.a as Record<string, unknown>;
    const b = a.b as Record<string, unknown>;
    expect(b.c).toBe('[MaxDepth]');
  });

  it('allows depth EXACTLY at the limit', () => {
    const cfg = configWithLimits({ maxDepth: 2 });
    const out = sanitizeAttrs(
      { a: { b: 'kept' } } as Record<string, unknown>,
      cfg,
    );
    expect((out.a as Record<string, unknown>).b).toBe('kept');
  });
});

// ---------------------------------------------------------------------------
// S-7: array length limit
// ---------------------------------------------------------------------------

describe('S-7: array length limit produces the documented truncation marker', () => {
  it('truncates an over-long array to maxArrayLength and appends a marker', () => {
    // maxArrayLength min is 1
    const cfg = configWithLimits({ maxArrayLength: 1 });
    const out = sanitizeAttrs({ arr: [1, 2, 3, 4, 5] }, cfg);
    expect(out.arr).toEqual([1, '[Truncated: 4 elements omitted]']);
  });

  it('leaves arrays at-or-under the limit unchanged', () => {
    const cfg = configWithLimits({ maxArrayLength: 5 });
    const out = sanitizeAttrs({ arr: [1, 2, 3] }, cfg);
    expect(out.arr).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// S-8: attribute count limit
// ---------------------------------------------------------------------------

describe('S-8: attribute count limit produces the documented truncation marker', () => {
  it('keeps the first N keys and attaches a single top-level truncation marker', () => {
    const cfg = configWithLimits({ maxAttributeCount: 2 });
    const out = sanitizeAttrs({ a: 1, b: 2, c: 3, d: 4 }, cfg);
    // Two kept, two omitted → one marker
    expect(out.a).toBe(1);
    expect(out.b).toBe(2);
    expect(out.c).toBeUndefined();
    expect(out.d).toBeUndefined();
    expect(out['__truncated__']).toBe('[Truncated: 2 keys omitted]');
  });

  it('does NOT attach a truncation marker when nothing was omitted', () => {
    const cfg = configWithLimits({ maxAttributeCount: 10 });
    const out = sanitizeAttrs({ a: 1, b: 2 }, cfg);
    expect(out['__truncated__']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// S-9: string length limit
// ---------------------------------------------------------------------------

describe('S-9: string length limit truncates with "...[truncated]" suffix', () => {
  it('truncates an over-long attribute string with the documented suffix', () => {
    const cfg = configWithLimits({ maxStringLength: 64 }); // min is 64
    const longStr = 'a'.repeat(100);
    const out = sanitizeAttrs({ s: longStr }, cfg);
    expect(out.s).toBe('a'.repeat(64) + '...[truncated]');
  });

  it('truncates the event message itself', () => {
    const cfg = configWithLimits({ maxStringLength: 64 });
    const event = makeLogEvent({ message: 'x'.repeat(200) });
    const out = sanitize(event, cfg)!;
    expect(out.message).toBe('x'.repeat(64) + '...[truncated]');
  });

  it('truncates strings inside Error info', () => {
    const cfg = configWithLimits({ maxStringLength: 64 });
    const event = makeLogEvent({
      error: {
        name: 'x'.repeat(100),
        message: 'y'.repeat(100),
        stack: 'z'.repeat(100),
      },
    });
    const out = sanitize(event, cfg)!;
    expect(out.error?.name).toBe('x'.repeat(64) + '...[truncated]');
    expect(out.error?.message).toBe('y'.repeat(64) + '...[truncated]');
    expect(out.error?.stack).toBe('z'.repeat(64) + '...[truncated]');
  });

  it('leaves strings at-or-under the limit unchanged', () => {
    const cfg = configWithLimits({ maxStringLength: 64 });
    const out = sanitizeAttrs({ s: 'short string' }, cfg);
    expect(out.s).toBe('short string');
  });
});

// ---------------------------------------------------------------------------
// Context handling + ErrorInfo without stack
// ---------------------------------------------------------------------------

describe('event-shape passes (top-level fields)', () => {
  it('passes through when context.attributes is undefined', () => {
    const event = makeLogEvent({
      context: { application: { name: 'a' } }, // no attributes
    });
    const out = sanitize(event, defaultConfig)!;
    expect(out.context).toEqual({ application: { name: 'a' } });
  });

  it('sanitizes context.attributes when present', () => {
    const event = makeLogEvent({
      context: {
        application: { name: 'a' },
        attributes: { token: 'kept-by-sanitizer-only' },
      },
    });
    const out = sanitize(event, defaultConfig)!;
    expect(out.context.attributes).toEqual({ token: 'kept-by-sanitizer-only' });
  });

  it('omits error.stack when the source error.stack is undefined', () => {
    const event = makeLogEvent({
      error: { name: 'E', message: 'short' },
    });
    const out = sanitize(event, defaultConfig)!;
    expect(out.error?.name).toBe('E');
    expect(out.error?.message).toBe('short');
    expect(out.error).not.toHaveProperty('stack');
  });

  it('returns {} attributes when the top-level attributes value is malformed', () => {
    // Forced via type cast; runtime should defensively coerce.
    const event = makeLogEvent({ attributes: null as never });
    const out = sanitize(event, defaultConfig)!;
    expect(out.attributes).toEqual({});
  });

  it('returns {} attributes when the top-level attributes value is an array', () => {
    const event = makeLogEvent({ attributes: [] as never });
    const out = sanitize(event, defaultConfig)!;
    expect(out.attributes).toEqual({});
  });
});
