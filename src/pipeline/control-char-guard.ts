/**
 * Control-character guard. Walks every string value in the event and
 * escapes ASCII control characters (`\x00`–`\x1F` except `\t`, `\n`,
 * `\r`) plus the line separators U+2028 and U+2029.
 *
 * Contract: `contracts/log-event.md` ("Pipeline-applied transformations"
 * row 4) + plan.md "Security Architecture > Log-injection & output
 * safety".
 *
 * Scope:
 *   - `event.message`
 *   - every string in `event.attributes` (recursive into nested
 *     plain objects and arrays produced by the sanitizer)
 *   - every string in `event.context.attributes` (same recursion)
 *   - `event.error.name`, `event.error.message`, and (if present)
 *     `event.error.stack`
 *
 * Escape format: each targeted character is replaced with its
 * six-character escape literal — `\uXXXX` (lowercase 4-digit hex,
 * zero-padded). This is the conventional representation, unambiguous
 * when serialized into JSON and rendered by any downstream log viewer.
 *
 * `\t` (U+0009), `\n` (U+000A), and `\r` (U+000D) are deliberately
 * preserved — log-injection resistance is provided by
 * `ConsoleTransport`'s object-mode output (event passed as the second
 * argument to `console[level]`, never interpolated into a single line),
 * not by mutating those characters. See plan.md "Log-injection &
 * output safety" for the full rationale.
 *
 * NEVER throws: every branch returns a value; the regex match cannot
 * throw on any input.
 */

import type {
  AttributeValue,
  Attributes,
  ErrorInfo,
  LogContext,
  LogEvent,
} from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

// Targeted code points:
//   U+0000..U+0008  (NUL through BS)
//   U+000B..U+000C  (VT, FF)
//   U+000E..U+001F  (SO through US)
//   U+2028          (LINE SEPARATOR)
//   U+2029          (PARAGRAPH SEPARATOR)
// Excluded by design: U+0009 (\t), U+000A (\n), U+000D (\r).
//
// Built from explicit `\u` escapes in a string and compiled at module
// load time so the source file carries no literal control bytes (which
// would otherwise be hostile to editors, diff viewers, and security
// scanners).
const CONTROL_CHAR_CLASS =
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u2028\\u2029]';
const HAS_CONTROL_CHAR = new RegExp(CONTROL_CHAR_CLASS);
const CONTROL_CHAR_GLOBAL = new RegExp(CONTROL_CHAR_CLASS, 'g');

function escapeControlChars(value: string): string {
  if (!HAS_CONTROL_CHAR.test(value)) return value;
  return value.replace(CONTROL_CHAR_GLOBAL, (ch) => {
    const code = ch.charCodeAt(0);
    return '\\u' + code.toString(16).padStart(4, '0');
  });
}

export const controlCharGuard: PipelineStage = (event, _config) => {
  const message = escapeControlChars(event.message);
  const attributes = walkAttributes(event.attributes);
  const context = walkContext(event.context);

  let error: ErrorInfo | undefined;
  if (event.error !== undefined) {
    const escName = escapeControlChars(event.error.name);
    const escMessage = escapeControlChars(event.error.message);
    const stack = event.error.stack;
    const escStack = stack === undefined ? undefined : escapeControlChars(stack);
    if (
      escName === event.error.name &&
      escMessage === event.error.message &&
      escStack === stack
    ) {
      error = event.error;
    } else {
      error = { name: escName, message: escMessage };
      if (escStack !== undefined) error.stack = escStack;
    }
  }

  const noChange =
    message === event.message &&
    attributes === event.attributes &&
    context === event.context &&
    error === event.error;
  if (noChange) return event;

  const next: LogEvent = {
    timestamp: event.timestamp,
    level: event.level,
    message,
    attributes,
    context,
  };
  if (error !== undefined) next.error = error;
  return next;
};

function walkAttributes(attrs: Attributes): Attributes {
  let changed = false;
  let result: { [key: string]: AttributeValue } | null = null;
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value === undefined) continue;
    const escaped = walkValue(value);
    if (escaped !== value) {
      if (result === null) {
        result = {};
        for (const k of Object.keys(attrs)) {
          const existing = attrs[k];
          if (existing !== undefined) result[k] = existing;
        }
      }
      result[key] = escaped;
      changed = true;
    }
  }
  return changed && result !== null ? result : attrs;
}

function walkValue(value: AttributeValue): AttributeValue {
  if (typeof value === 'string') return escapeControlChars(value);
  if (Array.isArray(value)) return walkArray(value);
  if (value !== null && typeof value === 'object') return walkAttributes(value);
  return value;
}

function walkArray(arr: AttributeValue[]): AttributeValue[] {
  let changed = false;
  let result: AttributeValue[] | null = null;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === undefined) continue;
    const escaped = walkValue(item);
    if (escaped !== item) {
      if (result === null) result = arr.slice();
      result[i] = escaped;
      changed = true;
    }
  }
  return changed && result !== null ? result : arr;
}

function walkContext(context: LogContext): LogContext {
  if (context.attributes === undefined) return context;
  const escaped = walkAttributes(context.attributes);
  if (escaped === context.attributes) return context;
  return { ...context, attributes: escaped };
}
