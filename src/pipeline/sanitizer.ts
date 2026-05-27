/**
 * Sanitizer — normalizes arbitrary consumer input into a bounded,
 * predictable `AttributeValue` tree before any downstream stage
 * (URL scrubber, redactor, control-char guard, freeze) sees it.
 *
 * Contract: `contracts/sanitization.md` (rows S-1..S-10).
 *
 * Invariants:
 *   - NEVER throws. Every branch has a defined fallback; any residual
 *     unexpected throw inside `sanitizeValue` collapses to
 *     `"[Unserializable]"` (defensive belt).
 *   - Class instances and DOM/framework objects are **type-tagged, not
 *     recursed** — this is the security property that prevents
 *     side-effectful getters from being invoked and prevents huge
 *     object graphs (React fibers, full DOM trees) from being pulled
 *     into events.
 *   - Bounds (`maxDepth`, `maxStringLength`, `maxArrayLength`,
 *     `maxAttributeCount`) come from `config.sanitizerLimits`, which
 *     `normalizeConfig()` already clamped to documented Min..Max.
 *   - `maxAttributeCount` is **cumulative across the whole event**;
 *     when exceeded, a single `"[Truncated: <N> keys omitted]"` marker
 *     is attached at the top-level attributes.
 */

import type { AttributeValue, ErrorInfo, LogContext, LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

const TRUNCATION_MARKER_KEY = '__truncated__';
const STRING_TRUNCATION_SUFFIX = '...[truncated]';
const UNSERIALIZABLE_MARKER = '[Unserializable]';

interface SanitizeContext {
  readonly maxDepth: number;
  readonly maxStringLength: number;
  readonly maxArrayLength: number;
  readonly maxAttributeCount: number;
  keysUsed: number;
  keysOmitted: number;
  readonly seen: WeakSet<object>;
}

export const sanitize: PipelineStage = (event, config) => {
  const ctx = newContext(config);

  const sanitizedAttributes = sanitizeRootObject(event.attributes, ctx);
  const sanitizedContext = sanitizeContext(event.context, ctx);

  const next: LogEvent = {
    timestamp: event.timestamp,
    level: event.level,
    message: truncateString(event.message, ctx.maxStringLength),
    attributes: sanitizedAttributes,
    context: sanitizedContext,
  };

  if (event.error !== undefined) {
    next.error = sanitizeErrorInfo(event.error, ctx);
  }

  if (ctx.keysOmitted > 0) {
    next.attributes = withTruncationMarker(next.attributes, ctx.keysOmitted);
  }

  return next;
};

function newContext(config: NormalizedConfig): SanitizeContext {
  const limits = config.sanitizerLimits;
  return {
    maxDepth: limits.maxDepth,
    maxStringLength: limits.maxStringLength,
    maxArrayLength: limits.maxArrayLength,
    maxAttributeCount: limits.maxAttributeCount,
    keysUsed: 0,
    keysOmitted: 0,
    seen: new WeakSet<object>(),
  };
}

function sanitizeRootObject(
  source: unknown,
  ctx: SanitizeContext,
): { [key: string]: AttributeValue } {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    return {};
  }
  return sanitizeObject(source as Record<string, unknown>, 0, ctx);
}

function sanitizeContext(source: LogContext, ctx: SanitizeContext): LogContext {
  if (source.attributes === undefined) return source;
  const sanitizedAttrs = sanitizeRootObject(source.attributes, ctx);
  return { ...source, attributes: sanitizedAttrs };
}

function sanitizeErrorInfo(error: ErrorInfo, ctx: SanitizeContext): ErrorInfo {
  const info: ErrorInfo = {
    name: truncateString(error.name, ctx.maxStringLength),
    message: truncateString(error.message, ctx.maxStringLength),
  };
  if (error.stack !== undefined) {
    info.stack = truncateString(error.stack, ctx.maxStringLength);
  }
  return info;
}

function withTruncationMarker(
  attrs: { [key: string]: AttributeValue },
  omitted: number,
): { [key: string]: AttributeValue } {
  const tagged: { [key: string]: AttributeValue } = { ...attrs };
  tagged[TRUNCATION_MARKER_KEY] = `[Truncated: ${String(omitted)} keys omitted]`;
  return tagged;
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength) + STRING_TRUNCATION_SUFFIX;
}

