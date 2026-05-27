/**
 * Configuration normalization. Internal — the resulting `NormalizedConfig`
 * is never exposed to consumers.
 *
 * Normalization is deterministic: given the same `LoggerConfig` input,
 * `normalizeConfig` always produces an equivalent `NormalizedConfig`.
 * `SanitizerLimits` values outside the documented `min`/`max` bounds are
 * clamped, and each clamping event emits one `onInternalError` notice
 * (per `contracts/logger-config.md` LC-10).
 */

import type {
  AppIdentity,
  LevelMap,
  LogContext,
  LoggerConfig,
  LogLevel,
  ModuleIdentity,
  Redactor,
  SanitizerLimits,
  Transport,
} from '../api/types.js';

import { PackageError, safeNotify } from '../internal/errors/internal-errors.js';

import {
  DEFAULT_SANITIZER_LIMITS,
  SANITIZER_LIMIT_BOUNDS,
  defaultLevelForEnvironment,
} from './env-defaults.js';

/**
 * Fully-normalized configuration produced by `normalizeConfig`. Internal
 * across the package — never exposed in public types or contracts.
 *
 * Fields are typed as `T | undefined` (rather than `T?`) so consumers of
 * `NormalizedConfig` can rely on the keys always being present, which keeps
 * downstream code stable under `exactOptionalPropertyTypes: true`.
 */
export interface NormalizedConfig {
  readonly application: AppIdentity | undefined;
  readonly module: ModuleIdentity | undefined;
  readonly environment: string | undefined;
  /** Single resolved level for the configured environment. */
  readonly level: LogLevel;
  readonly context: Partial<LogContext>;
  readonly correlation: (() => Partial<LogContext>) | undefined;
  readonly transports: ReadonlyArray<Transport>;
  readonly redactor: Redactor | undefined;
  readonly sanitizerLimits: SanitizerLimits;
  readonly onInternalError: (err: Error) => void;
}

/** Silent default for `onInternalError`. */
const NOOP_ON_INTERNAL_ERROR: (err: Error) => void = () => undefined;

/**
 * Produce a `NormalizedConfig` from a consumer `LoggerConfig`. Pure and
 * deterministic apart from invoking the `onInternalError` callback for each
 * out-of-bounds sanitizer limit. Transport factories are invoked once here.
 */
export function normalizeConfig(config: LoggerConfig): NormalizedConfig {
  const environment = config.environment;
  const onInternalError = config.onInternalError ?? NOOP_ON_INTERNAL_ERROR;

  const sanitizerLimits = resolveSanitizerLimits(
    config.sanitizerLimits,
    onInternalError,
  );

  const level = resolveConfigLevel(config.level, environment);

  const transports = (config.transports ?? []).map((entry) =>
    typeof entry === 'function' ? entry() : entry,
  );

  return {
    application: config.application,
    module: config.module,
    environment,
    level,
    context: config.context ?? {},
    correlation: config.correlation,
    transports,
    redactor: config.redactor,
    sanitizerLimits,
    onInternalError,
  };
}

/**
 * Resolve `LoggerConfig.level` (which may be a `LogLevel`, a `LevelMap`, or
 * undefined) against the configured environment, falling back to the
 * documented env-default table.
 */
function resolveConfigLevel(
  level: LogLevel | LevelMap | undefined,
  environment: string | undefined,
): LogLevel {
  if (level === undefined) {
    return defaultLevelForEnvironment(environment);
  }
  if (typeof level === 'string') {
    return level;
  }
  // LevelMap branch — look up by environment, fall back to env default.
  if (environment !== undefined) {
    const map = level as Record<string, LogLevel | undefined>;
    const mapped = map[environment];
    if (mapped !== undefined) return mapped;
  }
  return defaultLevelForEnvironment(environment);
}

/**
 * Apply consumer-supplied sanitizer-limit overrides on top of the documented
 * defaults, clamping to documented `min`/`max`. Each clamped value emits one
 * `onInternalError` notice per `configureLogging()` call.
 */
function resolveSanitizerLimits(
  overrides: Partial<SanitizerLimits> | undefined,
  onInternalError: (err: Error) => void,
): SanitizerLimits {
  if (overrides === undefined) {
    return { ...DEFAULT_SANITIZER_LIMITS };
  }

  const limits: SanitizerLimits = { ...DEFAULT_SANITIZER_LIMITS };
  const keys = Object.keys(SANITIZER_LIMIT_BOUNDS) as Array<keyof SanitizerLimits>;

  for (const key of keys) {
    const requested = overrides[key];
    if (requested === undefined) continue;

    const bounds = SANITIZER_LIMIT_BOUNDS[key];
    if (requested > bounds.max) {
      limits[key] = bounds.max;
      safeNotify(
        onInternalError,
        new PackageError(
          'sanitizer_limit_clamped',
          `sanitizerLimits.${key} value ${String(requested)} exceeds max ${String(bounds.max)}; clamped to ${String(bounds.max)}`,
        ),
      );
    } else if (requested < bounds.min) {
      limits[key] = bounds.min;
      safeNotify(
        onInternalError,
        new PackageError(
          'sanitizer_limit_clamped',
          `sanitizerLimits.${key} value ${String(requested)} is below min ${String(bounds.min)}; clamped to ${String(bounds.min)}`,
        ),
      );
    } else {
      limits[key] = requested;
    }
  }

  return limits;
}
