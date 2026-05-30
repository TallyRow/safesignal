/**
 * T014 [US3] — Unit tests for `parseTraceparent` (TC-5, research D2).
 *
 * Valid header → `TraceContext`; any shape violation → `undefined`
 * (never throws); `tracestate` attached + bounded.
 */

import { describe, expect, it } from 'vitest';

import { parseTraceparent } from '../../../src/trace/traceparent.js';

const HEADER = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('parseTraceparent', () => {
  it('parses a valid traceparent', () => {
    expect(parseTraceparent(HEADER)).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
    });
  });

  it('parses flags 00 as traceFlags 0', () => {
    const h = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00';
    expect(parseTraceparent(h)).toMatchObject({ traceFlags: 0 });
  });

  it('attaches a bounded tracestate', () => {
    expect(parseTraceparent(HEADER, 'vendor=abc')).toMatchObject({
      traceState: 'vendor=abc',
    });
  });

  it('returns undefined on shape violations (never throws)', () => {
    const bad = [
      '',
      'not-a-header',
      '00-tooshort-00f067aa0ba902b7-01',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-short-01',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7', // missing flags
      'zz-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', // bad version hex
      'ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01', // version ff invalid
      '00-00000000000000000000000000000000-00f067aa0ba902b7-01', // all-zero traceId
    ];
    for (const h of bad) {
      expect(() => parseTraceparent(h)).not.toThrow();
      expect(parseTraceparent(h)).toBeUndefined();
    }
  });

  it('returns undefined for non-string input', () => {
    expect(parseTraceparent(undefined as unknown as string)).toBeUndefined();
  });
});
