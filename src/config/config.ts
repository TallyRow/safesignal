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
  BreadcrumbsOptions,
  LevelMap,
  LogContext,
  LoggerConfig,
  LogLevel,
  ModuleIdentity,
  Redactor,
  SanitizerLimits,
  SerializeErrorsOptions,
  StackNormalizer,
  Transport,
} from '../api/types.js';

import {
  BreadcrumbBuffer,
  DEFAULT_MAX_EVENTS,
  MAX_EVENTS_BOUND,
} from '../breadcrumbs/breadcrumb-buffer.js';
import {
  PackageError,
  safeNotify,
} from '../internal/errors/internal-errors.js';

import {
  DEFAULT_SANITIZER_LIMITS,
  DEFAULT_SERIALIZE_ERRORS_LIMITS,
  defaultLevelForEnvironment,
  SANITIZER_LIMIT_BOUNDS,
  SERIALIZE_ERRORS_LIMIT_BOUNDS,
} from './env-defaults.js';

/** Fully-resolved deep-error-serialization limits (Feature 023). */
export type ResolvedSerializeErrorsLimits = Required<SerializeErrorsOptions>;

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
  /** Shared runtime-level breadcrumb ring buffer, or undefined when off (default). */
  readonly breadcrumbs: BreadcrumbBuffer | undefined;
  /** Consumer error-stack normalizer (`./stacks`), or undefined when off (default). */
  readonly normalizeStack: StackNormalizer | undefined;
  /** Resolved deep-error-serialization limits, or undefined when off (default). */
  readonly serializeErrors: ResolvedSerializeErrorsLimits | undefined;
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
    breadcrumbs: resolveBreadcrumbs(config.breadcrumbs, onInternalError),
    normalizeStack: config.normalizeStack,
    serializeErrors: resolveSerializeErrors(
      config.serializeErrors,
      onInternalError,
    ),
    onInternalError,
  };
}

/**
 * Resolve the opt-in `serializeErrors` config (Feature 023) into fully
 * resolved limits, or `undefined` when off — the default. Out-of-range
 * values clamp to the documented bounds with one `onInternalError` notice
 * per clamped key (`error_serialize_clamped`), mirroring the sanitizer-limit
 * clamp. Non-finite values fall back to the key's default without a notice;
 * non-integer values floor.
 */
function resolveSerializeErrors(
  option: boolean | SerializeErrorsOptions | undefined,
  onInternalError: (err: Error) => void,
): ResolvedSerializeErrorsLimits | undefined {
  if (option === undefined || option === false) return undefined;
  if (option === true) return { ...DEFAULT_SERIALIZE_ERRORS_LIMITS };
  return clampLimits(
    DEFAULT_SERIALIZE_ERRORS_LIMITS,
    option,
    SERIALIZE_ERRORS_LIMIT_BOUNDS,
    'serializeErrors',
    'error_serialize_clamped',
    onInternalError,
    true,
  );
}

/**
 * Shared clamp-and-notify limit resolution (sanitizer limits LC-10 and
 * Feature 023 serialization limits ES-13): apply consumer overrides on top
 * of `defaults`, clamping each to its documented `min`/`max` with one
 * `onInternalError` notice per clamped key. Non-finite overrides are
 * ignored; `floor` additionally floors non-integer overrides.
 */
function clampLimits<T extends { [K in keyof T]: number }>(
  defaults: Readonly<T>,
  overrides: { [K in keyof T]?: number },
  bounds: Readonly<{ [K in keyof T]: Readonly<{ min: number; max: number }> }>,
  label: string,
  code: ConstructorParameters<typeof PackageError>[0],
  onInternalError: (err: Error) => void,
  floor: boolean,
): T {
  const limits: Record<string, number> = { ...defaults };
  for (const key of Object.keys(bounds) as Array<keyof T & string>) {
    const requested = overrides[key];
    if (requested === undefined || !Number.isFinite(requested)) continue;
    const value = floor ? Math.floor(requested) : requested;
    const { min, max } = bounds[key];
    if (value > max || value < min) {
      const clamped = value > max ? max : min;
      limits[key] = clamped;
      safeNotify(
        onInternalError,
        new PackageError(
          code,
          `${label}.${key} value ${String(requested)} ${value > max ? 'exceeds max' : 'is below min'} ${String(clamped)}; clamped to ${String(clamped)}`,
        ),
      );
    } else {
      limits[key] = value;
    }
  }
  return limits as unknown as T;
}

/**
 * Resolve the opt-in `breadcrumbs` config into a shared ring buffer (or
 * `undefined` when off — the default). Constructs the buffer **once** here.
 * `maxEvents` is clamped to `[1, MAX_EVENTS_BOUND]`, emitting one notice on clamp
 * (mirrors the sanitizer-limit clamp).
 */
function resolveBreadcrumbs(
  option: boolean | BreadcrumbsOptions | undefined,
  onInternalError: (err: Error) => void,
): BreadcrumbBuffer | undefined {
  if (!option) return undefined; // undefined | false → off
  const requested = option === true ? undefined : option.maxEvents;
  if (requested === undefined || !Number.isFinite(requested)) {
    return new BreadcrumbBuffer(DEFAULT_MAX_EVENTS);
  }
  const maxEvents = Math.min(
    MAX_EVENTS_BOUND,
    Math.max(1, Math.floor(requested)),
  );
  if (maxEvents !== requested) {
    safeNotify(
      onInternalError,
      new PackageError(
        'breadcrumbs_max_clamped',
        `breadcrumbs.maxEvents clamped to ${maxEvents}`,
      ),
    );
  }
  return new BreadcrumbBuffer(maxEvents);
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
  return clampLimits(
    DEFAULT_SANITIZER_LIMITS,
    overrides,
    SANITIZER_LIMIT_BOUNDS,
    'sanitizerLimits',
    'sanitizer_limit_clamped',
    onInternalError,
    false,
  );
}
