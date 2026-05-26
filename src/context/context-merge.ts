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
 *     - `application`, `module`, `environment` — wholesale replace if defined
 *     - `attributes` — shallow-merge key-by-key (later key wins)
 *
 *   Undefined keys in a later source do NOT overwrite earlier definitions.
 *
 * The function is pure: it never mutates its inputs.
 */

import type { LogContext } from '../api/types.js';

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
    attributes?: LogContext['attributes'];
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
      merged.attributes = {
        ...(merged.attributes ?? {}),
        ...src.attributes,
      };
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
