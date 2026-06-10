/**
 * Opt-in error breadcrumbs (Feature 016) — the bounded buffer + cause-chain
 * walker.
 *
 * A single runtime-level resource (created once at `configureLogging()` and
 * shared across every `Logger`) holds the most recent **post-pipeline**
 * (sanitized + redacted) event snapshots. When an error is dispatched, the
 * recent trail is attached to that error event as `attributes[BREADCRUMBS_KEY]`,
 * and the error's cause chain is written (by `logger.ts`, pre-pipeline) under
 * `attributes[CAUSES_KEY]`.
 *
 *   - Recording is constant-cost per log (bounded by capacity, independent of
 *     total events); memory stays constant (≤ capacity snapshots).
 *   - Snapshots are compact copies, never references to the live (dev-frozen)
 *     event, and EXCLUDE the breadcrumbs key (anti-nesting).
 *   - Origin (`app`/`module` names) is captured so host vs. federated-module
 *     breadcrumbs stay distinguishable (FR-011).
 *   - `extractCauseChain` is cycle-safe + depth-bounded.
 *
 * Type-only import from the public types keeps this module isolated from the
 * pipeline internals.
 */

import type {
  Attributes,
  AttributeValue,
  LogEvent,
  LogLevel,
} from '../api/types.js';
import {
  safeNotify,
  wrapAsPackageError,
} from '../internal/errors/internal-errors.js';

/** Route a breadcrumb record/enrich/cause failure to the diagnostics hook (fail-safe). */
export function breadcrumbFail(
  onInternalError: (err: Error) => void,
  err: unknown,
): void {
  safeNotify(
    onInternalError,
    wrapAsPackageError('breadcrumb_failed', 'breadcrumb failed', err),
  );
}

/** Default ring capacity when breadcrumbs are enabled without an explicit value. */
export const DEFAULT_MAX_EVENTS = 20;
/** Upper bound for `maxEvents`; larger requests clamp to this (one notice). */
export const MAX_EVENTS_BOUND = 100;
/** Reserved attribute key the trail is attached under. */
export const BREADCRUMBS_KEY = 'safesignal.breadcrumbs';

/** A compact, bounded snapshot of one past post-pipeline event. */
export interface BreadcrumbSnapshot {
  ts: string;
  level: LogLevel;
  message: string;
  /** `context.application?.name` — origin attribution (omitted when absent). */
  app?: string;
  /** `context.module?.name` — keeps host vs. module breadcrumbs distinct. */
  module?: string;
  /** Already-redacted attributes, excluding the breadcrumbs key; omitted when empty. */
  attributes?: Attributes;
}

/** Build the compact snapshot recorded into the ring. */
function buildSnapshot(event: LogEvent): BreadcrumbSnapshot {
  const snap: BreadcrumbSnapshot = {
    ts: event.timestamp,
    level: event.level,
    message: event.message,
  };
  const app = event.context.application?.name;
  if (app !== undefined) snap.app = app;
  const mod = event.context.module?.name;
  if (mod !== undefined) snap.module = mod;
  // Shallow-copy attributes minus the trail key (anti-nesting); omit when empty.
  const attrs: Attributes = {};
  let hasAttrs = false;
  for (const key of Object.keys(event.attributes)) {
    const value = event.attributes[key];
    if (key === BREADCRUMBS_KEY || value === undefined) continue;
    attrs[key] = value;
    hasAttrs = true;
  }
  if (hasAttrs) snap.attributes = attrs;
  return snap;
}

/**
 * Bounded buffer of breadcrumb snapshots, oldest→newest. Recording is
 * constant-cost per log (bounded by the fixed capacity, independent of how many
 * events are logged); memory stays constant (≤ capacity snapshots).
 */
export class BreadcrumbBuffer {
  private readonly capacity: number;
  private readonly ring: BreadcrumbSnapshot[] = [];

  constructor(maxEvents: number) {
    // Caller (resolveBreadcrumbs) has already clamped to [1, MAX_EVENTS_BOUND].
    this.capacity = maxEvents;
  }

  /** Record a compact snapshot of a post-pipeline event; oldest evicted. */
  record(event: LogEvent): void {
    this.ring.push(buildSnapshot(event));
    if (this.ring.length > this.capacity) this.ring.shift();
  }

  /**
   * Attach the current trail to an error event as `attributes[BREADCRUMBS_KEY]`
   * (ordered oldest→newest). No-op when the buffer is empty (no placeholder).
   */
  attachTrailTo(event: LogEvent): void {
    if (this.ring.length === 0) return;
    event.attributes[BREADCRUMBS_KEY] =
      this.ring.slice() as unknown as AttributeValue;
  }
}

// ---------------------------------------------------------------------------
// Cause chain
// ---------------------------------------------------------------------------

/** Max number of nested causes captured (cycle/depth backstop). */
export const MAX_CAUSE_DEPTH = 8;
/** Reserved attribute key the cause chain is written under. */
export const CAUSES_KEY = 'safesignal.errorCauses';

/** Read a `.cause` property defensively from an object value. */
function getCause(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && 'cause' in value) {
    return (value as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Extract the nested cause chain of `value` (outermost → root), excluding the
 * top error (it stays in `event.error`). Cycle-safe and bounded to `maxDepth`
 * entries; returns `[]` when there is no cause. Each entry is `{ name, message }`
 * (non-`Error` causes via `String()`).
 */
export function extractCauseChain(
  value: unknown,
  maxDepth: number,
): Array<{ name: string; message: string }> {
  const chain: Array<{ name: string; message: string }> = [];
  const seen = new Set<unknown>();
  if (value !== null && typeof value === 'object') seen.add(value);

  let current = getCause(value);
  while (current !== undefined && current !== null && chain.length < maxDepth) {
    if (typeof current === 'object') {
      if (seen.has(current)) break; // cycle guard
      seen.add(current);
    }
    chain.push(
      current instanceof Error
        ? { name: current.name, message: current.message }
        : { name: 'NonError', message: String(current) },
    );
    current = getCause(current);
  }
  return chain;
}
