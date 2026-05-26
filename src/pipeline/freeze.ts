/**
 * STUB — Phase 5 (T033) replaces the body of `freezeInDev` with a
 * `__DEV__`-gated recursive `Object.freeze` on the post-redaction event
 * so dev-mode transports cannot accidentally mutate events in flight.
 * Production builds dead-code-eliminate the freeze body.
 *
 * The module reads ONLY the build-time global `__DEV__` (injected by
 * `tsup`'s `define`); it never consults `process.env` — enforced by
 * `tests/contract/no-ambient-state.test.ts` (T013).
 *
 * **WARNING**: until T033 ships, this is a pass-through. Events are
 * not frozen in dev builds; a misbehaving transport could mutate them.
 */

import type { LogEvent } from '../api/types.js';
import type { NormalizedConfig } from '../config/config.js';
import type { PipelineStage } from './dispatcher.js';

export const freezeInDev: PipelineStage = (
  event: LogEvent,
  _config: NormalizedConfig,
): LogEvent | null => event;
