/**
 * Dev-only deep-freeze stage. Runs last in the pipeline (after the
 * control-char guard) so that the event handed off to the dispatcher
 * is immutable in development builds.
 *
 * Contract: `contracts/log-event.md` ("Immutability") + plan.md
 * "Security Architecture > Pipeline ordering".
 *
 * Build-time gating:
 *   - In development builds (`__DEV__ === true`, the default for
 *     `vitest` and any non-production `tsup` build), the event is
 *     recursively `Object.freeze`d so consumer transports cannot
 *     accidentally mutate it before delivery.
 *   - In production builds (`__DEV__ === false`), the entire
 *     freeze body is unreachable. `tsup` replaces `__DEV__` with the
 *     literal `false` at build time and tree-shakes the `deepFreeze`
 *     helper out of the production bundle — preserving the documented
 *     "zero runtime cost in production" guarantee.
 *
 * The module reads ONLY the build-time global `__DEV__`. It never
 * consults `process.env`, `import.meta.env`, `location`,
 * `document.cookie`, or any other ambient state (enforced by
 * `tests/contract/no-ambient-state.test.ts` — T013).
 */

import type { LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const freezeInDev: PipelineStage = (event, _config) => {
  if (!__DEV__) return event;
  deepFreeze(event);
  return event;
};

function deepFreeze(value: object): void {
  if (Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== null && typeof child === 'object') {
      deepFreeze(child);
    }
  }
}
