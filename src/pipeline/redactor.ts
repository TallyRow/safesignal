/**
 * STUB — Phase 5 (T035) replaces:
 *   - the `redact` pipeline stage with the fail-closed walk over
 *     `event.attributes`, `event.context.attributes`, `event.message`,
 *     and `event.error.*` per `contracts/redaction.md` (R-1..R-10), and
 *   - the public `createRedactor(rules?)` factory with the documented
 *     default-denylist + JWT/Bearer shape-rule implementation.
 *
 * **WARNING**: until T035 ships, both are pass-through (identity).
 * Sensitive values in attributes are NOT redacted. Do not deploy.
 */

import type {
  LogEvent,
  RedactionRule,
  Redactor,
} from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const redact: PipelineStage = (
  event: LogEvent,
  _config: NormalizedConfig,
): LogEvent | null => event;

export function createRedactor(_rules?: RedactionRule[]): Redactor {
  return (event: LogEvent): LogEvent | null => event;
}
