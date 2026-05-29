/**
 * Environment-aware default levels and sanitizer-limit bounds. Internal to
 * the package — the values here are the source of truth that
 * `contracts/logger-config.md` and `contracts/sanitization.md` describe.
 *
 * The package MUST NOT read `process.env`, `import.meta.env`, `location`, or
 * `document.cookie`. Consumers MUST pass `environment` explicitly via
 * `configureLogging({ environment })`. The defaults below resolve based on
 * the value the consumer supplied.
 */

import type { LogLevel, SanitizerLimits } from '../api/types.js';

/** Per-environment baseline minimum level. Unknown environments fall back to `warn`. */
export const DEFAULT_LEVEL_BY_ENVIRONMENT: Readonly<Record<string, LogLevel>> =
  {
    production: 'warn',
    development: 'debug',
    test: 'warn',
  };

/** Hard fallback when no level resolution path yields a value. */
export const FALLBACK_LEVEL: LogLevel = 'warn';

/** Default sanitizer bounds per `contracts/sanitization.md`. */
export const DEFAULT_SANITIZER_LIMITS: Readonly<SanitizerLimits> = {
  maxDepth: 8,
  maxStringLength: 8192,
  maxArrayLength: 1000,
  maxAttributeCount: 256,
};

/**
 * Min/Max bounds per sanitizer limit. Consumer-supplied values outside these
 * bounds clamp to the nearest bound and emit one `onInternalError` notice
 * via `normalizeConfig()`.
 */
export const SANITIZER_LIMIT_BOUNDS: Readonly<{
  [K in keyof SanitizerLimits]: Readonly<{ min: number; max: number }>;
}> = {
  maxDepth: { min: 1, max: 16 },
  maxStringLength: { min: 64, max: 65536 },
  maxArrayLength: { min: 1, max: 10000 },
  maxAttributeCount: { min: 1, max: 4096 },
};

/**
 * Resolve the default level for a given environment string. Returns
 * `FALLBACK_LEVEL` when the environment is undefined or unknown.
 */
export function defaultLevelForEnvironment(
  environment: string | undefined,
): LogLevel {
  if (environment === undefined) return FALLBACK_LEVEL;
  return DEFAULT_LEVEL_BY_ENVIRONMENT[environment] ?? FALLBACK_LEVEL;
}
