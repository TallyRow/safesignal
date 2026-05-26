/**
 * STUB — Phase 5 (T034) replaces the body of `controlCharGuard` with
 * the per-`plan.md §Log-injection & output safety` escape pass over
 * every string value in `event.message`, `event.attributes`,
 * `event.context.attributes`, and `event.error.*`.
 *
 * **WARNING**: until T034 ships, this is a pass-through. Untrusted
 * newlines and control characters in messages or attributes are NOT
 * escaped. Do not deploy.
 */

import type { LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const controlCharGuard: PipelineStage = (
  event: LogEvent,
  _config: NormalizedConfig,
): LogEvent | null => event;
