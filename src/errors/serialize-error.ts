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
  if (value instanceof Error) return true;
  if (value === null || typeof value !== 'object') return false;
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
  // US2 (T020): recursive AggregateError member capture
  // US3 (T025): value-filtered extra-field capture + DOMException code
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
    entries.push(reduceToNameMessage(cursor));
    cursor = getCauseOf(cursor);
  }

  if (entries.length > 0) target.causes = entries;
  if (truncated) target.causesTruncated = true;
}