/**
 * Outer dispatch for an unknown value. Wrapped in try/catch so that
 * any pathological input (throwing getters on a plain object, Proxy
 * traps, `Invalid Date` toISOString, etc.) collapses to a marker
 * rather than escaping the sanitizer. This is the defensive belt that
 * guarantees S-2 ("the sanitizer never throws on any input").
 */
function sanitizeValue(
  value: unknown,
  depth: number,
  ctx: SanitizeContext,
): AttributeValue {
  try {
    return sanitizeValueImpl(value, depth, ctx);
  } catch {
    return UNSERIALIZABLE_MARKER;
  }
}

function sanitizeValueImpl(
  value: unknown,
  depth: number,
  ctx: SanitizeContext,
): AttributeValue {
  if (depth > ctx.maxDepth) return '[MaxDepth]';

  // null and primitives ------------------------------------------------------
  if (value === null) return null;
  const t = typeof value;
  if (t === 'string') return truncateString(value as string, ctx.maxStringLength);
  if (t === 'number') {
    const n = value as number;
    return Number.isFinite(n) ? n : null;
  }
  if (t === 'boolean') return value as boolean;
  if (t === 'bigint') return String(value);
  if (t === 'function') return '[Function]';
  if (t === 'symbol') return '[Symbol]';
  if (t === 'undefined') return null;

  // value is a non-null object below
  const obj = value as object;

  // Cycle guard -------------------------------------------------------------
  if (ctx.seen.has(obj)) return '[Circular]';

  // Arrays ------------------------------------------------------------------
  if (Array.isArray(value)) {
    return sanitizeArray(value, depth, ctx);
  }

  // Date --------------------------------------------------------------------
  if (value instanceof Date) {
    return dateToIso(value);
  }

  // Error -------------------------------------------------------------------
  if (value instanceof Error) {
    return sanitizeErrorAsAttribute(value, depth, ctx);
  }

  // DOM type tags (most specific first; guarded for SSR) --------------------
  if (typeof Element !== 'undefined' && value instanceof Element) {
    return `[Element:${tagNameOf(value)}]`;
  }
  if (typeof Document !== 'undefined' && value instanceof Document) {
    return '[Document]';
  }
  if (typeof Window !== 'undefined' && value instanceof Window) {
    return '[Window]';
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return '[Node]';
  }

  // Framework type tags -----------------------------------------------------
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return `[Event:${eventTypeOf(value)}]`;
  }
  if (typeof Promise !== 'undefined' && value instanceof Promise) {
    return '[Promise]';
  }
  if (typeof Map !== 'undefined' && value instanceof Map) {
    return '[Map]';
  }
  if (typeof Set !== 'undefined' && value instanceof Set) {
    return '[Set]';
  }
  if (typeof WeakMap !== 'undefined' && value instanceof WeakMap) {
    return '[WeakMap]';
  }
  if (typeof WeakSet !== 'undefined' && value instanceof WeakSet) {
    return '[WeakSet]';
  }
  if (typeof Request !== 'undefined' && value instanceof Request) {
    return '[Request]';
  }
  if (typeof Response !== 'undefined' && value instanceof Response) {
    return '[Response]';
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return '[Blob]';
  }
  if (typeof FormData !== 'undefined' && value instanceof FormData) {
    return '[FormData]';
  }
  if (typeof URL !== 'undefined' && value instanceof URL) {
    return '[URL]';
  }

  // Plain object vs class instance ------------------------------------------
  if (isPlainObject(obj)) {
    return sanitizeObject(obj as Record<string, unknown>, depth, ctx);
  }
  return `[${getConstructorName(obj)}]`;
}

