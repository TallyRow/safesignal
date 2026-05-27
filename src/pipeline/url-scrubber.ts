/**
 * URL scrubber — strips sensitive query and fragment parameters from
 * URL-shaped string values before any transport sees the event.
 *
 * Contract: `contracts/redaction.md` (URL-derived secrets) + plan.md
 * "Security Architecture > URL scrubbing".
 *
 * Two surfaces:
 *   - `urlScrub` (pipeline stage): walks `event.message`,
 *     `event.attributes`, `event.context.attributes`, `event.error.*`
 *     and rewrites any string that parses as an http(s) URL,
 *     replacing sensitive query and (optionally) fragment param values
 *     with `'[REDACTED]'`. Runs upstream of the redactor.
 *   - `scrubUrl(url, options?)` (public helper, re-exported from
 *     `src/index.ts`): the same operation surfaced directly so consumers
 *     can pre-scrub URLs they want to log intentionally.
 *
 * Security invariants:
 *   - NEVER throws. Malformed URLs, throwing getters on plain objects
 *     (already collapsed by the sanitizer upstream), and pathological
 *     fragments all fall through to "return input unchanged".
 *   - Returns input unchanged for any string that is not a parseable
 *     http(s) URL. Path segments, host, and authority are NOT modified
 *     — only query and fragment parameter VALUES are replaced. Param
 *     names are preserved.
 *   - Operates on names (case-insensitive), never on value substrings —
 *     the package never inspects a URL value's content for sensitive
 *     shapes (that is the redactor's job, applied later in the pipeline).
 */

import type {
  AttributeValue,
  Attributes,
  ErrorInfo,
  LogContext,
  LogEvent,
  ScrubUrlOptions,
} from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

const REDACTED = '[REDACTED]';

/**
 * Default denylist of query/fragment parameter names whose values should
 * be replaced. Mirrors `contracts/redaction.md`'s key denylist so the
 * URL scrubber and the redactor stay consistent at the value-shape
 * boundary. Match is case-insensitive (every pattern carries the `i`
 * flag) and full-name only (no substring matches).
 */
const DEFAULT_PARAM_DENYLIST: ReadonlyArray<RegExp> = [
  /^password$/i,
  /^passwd$/i,
  /^token$/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /bearer[_-]?token/i,
  /id[_-]?token/i,
  /^authorization$/i,
  /^auth$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^secret$/i,
  /client[_-]?secret/i,
  /api[_-]?key/i,
  /session[_-]?id/i,
  /^sid$/i,
  /^ssn$/i,
  /credit[_-]?card/i,
  /^cardnumber$/i,
  /^cvv$/i,
];

// ---------------------------------------------------------------------------
// Public helper
// ---------------------------------------------------------------------------

export function scrubUrl(url: string, options?: ScrubUrlOptions): string {
  if (typeof url !== 'string' || url.length === 0) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return url;
  }

  const extras = options?.extraParams ?? [];
  const scrubFragment = options?.fragment !== false;

  let changed = false;
  changed = scrubSearchParams(parsed, extras) || changed;
  if (scrubFragment) {
    changed = scrubHashFragment(parsed, extras) || changed;
  }

  if (!changed) return url;

  try {
    return parsed.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Pipeline stage
// ---------------------------------------------------------------------------

export const urlScrub: PipelineStage = (event, _config) => {
  const message = maybeScrubString(event.message);
  const attributes = walkAttributes(event.attributes);
  const context = walkContext(event.context);

  let error: ErrorInfo | undefined = undefined;
  if (event.error !== undefined) {
    const scrubbedMessage = maybeScrubString(event.error.message);
    const stack = event.error.stack;
    const scrubbedStack = stack === undefined ? undefined : maybeScrubString(stack);
    error = { name: event.error.name, message: scrubbedMessage };
    if (scrubbedStack !== undefined) error.stack = scrubbedStack;
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

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function scrubSearchParams(
  parsed: URL,
  extras: ReadonlyArray<string | RegExp>,
): boolean {
  const params = parsed.searchParams;
  // Collect unique keys up-front; URLSearchParams may have repeated keys.
  const uniqueKeys: string[] = [];
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!seen.has(key)) {
      seen.add(key);
      uniqueKeys.push(key);
    }
  }
  let changed = false;
  for (const key of uniqueKeys) {
    if (!isDenied(key, extras)) continue;
    const occurrences = params.getAll(key).length;
    params.delete(key);
    for (let i = 0; i < occurrences; i++) params.append(key, REDACTED);
    changed = true;
  }
  return changed;
}

function scrubHashFragment(
  parsed: URL,
  extras: ReadonlyArray<string | RegExp>,
): boolean {
  const hash = parsed.hash;
  if (hash.length < 2 || !hash.startsWith('#')) return false;
  const body = hash.slice(1);
  // Fragment must contain a `key=value` pair to be scrubbable.
  if (!body.includes('=')) return false;

  const parts = body.split('&');
  let changed = false;
  const out: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 0) {
      out.push(part);
      continue;
    }
    const rawKey = part.slice(0, eq);
    const decodedKey = tryDecode(rawKey);
    if (isDenied(decodedKey, extras)) {
      out.push(`${rawKey}=${encodeURIComponent(REDACTED)}`);
      changed = true;
    } else {
      out.push(part);
    }
  }
  if (!changed) return false;

  parsed.hash = '#' + out.join('&');
  return true;
}

function isDenied(name: string, extras: ReadonlyArray<string | RegExp>): boolean {
  for (const pattern of DEFAULT_PARAM_DENYLIST) {
    if (pattern.test(name)) return true;
  }
  for (const pattern of extras) {
    if (typeof pattern === 'string') {
      if (pattern.toLowerCase() === name.toLowerCase()) return true;
    } else if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Fast-path: only attempt URL parsing for strings that begin with
 * `http://` or `https://`. Keeps the per-emission cost predictable when
 * attributes carry many non-URL strings.
 */
function maybeScrubString(value: string): string {
  if (value.length < 8) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return scrubUrl(value);
  }
  return value;
}

function walkAttributes(
  attrs: Attributes,
): Attributes {
  let changed = false;
  let result: { [key: string]: AttributeValue } | null = null;
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (value === undefined) continue;
    const scrubbed = walkValue(value);
    if (scrubbed !== value) {
      if (result === null) {
        result = {};
        for (const k of Object.keys(attrs)) {
          const existing = attrs[k];
          if (existing !== undefined) result[k] = existing;
        }
      }
      result[key] = scrubbed;
      changed = true;
    }
  }
  return changed && result !== null ? result : attrs;
}

function walkValue(value: AttributeValue): AttributeValue {
  if (typeof value === 'string') return maybeScrubString(value);
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
    const scrubbed = walkValue(item);
    if (scrubbed !== item) {
      if (result === null) result = arr.slice();
      result[i] = scrubbed;
      changed = true;
    }
  }
  return changed && result !== null ? result : arr;
}

function walkContext(context: LogContext): LogContext {
  if (context.attributes === undefined) return context;
  const scrubbed = walkAttributes(context.attributes);
  if (scrubbed === context.attributes) return context;
  return { ...context, attributes: scrubbed };
}
