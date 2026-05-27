/**
 * Deterministic `LogContext` merge.
 *
 * Algorithm (per `data-model.md` and `contracts/logger-config.md` LC-7):
 *
 *   Sources in increasing precedence order (later wins):
 *     1. configureLogging({ context })       — root static context
 *     2. createLogger({ context })           — per-logger static context
 *     3. logger.child(context) chain         — derived loggers
 *     4. correlation() return value          — per-emit dynamic context
 *
 *   For each source:
 *     - `application`, `module`, `environment` — shallow replace if defined
 *     - `attributes` — **deep-merge** key-by-key (per `data-model.md`):
 *         * if both sides have a plain-object value for the same key, recurse
 *         * otherwise the later value replaces the earlier
 *         * arrays are treated as leaves and replaced wholesale (the later
 *           array wins; we never concatenate)
 *
 *   Undefined keys in a later source do NOT overwrite earlier definitions.
 *
 * The function is pure: it never mutates its inputs. The output's
 * `attributes` is always a fresh object — callers receive an independent
 * copy that they may not mutate, but mutating it would not corrupt any
 * source's `attributes`.
 */

import type { AttributeValue, Attributes, LogContext } from '../api/types.js';

/**
 * Merge an ordered list of partial contexts into a single `LogContext`.
 * `undefined` sources are skipped, which lets callers pass an unconditional
 * sequence without having to filter beforehand.
 */
export function mergeContexts(
  ...sources: ReadonlyArray<Partial<LogContext> | undefined>
): LogContext {
  const merged: {
    application?: LogContext['application'];
    module?: LogContext['module'];
    environment?: string;
    attributes?: Attributes;
  } = {};

  for (const src of sources) {
    if (src === undefined) continue;

    if (src.application !== undefined) {
      merged.application = src.application;
    }
    if (src.module !== undefined) {
      merged.module = src.module;
    }
    if (src.environment !== undefined) {
      merged.environment = src.environment;
    }
    if (src.attributes !== undefined) {
      merged.attributes = deepMergeAttributes(
        merged.attributes ?? {},
        src.attributes,
      );
    }
  }

  // Build the final value without writing `undefined` properties (required
  // by `exactOptionalPropertyTypes: true`).
  const out: LogContext = {};
  if (merged.application !== undefined) out.application = merged.application;
  if (merged.module !== undefined) out.module = merged.module;
  if (merged.environment !== undefined) out.environment = merged.environment;
  if (merged.attributes !== undefined) out.attributes = merged.attributes;
  return out;
}

/**
 * Deep-merge two `Attributes` records. The earlier record provides the
 * base; the later record overlays on top. For keys present in both:
 *   - plain-object × plain-object → recurse
 *   - any other shape combination → later value wins (replaces wholesale)
 * Arrays are treated as leaves and replaced, not concatenated, so a
 * later layer's array fully replaces the earlier layer's.
 *
 * Pure: never mutates `earlier` or `later`. Always returns a fresh
 * object for the merged result.
 */
function deepMergeAttributes(earlier: Attributes, later: Attributes): Attributes {
  const result: { [key: string]: AttributeValue } = { ...earlier };
  for (const key of Object.keys(later)) {
    const laterValue = later[key];
    if (laterValue === undefined) continue;
    const earlierValue = result[key];
    if (isPlainAttributeObject(earlierValue) && isPlainAttributeObject(laterValue)) {
      result[key] = deepMergeAttributes(earlierValue, laterValue);
    } else {
      result[key] = laterValue;
    }
  }
  return result;
}

function isPlainAttributeObject(
  value: AttributeValue | undefined,
): value is Attributes {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}
