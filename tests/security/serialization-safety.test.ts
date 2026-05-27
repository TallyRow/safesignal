/**
 * Serialization-safety security test (T044).
 *
 * Covers FR-016 (prefer structured log events — no uncontrolled
 * dumping of arbitrary objects) and FR-018 (conservative documented
 * safe handling for unknown / nested / malformed / cyclic /
 * unexpectedly large input).
 *
 * Asserts that every pathological input goes through the sanitizer's
 * documented coercion outputs (truncation markers, type tags, cycle
 * markers, depth markers) before any transport sees an event — and
 * that the sanitizer NEVER throws under any of these inputs.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Attributes } from '../../src/api/types.js';
import { configureLogging, createLogger } from '../../src/index.js';
import { makeCapturingTransport } from '../helpers/failing-transport.js';

const APP = { name: 'serialization-safety', version: '1.0.0' };

let capture = makeCapturingTransport('capture');

beforeEach(() => {
  capture = makeCapturingTransport('capture');
  configureLogging({
    application: APP,
    environment: 'development',
    level: 'debug',
    transports: [capture],
  });
});

describe('FR-016 + FR-018: pathological input produces documented coercion outputs', () => {
  it('coerces cyclic objects to "[Circular]" without looping', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    const log = createLogger();
    expect(() => log.info('cyclic', { c: cyclic as never })).not.toThrow();
    const c = capture.calls[0]!.attributes.c as Record<string, unknown>;
    expect(c.tag).toBe('root');
    expect(c.self).toBe('[Circular]');
  });

  it('coerces depth > 8 to "[MaxDepth]"', () => {
    // 10 levels deep, well past the default maxDepth=8.
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < 10; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    cursor.leaf = 'should-not-appear';
    const log = createLogger();
    expect(() => log.info('deep', { d: deep as never })).not.toThrow();
    // Walk into the captured event up to the contracted boundary.
    let probe: unknown = capture.calls[0]!.attributes.d;
    let depth = 0;
    while (
      depth < 20 &&
      probe !== null &&
      typeof probe === 'object' &&
      'next' in (probe as Record<string, unknown>)
    ) {
      probe = (probe as Record<string, unknown>).next;
      depth++;
    }
    // The walk terminates at "[MaxDepth]", not at the original leaf.
    expect(probe).toBe('[MaxDepth]');
  });

  it('coerces arrays > 1000 elements with the documented truncation marker', () => {
    const long: number[] = [];
    for (let i = 0; i < 1500; i++) long.push(i);
    const log = createLogger();
    expect(() => log.info('long', { a: long })).not.toThrow();
    const a = capture.calls[0]!.attributes.a as unknown[];
    expect(a).toHaveLength(1001); // 1000 kept + 1 marker
    expect(a[1000]).toBe('[Truncated: 500 elements omitted]');
  });

  it('truncates strings > 8192 chars with "...[truncated]" suffix', () => {
    const huge = 'x'.repeat(9000);
    const log = createLogger();
    expect(() => log.info('huge', { s: huge })).not.toThrow();
    const s = capture.calls[0]!.attributes.s as string;
    expect(s).toBe('x'.repeat(8192) + '...[truncated]');
  });

  it('type-tags DOM nodes (Element) instead of recursing', () => {
    const el = document.createElement('div');
    el.id = 'attacker';
    el.innerHTML = '<script>alert(1)</script>'; // hostile content; must NOT appear
    const log = createLogger();
    log.info('dom', { node: el as never });
    const node = capture.calls[0]!.attributes.node as string;
    expect(node).toBe('[Element:div]');
    expect(JSON.stringify(capture.calls[0]!)).not.toContain('alert(1)');
    expect(JSON.stringify(capture.calls[0]!)).not.toContain('innerHTML');
  });

  it('type-tags framework objects (Event, Promise, Map, Set, Request, Response, Blob, FormData, URL)', () => {
    const log = createLogger();
    log.info('framework', {
      event: new Event('click') as never,
      promise: Promise.resolve(1) as never,
      map: new Map([['k', 'v']]) as never,
      set: new Set([1, 2, 3]) as never,
      blob: new Blob([]) as never,
      formData: new FormData() as never,
      url: new URL('https://example.com/') as never,
    });
    const a = capture.calls[0]!.attributes;
    expect(a.event).toBe('[Event:click]');
    expect(a.promise).toBe('[Promise]');
    expect(a.map).toBe('[Map]');
    expect(a.set).toBe('[Set]');
    expect(a.blob).toBe('[Blob]');
    expect(a.formData).toBe('[FormData]');
    expect(a.url).toBe('[URL]');
    if (typeof Request !== 'undefined') {
      log.info('request', { r: new Request('https://x/') as never });
      expect(capture.calls[1]!.attributes.r).toBe('[Request]');
    }
    if (typeof Response !== 'undefined') {
      log.info('response', { r: new Response() as never });
      const lastIdx = capture.calls.length - 1;
      expect(capture.calls[lastIdx]!.attributes.r).toBe('[Response]');
    }
  });

  it('type-tags functions as "[Function]"', () => {
    const log = createLogger();
    log.info('fn', { f: ((x: number) => x + 1) as never });
    expect(capture.calls[0]!.attributes.f).toBe('[Function]');
  });

  it('type-tags class instances by constructor name, NOT recursing into properties or invoking getters', () => {
    let getterCalls = 0;
    class Credential {
      // eslint-disable-next-line @typescript-eslint/class-literal-property-style
      get password(): string {
        getterCalls++;
        return 'leak';
      }
      readonly id = 'safe-id';
    }
    const log = createLogger();
    log.info('class', { c: new Credential() as never });
    expect(capture.calls[0]!.attributes.c).toBe('[Credential]');
    expect(getterCalls).toBe(0);
    // The structured event does not leak any property of the class.
    expect(JSON.stringify(capture.calls[0]!)).not.toContain('leak');
    expect(JSON.stringify(capture.calls[0]!)).not.toContain('safe-id');
  });

  it('truncates the cumulative attribute count to the documented max with one marker', () => {
    // Default maxAttributeCount = 256. Build 300 keys.
    const attrs: Attributes = {};
    for (let i = 0; i < 300; i++) attrs[`k${String(i)}`] = i;
    const log = createLogger();
    expect(() => log.info('many', attrs)).not.toThrow();
    const out = capture.calls[0]!.attributes;
    // First 256 keys kept + one truncation marker key.
    expect(out.__truncated__).toBe('[Truncated: 44 keys omitted]');
  });

  it('coerces NaN, Infinity, -Infinity to null', () => {
    const log = createLogger();
    log.info('nan', { a: NaN, b: Infinity, c: -Infinity });
    expect(capture.calls[0]!.attributes).toMatchObject({ a: null, b: null, c: null });
  });

  it('coerces bigint to its string representation', () => {
    const log = createLogger();
    log.info('bigint', { x: 9007199254740993n as never });
    expect(capture.calls[0]!.attributes.x).toBe('9007199254740993');
  });

  it('coerces symbols to "[Symbol]"', () => {
    const log = createLogger();
    log.info('symbol', { x: Symbol('secret') as never });
    expect(capture.calls[0]!.attributes.x).toBe('[Symbol]');
  });

  it('coerces a valid Date to ISO string and Invalid Date to null', () => {
    const valid = new Date('2026-05-27T12:00:00.000Z');
    const invalid = new Date('not-a-date');
    const log = createLogger();
    log.info('dates', { v: valid as never, i: invalid as never });
    expect(capture.calls[0]!.attributes.v).toBe('2026-05-27T12:00:00.000Z');
    expect(capture.calls[0]!.attributes.i).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// FR-018: sanitizer never throws (composite stress)
// ---------------------------------------------------------------------------

describe('FR-018: sanitizer never throws under mixed pathological inputs', () => {
  it('handles a single event combining every category without throwing', () => {
    const cyclic: Record<string, unknown> = { tag: 'root' };
    cyclic.self = cyclic;
    const deep: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = deep;
    for (let i = 0; i < 12; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const huge = 'x'.repeat(20000);
    const wideArr: number[] = [];
    for (let i = 0; i < 2000; i++) wideArr.push(i);
    class Insecure {
      // eslint-disable-next-line @typescript-eslint/class-literal-property-style
      get password(): string {
        throw new Error('explosion');
      }
    }
    const trap = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys');
        },
        getPrototypeOf() {
          throw new Error('proto');
        },
      },
    );

    const log = createLogger();
    expect(() =>
      log.info('mixed-pathological', {
        cyclic: cyclic as never,
        deep: deep as never,
        huge,
        wideArr,
        instance: new Insecure() as never,
        proxy: trap as never,
        invalidDate: new Date('not-a-date') as never,
        bigint: 1234567890n as never,
        nan: NaN,
        symbol: Symbol('x') as never,
        domNode: document.createElement('span') as never,
        framework: new Map([['k', 'v']]) as never,
        fn: (() => 'leak') as never,
      }),
    ).not.toThrow();
    expect(capture.calls).toHaveLength(1);
  });

  it('handles a 1000-event stress with mixed pathological input without throwing', () => {
    const cyclic: Record<string, unknown> = { tag: 'r' };
    cyclic.self = cyclic;
    const log = createLogger();
    expect(() => {
      for (let i = 0; i < 1000; i++) {
        log.info(`event-${String(i)}`, {
          i,
          cyclic: cyclic as never,
          big: 'x'.repeat(10000),
        });
      }
    }).not.toThrow();
    expect(capture.calls).toHaveLength(1000);
  });
});
