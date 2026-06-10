/**
 * Deep error serialization (Feature 023) — turns a raw caught value into the
 * extended `ErrorInfo` payload: flat `causes` chain, recursive `members`,
 * value-filtered `fields`, explicit truncation markers. See
 * `specs/023-error-serialization-depth/` (data-model.md, contracts/).
 *
 * Invariants:
 *   - Pure construction-time transformation; reads the raw error ONLY here
 *     (event-builder stage). Output is plain structured data — no live
 *     references, no functions, no prototype data (sole exception:
 *     `DOMException.code`, read explicitly).
 *   - Every property read on consumer objects is guarded; this module never
 *     lets a hostile getter throw past it for nested data, and the single
 *     caller (event-builder) additionally wraps `serializeError` fail-safe.
 *   - One binding node budget (`maxNodes`) caps total output regardless of
 *     input shape; inner limits are subordinate to it.
 *   - Nested nodes never carry stack text (ES-7).
 */

import type { ErrorInfo, SerializedErrorNode } from '../api/types.js';
import type { ResolvedSerializeErrorsLimits } from '../config/config.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';

// ---------------------------------------------------------------------------
// Guarded reads & detection
// ---------------------------------------------------------------------------

/** Read a property defensively — hostile getters must not throw past us. */
function safeGet(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/**
 * Structural error-likeness (R3): `instanceof Error`, or any non-null object
 * with string `name` and `message` (covers cross-realm errors and
 * error-shaped exotics that fail `instanceof`).
 */
export function isErrorLike(
  value: unknown,
): value is object & { name: string; message: string } {
  if (value === null || typeof value !== 'object') return false;
  try {
    // `instanceof` invokes [[GetPrototypeOf]], which a hostile Proxy trap
    // can throw from — hence the guard around the whole check.
    if (value instanceof Error) return true;
  } catch {
    /* fall through to the structural check (also guarded) */
  }
  return (
    typeof safeGet(value, 'name') === 'string' &&
    typeof safeGet(value, 'message') === 'string'
  );
}

/** Coerce any value to a node-ready `{ name, message }` pair. */
function reduceToNameMessage(value: unknown): {
  name: string;
  message: string;
} {
  if (isErrorLike(value)) {
    return {
      name: String(safeGet(value, 'name') ?? 'Error'),
      message: String(safeGet(value, 'message') ?? ''),
    };
  }
  let message: string;
  try {
    message = String(value);
  } catch {
    message = '[unstringifiable]';
  }
  return { name: 'NonError', message };
}

// ---------------------------------------------------------------------------
// Node budget (data-model.md §Budget semantics)
// ---------------------------------------------------------------------------

interface BudgetState {
  /** Nodes still available. The top-level payload does not count. */
  remaining: number;
  /** Set once the budget clipped anything, anywhere. */
  exhausted: boolean;
  /**
   * First contained per-property failure (hostile getter during field
   * capture). Reported once per event via `onInternalError` (US3.4).
   */
  guardedFailure?: unknown;
}

/** Try to consume one node from the budget. */
function takeNode(budget: BudgetState): boolean {
  if (budget.remaining <= 0) {
    budget.exhausted = true;
    return false;
  }
  budget.remaining -= 1;
  return true;
}

// ---------------------------------------------------------------------------
// Walker (R9) — shared by the sanitizer / url-scrubber / redactor stages
// ---------------------------------------------------------------------------

/**
 * Per-node string/field transforms applied by `mapErrorNodes`. Each callback
 * is optional; absent callbacks leave the value untouched.
 */
export interface ErrorNodeTransform {
  name?: (value: string) => string;
  message?: (value: string) => string;
  fields?: (fields: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * `true` when the payload carries deep (Feature 023) data — lets pipeline
 * stages keep their existing flat-field fast path byte-identical when the
 * feature is off (ES-10).
 */
export function hasDeepErrorData(error: ErrorInfo): boolean {
  return (
    error.causes !== undefined ||
    error.members !== undefined ||
    error.fields !== undefined
  );
}

/**
 * Pure, throw-free deep-copy walker: applies `transform` to the given
 * payload/node and every nested node (causes + members, recursively),
 * returning a new structure. Operates only on already-extracted plain data —
 * never on a raw `Error` — so it cannot invoke consumer getters. The
 * top-level `name`/`message`/`stack` are NOT transformed (the existing flat
 * handling in each pipeline stage owns those); nested nodes are fully
 * transformed.
 */
export function mapErrorNodes(
  error: ErrorInfo,
  transform: ErrorNodeTransform,
): ErrorInfo {
  const next: ErrorInfo = { ...error };
  if (next.causes !== undefined) {
    next.causes = next.causes.map((node) => mapOneNode(node, transform));
  }
  if (next.members !== undefined) {
    next.members = next.members.map((node) => mapOneNode(node, transform));
  }
  if (next.fields !== undefined && transform.fields !== undefined) {
    next.fields = transform.fields(next.fields);
  }
  return next;
}

function mapOneNode(
  node: SerializedErrorNode,
  transform: ErrorNodeTransform,
): SerializedErrorNode {
  const next: SerializedErrorNode = { ...node };
  if (transform.name !== undefined) next.name = transform.name(next.name);
  if (transform.message !== undefined) {
    next.message = transform.message(next.message);
  }
  if (next.fields !== undefined && transform.fields !== undefined) {
    next.fields = transform.fields(next.fields);
  }
  if (next.causes !== undefined) {
    next.causes = next.causes.map((child) => mapOneNode(child, transform));
  }
  if (next.members !== undefined) {
    next.members = next.members.map((child) => mapOneNode(child, transform));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Serialize a raw caught value into the extended `ErrorInfo` payload under
 * the given resolved limits. The caller (event-builder) wraps this call
 * fail-safe; internally all consumer-object reads are individually guarded
 * so partial extraction survives hostile inputs.
 */
export function serializeError(
  value: unknown,
  limits: ResolvedSerializeErrorsLimits,
  onInternalError?: (err: Error) => void,
): ErrorInfo {
  const top = reduceToNameMessage(value);
  const info: ErrorInfo = { name: top.name, message: top.message };
  if (isErrorLike(value)) {
    const stack = safeGet(value, 'stack');
    if (typeof stack === 'string') info.stack = stack;
  }

  const budget: BudgetState = { remaining: limits.maxNodes, exhausted: false };

  if (isErrorLike(value)) {
    applyDeepCapture(info, value, limits, budget);
  }

  if (budget.exhausted) info.budgetExhausted = true;
  if (budget.guardedFailure !== undefined && onInternalError !== undefined) {
    safeNotify(
      onInternalError,
      wrapAsPackageError(
        'error_serialize_failed',
        'a property accessor threw during deep error serialization; the event is delivered with the remaining error data.',
        budget.guardedFailure,
      ),
    );
  }
  return info;
}

/**
 * Capture causes / members / fields of `source` onto `target` (the payload
 * or a member node), depth-first: chain before members before fields.
 */
function applyDeepCapture(
  target: ErrorInfo | SerializedErrorNode,
  source: object,
  limits: ResolvedSerializeErrorsLimits,
  budget: BudgetState,
): void {
  captureCauses(target, source, limits, budget);
  captureMembers(target, source, limits, budget);
  captureFields(target, source, limits, budget);
}

/** Read `.cause` defensively; `undefined` means "no (further) cause". */
function getCauseOf(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return safeGet(value, 'cause');
}

/**
 * US1 / ES-1..ES-3: flatten `source`'s linear cause chain into
 * `target.causes`, outermost cause first. Cycle-safe (a revisited object
 * ends the chain WITHOUT a truncation marker — a cycle is an end, not a
 * clip); clipped by `maxCauseDepth` and the node budget WITH the marker.
 * Chain entries never carry their own `causes`.
 */
function captureCauses(
  target: ErrorInfo | SerializedErrorNode,
  source: object,
  limits: ResolvedSerializeErrorsLimits,
  budget: BudgetState,
): void {
  const entries: SerializedErrorNode[] = [];
  const seen = new Set<unknown>([source]);
  let truncated = false;
  let cursor = getCauseOf(source);

  while (cursor !== undefined) {
    if (typeof cursor === 'object' && cursor !== null) {
      if (seen.has(cursor)) break; // cycle — terminate, no marker
      seen.add(cursor);
    }
    if (entries.length >= limits.maxCauseDepth || !takeNode(budget)) {
      truncated = true;
      break;
    }
    const entry: SerializedErrorNode = reduceToNameMessage(cursor);
    // An AggregateError nested in a chain keeps its members (and any extra
    // fields) on the chain entry — entries still never carry `causes`, the
    // chain stays flat.
    if (typeof cursor === 'object' && cursor !== null) {
      captureMembers(entry, cursor, limits, budget);
      captureFields(entry, cursor, limits, budget);
    }
    entries.push(entry);
    cursor = getCauseOf(cursor);
  }

  if (entries.length > 0) target.causes = entries;
  if (truncated) target.causesTruncated = true;
}

/** Read an aggregate's `errors` array defensively (structural detection). */
function getMembersOf(value: object): ReadonlyArray<unknown> | undefined {
  const errors = safeGet(value, 'errors');
  return Array.isArray(errors) ? errors : undefined;
}

/**
 * US2 / ES-4..ES-5: capture `source`'s aggregate members onto
 * `target.members` (original order). Members recurse — each gets its own
 * flat chain and members — depth-first under the shared node budget.
 * Clipping by `maxMembers` or the budget records the original count in
 * `membersTotal`. Self-referential aggregates terminate via the budget.
 */
function captureMembers(
  target: ErrorInfo | SerializedErrorNode,
  source: object,
  limits: ResolvedSerializeErrorsLimits,
  budget: BudgetState,
): void {
  const raw = getMembersOf(source);
  if (raw === undefined || raw.length === 0) return;

  const members: SerializedErrorNode[] = [];
  for (const item of raw) {
    if (members.length >= limits.maxMembers || !takeNode(budget)) break;
    const node: SerializedErrorNode = reduceToNameMessage(item);
    if (typeof item === 'object' && item !== null) {
      applyDeepCapture(node, item, limits, budget);
    }
    members.push(node);
  }

  if (members.length > 0) target.members = members;
  if (members.length < raw.length) target.membersTotal = raw.length;
}

// ---------------------------------------------------------------------------
// Extra fields (US3 / ES-6)
// ---------------------------------------------------------------------------

/** Standard error keys never duplicated into `fields`. */
const EXCLUDED_FIELD_KEYS = new Set([
  'name',
  'message',
  'stack',
  'cause',
  'errors',
]);

/**
 * Value filter (FR-005, clarified 2026-06-10): JSON-safe primitives plus
 * plain objects/arrays. Functions, symbols, undefined, and class instances
 * are never captured. Captured object references are deep-copied and
 * depth/type-bounded by the sanitizer stage before any transport sees them.
 */
function isCapturableFieldValue(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') {
    return true;
  }
  if (t !== 'object') return false; // function | symbol | undefined
  if (Array.isArray(value)) return true;
  try {
    const proto = Object.getPrototypeOf(value) as object | null;
    return proto === null || proto === Object.prototype;
  } catch {
    return false;
  }
}

/**
 * US3 / ES-6: capture `source`'s safe own enumerable properties (beyond the
 * standard error keys) onto `target.fields`, value-filtered and clipped to
 * `maxFields` with `fieldsTruncated`. The sole prototype special case is
 * `DOMException`'s legacy numeric `code` (a prototype getter that generic
 * own-property capture cannot see). Hostile getters are skipped, recorded
 * once on the budget state, and reported by `serializeError` (US3.4).
 */
function captureFields(
  target: ErrorInfo | SerializedErrorNode,
  source: object,
  limits: ResolvedSerializeErrorsLimits,
  budget: BudgetState,
): void {
  if (limits.maxFields === 0) return;

  const fields: Record<string, unknown> = {};
  let count = 0;
  let truncated = false;

  let keys: string[];
  try {
    keys = Object.keys(source);
  } catch {
    keys = [];
  }

  for (const key of keys) {
    if (EXCLUDED_FIELD_KEYS.has(key)) continue;
    let raw: unknown;
    try {
      raw = (source as Record<string, unknown>)[key];
    } catch (err) {
      budget.guardedFailure ??= err;
      continue;
    }
    if (!isCapturableFieldValue(raw)) continue;
    if (count >= limits.maxFields) {
      truncated = true;
      break;
    }
    fields[key] = raw;
    count++;
  }

  // DOMException legacy `code` (R2): structural detection — a numeric,
  // positive `code` reachable via the prototype and not already captured.
  if (!('code' in fields) && count < limits.maxFields) {
    const code = safeGet(source, 'code');
    if (typeof code === 'number' && Number.isFinite(code) && code > 0) {
      fields.code = code;
      count++;
    }
  }

  if (count > 0) target.fields = fields;
  if (truncated) target.fieldsTruncated = true;
}
