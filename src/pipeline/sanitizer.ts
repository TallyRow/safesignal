/**
 * STUB — Phase 5 (T031) replaces the body of `sanitize` with the
 * full per-`contracts/sanitization.md` normalization (depth, size,
 * count, type-tagging of class instances / DOM nodes / framework
 * objects, cyclic-ref handling). The MODULE LOCATION and the
 * `sanitize` function SIGNATURE are stable so T031 fills in the
 * body without touching `dispatcher.ts`.
 *
 * **WARNING**: until T031 ships, this is a pass-through. The
 * package is NOT secure-by-default in its current state — the
 * sanitizer/redactor/control-char-guard stubs do nothing yet. Do
 * not deploy.
 */

import type { LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const sanitize: PipelineStage = (
  event: LogEvent,
  _config: NormalizedConfig,
): LogEvent | null => event;
