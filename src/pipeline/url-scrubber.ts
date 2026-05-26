/**
 * STUB — Phase 5 (T032) replaces both functions with the real URL
 * scrubber: pipeline-stage walks string values and replaces sensitive
 * query/fragment params with `[REDACTED]`; the public `scrubUrl()`
 * helper exposes the same operation directly for consumer pre-scrubbing.
 *
 * **WARNING**: until T032 ships, both functions are pass-through. URLs
 * with secrets in query strings are NOT scrubbed. Do not deploy.
 */

import type { LogEvent, ScrubUrlOptions } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const urlScrub: PipelineStage = (
  event: LogEvent,
  _config: NormalizedConfig,
): LogEvent | null => event;

export function scrubUrl(url: string, _options?: ScrubUrlOptions): string {
  return url;
}
