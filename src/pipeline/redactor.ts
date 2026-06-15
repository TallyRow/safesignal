/**
 * Redactor — masks values whose **key** matches the default denylist
 * (case-insensitive, immediate property name only, never a value
 * substring) and values whose **shape** matches a documented sensitive
 * pattern (JWT, Bearer-prefixed token). Runs in the pipeline AFTER the
 * sanitizer and URL scrubber have normalized the event and BEFORE the
 * control-char guard, freeze, and any transport.
 *
 * Contract: `contracts/redaction.md` (R-1..R-10).
 *
 * Two surfaces:
 *   - `redact` (pipeline stage): wraps `config.redactor` (or the
 *     default `createRedactor()` when not supplied), invokes it
 *     synchronously, and enforces the fail-closed contract:
 *       * If the redactor throws, the dispatcher's outer try/catch
 *         drops the event and routes the throw to `onInternalError`.
 *       * If the redactor returns `null`, the event is dropped (the
 *         pipeline contract for explicit drop).
 *       * If the redactor returns a value that is neither a LogEvent
 *         nor `null`, this stage throws a `PackageError('redactor_failed')`
 *         so the same fail-closed path applies.
 *   - `createRedactor(rules?)` (public, re-exported from
 *     `src/index.ts`): returns a `Redactor` configured with the
 *     default rules when called with no argument, or with the
 *     consumer's rule set (FULL replacement of defaults) when an
 *     array is supplied. An empty array is a valid no-op rule set.
 *
 * Match semantics (per contract):
 *   - **Key match**: a rule's `key` is tested against the immediate
 *     property name being inspected. String keys match via case-
 *     insensitive equality; RegExp keys match via `.test()`. A match
 *     replaces the entire value (including object/array subtrees)
 *     with `rule.replacement ?? '[REDACTED]'`. Recursion does not
 *     descend into a value whose key matched — the whole subtree is
 *     considered sensitive.
 *   - **Shape match**: a rule's `shape` (RegExp) is tested against
 *     leaf string values regardless of key context. A match replaces
 *     the value with `rule.replacement ?? '[REDACTED]'`. Shape rules
 *     do not match objects or arrays as containers — only leaf
 *     strings.
 *   - **Combination**: a rule with both `key` and `shape` matches
 *     when either matches.
 *
 * Scope per field:
 *   - `event.attributes` — recursive walk; key + shape rules apply.
 *   - `event.context.attributes` — same recursive walk.
 *   - `event.message` — string scan; shape rules only (no key context).
 *   - `event.error.name`, `event.error.message`, `event.error.stack` —
 *     string scan; shape rules only.
 */

import type {
  Attributes,
  AttributeValue,
  ErrorInfo,
  LogContext,
  LogEvent,
  LogLevel,
  RedactionRule,
  Redactor,
} from '../api/types.js';
import { hasDeepErrorData, mapErrorNodes } from '../errors/serialize-error.js';
import { PackageError } from '../internal/errors/internal-errors.js';
import type { PipelineStage } from './dispatcher.js';

const DEFAULT_REPLACEMENT = '[REDACTED]';

// Default rule set — must mirror contracts/redaction.md.
const DEFAULT_RULES: ReadonlyArray<RedactionRule> = [
  // Key rules (immediate-name match, case-insensitive).
  { key: /^password$|^passwd$/i },
  { key: /^token$|access[_-]?token|refresh[_-]?token|bearer[_-]?token/i },
  { key: /^authorization$|^auth$/i },
  { key: /^cookie$|^set-cookie$/i },
  { key: /^secret$/i },
  { key: /api[_-]?key/i },
  { key: /session[_-]?id|^sid$/i },
  { key: /^ssn$/i },
  { key: /credit[_-]?card|^cardNumber$|^cvv$/i },
  // Shape rules (leaf-string match).
  { shape: /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/ },
  { shape: /^Bearer\s+[A-Za-z0-9._-]+$/i },
];

interface KeyRule {
  readonly match: (key: string) => boolean;
  readonly replacement: string;
}

interface ShapeRule {
  readonly pattern: RegExp;
  readonly replacement: string;
}

interface CompiledRules {
  readonly keyRules: ReadonlyArray<KeyRule>;
  readonly shapeRules: ReadonlyArray<ShapeRule>;
}

function compileRules(rules: ReadonlyArray<RedactionRule>): CompiledRules {
  const keyRules: KeyRule[] = [];
  const shapeRules: ShapeRule[] = [];
  for (const rule of rules) {
    const replacement = rule.replacement ?? DEFAULT_REPLACEMENT;
    if (rule.key !== undefined) {
      keyRules.push(makeKeyRule(rule.key, replacement));
    }
    if (rule.shape !== undefined) {
      shapeRules.push({ pattern: rule.shape, replacement });
    }
  }
  return { keyRules, shapeRules };
}

