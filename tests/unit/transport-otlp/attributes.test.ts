/**
 * T008 [US1] — Unit tests for the `AttributeValue` → OTLP `AnyValue`
 * encoder (OP-5). Total + non-throwing over the union.
 */

import { describe, expect, it } from 'vitest';

import {
  toAnyValue,
  toKeyValues,
} from '../../../src/transport-otlp/attributes.js';

describe('toAnyValue', () => {
  it('encodes a string', () => {
    expect(toAnyValue('hi')).toEqual({ stringValue: 'hi' });
  });

  it('encodes a boolean', () => {
    expect(toAnyValue(true)).toEqual({ boolValue: true });
  });

  it('encodes an integer as intValue (string)', () => {
    expect(toAnyValue(42)).toEqual({ intValue: '42' });
    expect(toAnyValue(0)).toEqual({ intValue: '0' });
    expect(toAnyValue(-7)).toEqual({ intValue: '-7' });
  });

  it('encodes a non-integer number as doubleValue', () => {
    expect(toAnyValue(3.14)).toEqual({ doubleValue: 3.14 });
  });

  it('encodes null as an empty (unset) AnyValue', () => {
    expect(toAnyValue(null)).toEqual({});
  });

  it('encodes an array recursively', () => {
    expect(toAnyValue(['a', 1, true])).toEqual({
      arrayValue: {
        values: [{ stringValue: 'a' }, { intValue: '1' }, { boolValue: true }],
      },
    });
  });

  it('encodes a nested object as a kvlistValue', () => {
    expect(toAnyValue({ k: 'v', n: 2 })).toEqual({
      kvlistValue: {
        values: [
          { key: 'k', value: { stringValue: 'v' } },
          { key: 'n', value: { intValue: '2' } },
        ],
      },
    });
  });

  it('is total over deep nesting without throwing', () => {
    const deep = { a: [{ b: [1, { c: null }] }] };
    expect(() => toAnyValue(deep)).not.toThrow();
  });
});

describe('toKeyValues', () => {
  it('maps a record to KeyValue[]', () => {
    expect(toKeyValues({ a: 'x', b: 1 })).toEqual([
      { key: 'a', value: { stringValue: 'x' } },
      { key: 'b', value: { intValue: '1' } },
    ]);
  });

  it('applies a key prefix', () => {
    expect(toKeyValues({ env: 'prod' }, 'context.')).toEqual([
      { key: 'context.env', value: { stringValue: 'prod' } },
    ]);
  });

  it('returns an empty array for an empty record', () => {
    expect(toKeyValues({})).toEqual([]);
  });
});
