/**
 * Level filter — the cheapest possible drop-fast step in the pipeline.
 * Runs BEFORE event construction so a filtered-out emission performs no
 * work beyond a constant-time numeric comparison.
 *
 * Resolution chain per `contracts/logger-config.md` LC-1..LC-3 splits
 * across two modules:
 *
 *   - `normalizeConfig()` (T006) resolves `LoggerConfig.level`
 *     (a `LogLevel`, a `LevelMap` looked up by `environment`, or the
 *     env-default table) into a single `LogLevel` stored on
 *     `NormalizedConfig.level`. The hard `warn` fallback also happens
 *     there.
 *
 *   - `passesLevelFilter()` here applies the per-logger
 *     `CreateLoggerOptions.level` override on top of that resolved value.
 *
 * `LEVEL_NUMBER` is internal-only (per `data-model.md` "internal numeric
 * values are not exported").
 */

import type { LogLevel } from '../api/types.js';

const LEVEL_NUMBER: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Resolve the effective minimum level for an emission: a per-logger
 * `CreateLoggerOptions.level` override wins; otherwise the
 * already-resolved `NormalizedConfig.level` applies.
 */
export function resolveEffectiveLevel(
  perLoggerLevel: LogLevel | undefined,
  configLevel: LogLevel,
): LogLevel {
  return perLoggerLevel ?? configLevel;
}

/**
 * Return `true` if an event at `eventLevel` should reach downstream
 * pipeline stages; `false` if the level filter drops it.
 */
export function passesLevelFilter(
  eventLevel: LogLevel,
  perLoggerLevel: LogLevel | undefined,
  configLevel: LogLevel,
): boolean {
  const effective = resolveEffectiveLevel(perLoggerLevel, configLevel);
  return LEVEL_NUMBER[eventLevel] >= LEVEL_NUMBER[effective];
}