function makeKeyRule(key: string | RegExp, replacement: string): KeyRule {
  if (typeof key === 'string') {
    const expected = key.toLowerCase();
    return {
      match: (candidate) => candidate.toLowerCase() === expected,
      replacement,
    };
  }
  return { match: (candidate) => key.test(candidate), replacement };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createRedactor(rules?: RedactionRule[]): Redactor {
  const active = rules ?? DEFAULT_RULES;
  const compiled = compileRules(active);

  return function defaultStyleRedactor(event: LogEvent): LogEvent | null {
    const attributes = walkObject(event.attributes, compiled);
    const context = walkContext(event.context, compiled);
    const message = applyShapeRules(event.message, compiled.shapeRules);

    let error: ErrorInfo | undefined = event.error;
    if (event.error !== undefined) {
      const escName = applyShapeRules(event.error.name, compiled.shapeRules);
      const escMessage = applyShapeRules(
        event.error.message,
        compiled.shapeRules,
      );
      const stack = event.error.stack;
      const escStack =
        stack === undefined
          ? undefined
          : applyShapeRules(stack, compiled.shapeRules);
      if (hasDeepErrorData(event.error)) {
        // Deep error data (Feature 023): shape rules on every nested node's
        // name/message; key + shape rules on `fields` entries (exact parity
        // with attribute redaction via `walkObject`).
        error = mapErrorNodes(event.error, {
          name: (v) => applyShapeRules(v, compiled.shapeRules),
          message: (v) => applyShapeRules(v, compiled.shapeRules),
          fields: (f) => walkObject(f as Attributes, compiled) as typeof f,
        });
        error.name = escName;
        error.message = escMessage;
        if (escStack !== undefined) {
          error.stack = escStack;
        } else {
          delete error.stack;
        }
      } else {
        const errorChanged =
          escName !== event.error.name ||
          escMessage !== event.error.message ||
          escStack !== stack;
        if (errorChanged) {
          error = { name: escName, message: escMessage };
          if (escStack !== undefined) error.stack = escStack;
        }
      }
    }

    const noChange =
      attributes === event.attributes &&
      context === event.context &&
      message === event.message &&
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
}

// ---------------------------------------------------------------------------
// Pipeline stage
// ---------------------------------------------------------------------------

let cachedDefaultRedactor: Redactor | null = null;
function getDefaultRedactor(): Redactor {
  if (cachedDefaultRedactor === null) {
    cachedDefaultRedactor = createRedactor();
  }
  return cachedDefaultRedactor;
}

export const redact: PipelineStage = (event, config) => {
  const redactor = config.redactor ?? getDefaultRedactor();
  // Any throw from the redactor escapes here; the dispatcher's outer
  // try/catch will route it through onInternalError as fail-closed.
  const result = redactor(event);
  if (result === null) return null;
  if (!isLogEventShape(result)) {
    throw new PackageError(
      'redactor_failed',
      'Redactor returned a value that is neither a LogEvent nor null; the event is dropped (fail-closed).',
    );
  }
  return result;
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function walkObject(attrs: Attributes, rules: CompiledRules): Attributes {
  let changed = false;
  let result: { [key: string]: AttributeValue } | null = null;
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value === undefined) continue;

    const newValue = redactValueAtKey(value, key, rules);
    if (newValue !== value) {
      if (result === null) {
        result = {};
        for (const k of Object.keys(attrs)) {
          const existing = attrs[k];
          if (existing !== undefined) result[k] = existing;
        }
      }
      result[key] = newValue;
      changed = true;
    }
  }
  return changed && result !== null ? result : attrs;
}

function walkContext(context: LogContext, rules: CompiledRules): LogContext {
  if (context.attributes === undefined) return context;
  const next = walkObject(context.attributes, rules);
  if (next === context.attributes) return context;
  return { ...context, attributes: next };
}

function redactValueAtKey(
  value: AttributeValue,
  key: string,
  rules: CompiledRules,
): AttributeValue {
  // Key rules win: a key match replaces the WHOLE subtree under that key
  // (including nested objects/arrays) so we never recurse into a value
  // whose key marks it sensitive.
  for (const rule of rules.keyRules) {
    if (rule.match(key)) return rule.replacement;
  }

  if (typeof value === 'string') {
    return applyShapeRules(value, rules.shapeRules);
  }
  if (Array.isArray(value)) {
    return walkArray(value, rules);
  }
  if (value !== null && typeof value === 'object') {
    return walkObject(value, rules);
  }
  return value;
}

function walkArray(
  arr: AttributeValue[],
  rules: CompiledRules,
): AttributeValue[] {
  let changed = false;
  let result: AttributeValue[] | null = null;
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (item === undefined) continue;
    let newItem: AttributeValue;
    if (typeof item === 'string') {
      newItem = applyShapeRules(item, rules.shapeRules);
    } else if (Array.isArray(item)) {
      newItem = walkArray(item, rules);
    } else if (item !== null && typeof item === 'object') {
      newItem = walkObject(item, rules);
    } else {
      newItem = item;
    }
    if (newItem !== item) {
      if (result === null) result = arr.slice();
      result[i] = newItem;
      changed = true;
    }
  }
  return changed && result !== null ? result : arr;
}

function applyShapeRules(
  value: string,
  rules: ReadonlyArray<ShapeRule>,
): string {
  for (const rule of rules) {
    if (rule.pattern.test(value)) return rule.replacement;
  }
  return value;
}

const VALID_LEVELS: ReadonlySet<LogLevel> = new Set<LogLevel>([
  'debug',
  'info',
  'warn',
  'error',
]);

function isLogEventShape(value: unknown): value is LogEvent {
  // `null` is intercepted by the upstream `result === null` check in
  // `redact()` (a redactor returning `null` is a valid drop, not a
  // shape failure), so the `value === null` half of the guard below
  // is unreachable via the configured pipeline. Kept as defense in
  // depth for any future call site that bypasses the upstream check.
  if (
    typeof value !== 'object' ||
    /* v8 ignore next */
    value === null
  ) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.timestamp !== 'string') return false;
  if (typeof obj.level !== 'string') return false;
  if (!VALID_LEVELS.has(obj.level as LogLevel)) return false;
  if (typeof obj.message !== 'string') return false;
  if (obj.attributes === null || typeof obj.attributes !== 'object')
    return false;
  if (obj.context === null || typeof obj.context !== 'object') return false;
  return true;
}