function sanitizeArray(
  arr: ReadonlyArray<unknown>,
  depth: number,
  ctx: SanitizeContext,
): AttributeValue[] {
  ctx.seen.add(arr as unknown as object);
  const out: AttributeValue[] = [];
  const len = arr.length;
  const limit = len > ctx.maxArrayLength ? ctx.maxArrayLength : len;
  for (let i = 0; i < limit; i++) {
    // Per contract: `undefined` inside arrays → `null`. We delegate
    // that coercion to `sanitizeValue`'s `typeof === 'undefined'`
    // branch so the per-item shape rules stay in one place.
    out.push(sanitizeValue(arr[i], depth + 1, ctx));
  }
  if (len > ctx.maxArrayLength) {
    const omitted = len - ctx.maxArrayLength;
    out.push(`[Truncated: ${String(omitted)} elements omitted]`);
  }
  ctx.seen.delete(arr as unknown as object);
  return out;
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number,
  ctx: SanitizeContext,
): { [key: string]: AttributeValue } {
  ctx.seen.add(obj);
  const result: { [key: string]: AttributeValue } = {};
  const keys = ownEnumerableKeys(obj);
  for (const key of keys) {
    const raw = readProperty(obj, key);
    if (raw === undefined) continue; // top-level undefined keys are dropped
    if (ctx.keysUsed >= ctx.maxAttributeCount) {
      ctx.keysOmitted++;
      continue;
    }
    ctx.keysUsed++;
    result[key] = sanitizeValue(raw, depth + 1, ctx);
  }
  ctx.seen.delete(obj);
  return result;
}

/**
 * Reduce an `Error` encountered inside attributes to its documented
 * `{name, message, stack?}` shape and recurse through the plain-object
 * path so strings get length-truncated and keys get counted toward
 * `maxAttributeCount`.
 */
function sanitizeErrorAsAttribute(
  err: Error,
  depth: number,
  ctx: SanitizeContext,
): { [key: string]: AttributeValue } {
  const reduced: Record<string, unknown> = {
    name: safeString(() => err.name, 'Error'),
    message: safeString(() => err.message, ''),
  };
  const stack = safeOptional(() => err.stack);
  if (stack !== undefined) {
    reduced['stack'] = stack;
  }
  return sanitizeObject(reduced, depth, ctx);
}

// ---------------------------------------------------------------------------
// Low-level helpers (each isolated so a single throwing access cannot
// derail the recursion).
// ---------------------------------------------------------------------------

function ownEnumerableKeys(obj: object): string[] {
  try {
    return Object.keys(obj);
  } catch {
    return [];
  }
}

function readProperty(obj: Record<string, unknown>, key: string): unknown {
  try {
    return obj[key];
  } catch {
    return UNSERIALIZABLE_MARKER;
  }
}

function isPlainObject(obj: object): boolean {
  // `Object.getPrototypeOf(obj)` can in principle throw via a Proxy's
  // `getPrototypeOf` trap, but any such input has already thrown — and
  // been collapsed to `'[Unserializable]'` — by an earlier `instanceof`
  // check in `sanitizeValueImpl` (those checks also call
  // `Object.getPrototypeOf` internally). The `sanitizeValue` outer
  // defensive belt is the single source of truth for that recovery, so
  // a redundant local try/catch here would only ever be dead code.
  const proto = Object.getPrototypeOf(obj) as object | null;
  return proto === null || proto === Object.prototype;
}

function getConstructorName(obj: object): string {
  try {
    const proto = Object.getPrototypeOf(obj) as { constructor?: { name?: unknown } } | null;
    const ctor = proto?.constructor;
    const name = ctor?.name;
    if (typeof name === 'string' && name.length > 0) return name;
  } catch {
    /* fall through */
  }
  return 'Object';
}

function tagNameOf(el: Element): string {
  try {
    const t = el.tagName;
    return typeof t === 'string' && t.length > 0 ? t.toLowerCase() : 'element';
  } catch {
    return 'element';
  }
}

function eventTypeOf(ev: Event): string {
  try {
    const t = ev.type;
    return typeof t === 'string' && t.length > 0 ? t : 'event';
  } catch {
    return 'event';
  }
}

function dateToIso(d: Date): AttributeValue {
  try {
    return d.toISOString();
  } catch {
    // Invalid Date throws RangeError.
    return null;
  }
}

function safeString(read: () => unknown, fallback: string): string {
  try {
    const v = read();
    return typeof v === 'string' ? v : fallback;
  } catch {
    return fallback;
  }
}

function safeOptional(read: () => unknown): string | undefined {
  try {
    const v = read();
    return typeof v === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}
