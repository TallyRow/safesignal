/**
 * Pure `AttributeValue` → OTLP `AnyValue` encoder + the shared OTLP-JSON
 * value types used across the subpath.
 *
 * The OTLP/HTTP+JSON value model is hand-encoded here with ZERO runtime
 * dependencies and no `@opentelemetry/*` import (research D1, TO-7). The
 * `AttributeValue` union (string | number | boolean | null | array |
 * object) maps 1:1 onto OTLP `AnyValue` (OP-5).
 *
 * Specs: `specs/007-transport-otlp/contracts/otlp-payload.md` OP-5.
 */

import type { AttributeValue } from '../api/types.js';

/**
 * OTLP `AnyValue` (JSON encoding). `null` → `{}` (an unset value) since
 * OTLP has no explicit null. A non-finite or otherwise non-integer number
 * is a `doubleValue`; an integer-safe number is an `intValue` (string, per
 * the uint64/sint64-as-string rule).
 */
export type AnyValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AnyValue[] } }
  | { kvlistValue: { values: KeyValue[] } }
  // biome-ignore lint/complexity/noBannedTypes: OTLP represents an unset/null value as an empty AnyValue object.
  | {};

/** OTLP `KeyValue`. */
export interface KeyValue {
  key: string;
  value: AnyValue;
}

/** Encode a single sanitized `AttributeValue` as an OTLP `AnyValue`. */
export function toAnyValue(value: AttributeValue): AnyValue {
  if (value === null) {
    return {};
  }
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { boolValue: value };
    case 'number':
      return Number.isInteger(value)
        ? { intValue: String(value) }
        : { doubleValue: value };
    default:
      break;
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toAnyValue) } };
  }
  // Remaining case: a plain `{ [key: string]: AttributeValue }` object.
  return { kvlistValue: { values: toKeyValues(value) } };
}

/**
 * Encode a record of sanitized attributes as an OTLP `KeyValue[]`,
 * optionally prefixing each key (used to namespace merged context
 * attributes under `context.` — OP-4).
 */
export function toKeyValues(
  record: Readonly<Record<string, AttributeValue>>,
  keyPrefix = '',
): KeyValue[] {
  const out: KeyValue[] = [];
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value === undefined) continue;
    out.push({ key: keyPrefix + key, value: toAnyValue(value) });
  }
  return out;
}
