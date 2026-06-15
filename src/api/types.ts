/**
 * Public type surface for the frontend logging package.
 *
 * Every export here is part of the SemVer-stable consumer contract documented
 * in `specs/001-structured-logging-core/contracts/`. Adding new optional
 * fields is a minor-version change; removals or signature changes require a
 * major-version bump and a migration note.
 *
 * Locked invariants:
 *   - `Attributes` is a recursive **constrained** union — `unknown` and
 *     `object` are deliberately excluded so passing a raw class instance is
 *     type-friction. The sanitizer (T031) coerces stragglers at runtime.
 *   - The ONLY `unknown` parameter in the public surface is the optional
 *     `error` arg of `Logger.error()`.
 *   - The package source MUST NOT consult any ambient state
 *     (`process.env`, `import.meta.env`, `location`, `document.cookie`);
 *     enforced by `tests/contract/no-ambient-state.test.ts` (T013).
 *   - The public `.d.ts` MUST NOT mention `@opentelemetry/*` or any OTel
 *     concept name; enforced by `tests/contract/declarations-surface.test.ts`
 *     (T013) and `tests/security/bundle-shape.security.test.ts` (T049).
 */

// ---------------------------------------------------------------------------
// Level model
// ---------------------------------------------------------------------------

/** Severity levels, in increasing order. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Per-environment level overrides. Resolved per `contracts/logger-config.md`
 * (LC-3): config.level (LevelMap → environment lookup) takes precedence over
 * the env-default table.
 */
export type LevelMap = Partial<
  Record<'production' | 'development' | 'test', LogLevel>
>;

// ---------------------------------------------------------------------------
// Attributes (recursive constrained union — see locked invariants above)
// ---------------------------------------------------------------------------

/**
 * A value that may appear inside `LogEvent.attributes` or
 * `LogContext.attributes`. Excludes `unknown`, `object`, class instances, DOM
 * nodes, framework objects, functions, symbols, and bigints by design —
 * passing those is allowed at runtime (TypeScript cannot fully prevent it)
 * but the sanitizer (T031) reduces them to type tags before any transport
 * sees the event.
 */
export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | AttributeValue[]
  | { [key: string]: AttributeValue };

/** A bag of per-call or per-context structured attributes. Always an object. */
export type Attributes = Record<string, AttributeValue>;

// ---------------------------------------------------------------------------
// Identity & context
// ---------------------------------------------------------------------------

/** Application identity — the consuming app, even from a federated module. */
export interface AppIdentity {
  name: string;
  version?: string;
}

/** Module identity — for independently deployed federated modules. */
export interface ModuleIdentity {
  name: string;
  version?: string;
}

/**
 * W3C Trace Context carried (consume/propagate only — SafeSignal is not a
 * tracer and never mints ids) on a `LogEvent.context` when supplied. Ids are
 * lowercase-hex strings. Present on an event only after fail-closed validation
 * (`normalizeTraceContext`): both ids are required and well-formed, else the
 * whole `trace` is dropped. See `specs/008-trace-context/`.
 */
export interface TraceContext {
  /** 32 lowercase-hex chars, not all-zero. */
  traceId: string;
  /** 16 lowercase-hex chars, not all-zero. */
  spanId: string;
  /** W3C trace flags as an integer 0–255 (bit 0 = sampled). */
  traceFlags?: number;
  /** Raw W3C `tracestate`, length-bounded. */
  traceState?: string;
}

/**
 * Merged context attached to every emitted `LogEvent`. Merge precedence
 * is documented in `contracts/logger-config.md` (LC-7) and
 * `data-model.md`: root config → per-logger options → logger chain
 * (`child()` / `withContext()`) → `correlation()` return value.
 */
export interface LogContext {
  application?: AppIdentity;
  module?: ModuleIdentity;
  environment?: string;
  attributes?: Attributes;
  /** Optional W3C Trace Context (additive); present only when valid. */
  trace?: TraceContext;
}

// ---------------------------------------------------------------------------
// Error capture
// ---------------------------------------------------------------------------

/**
 * Captured error information populated by `Logger.error(msg, attrs, err)`.
 * The pipeline reduces an arbitrary `unknown` error value to this shape
 * immediately; transports never see the original `Error` instance.
 */
export interface ErrorInfo {
  name: string;
  message: string;
  stack?: string;
  /**
   * Flat, ordered cause chain of the logged error, outermost cause first.
   * Present only when deep error serialization (Feature 023) is enabled and
   * the error has a cause; never empty.
   */
  causes?: SerializedErrorNode[];
  /**
   * `AggregateError` member nodes, original order, count-bounded. Present
   * only when deep error serialization is enabled; never empty.
   */
  members?: SerializedErrorNode[];
  /**
   * Value-filtered own enumerable properties beyond name/message/stack/cause
   * (plus `DOMException`'s legacy numeric `code`). Present only when deep
   * error serialization is enabled; never empty.
   */
  fields?: Record<string, unknown>;
  /** Set when the cause chain was clipped (depth or node budget). */
  causesTruncated?: true;
  /** Original member count, set only when members were omitted. */
  membersTotal?: number;
  /** Set when the field set was clipped (`maxFields`). */
  fieldsTruncated?: true;
  /** Set on the top-level payload when the node budget clipped anything. */
  budgetExhausted?: true;
}

/**
 * Structured representation of one serialized error (Feature 023): a
 * cause-chain entry or an `AggregateError` member. Recursive only through
 * `members` — entries inside a `causes` array never carry `causes` of their
 * own (linear chains are always flattened into the containing array).
 * Nested nodes never carry stack text.
 */
export interface SerializedErrorNode {
  /** Error name (`'NonError'` for coerced non-error cause values). */
  name: string;
  /** Error message (`String(value)` for coerced non-error values). */
  message: string;
  /**
   * Flat, ordered cause chain of THIS node, outermost cause first. Present
   * only on aggregate members; never empty.
   */
  causes?: SerializedErrorNode[];
  /** `AggregateError` member nodes of this node; never empty. */
  members?: SerializedErrorNode[];
  /** Value-filtered own enumerable extra properties; never empty. */
  fields?: Record<string, unknown>;
  /** Set when this node's cause chain was clipped (depth or node budget). */
  causesTruncated?: true;
  /** Original member count, set only when members were omitted. */
  membersTotal?: number;
  /** Set when this node's field set was clipped (`maxFields`). */
  fieldsTruncated?: true;
}

/**
 * Tuning options for opt-in **deep error serialization** (Feature 023).
 * Enable via `LoggerConfig.serializeErrors`. Off by default. Out-of-range
 * values clamp to the documented bounds with one `onInternalError` notice
 * per clamped key.
 */
export interface SerializeErrorsOptions {
  /** Max cause-chain entries per node. Default `8`; clamped to `[1, 16]`. */
  maxCauseDepth?: number;
  /** Max aggregate members per node. Default `10`; clamped to `[1, 100]`. */
  maxMembers?: number;
  /** Max extra fields per node. Default `16`; clamped to `[0, 64]`. */
  maxFields?: number;
  /**
   * Binding outer limit: max total serialized nodes per event (chain entries
   * and members combined, recursively). Default `50`; clamped to `[1, 256]`.
   */
  maxNodes?: number;
}

// ---------------------------------------------------------------------------
// The canonical log event delivered to every transport
// ---------------------------------------------------------------------------

/**
 * The canonical structured event produced by the pipeline. By the time a
 * transport receives a `LogEvent`, it has been: (1) sanitized per
 * `contracts/sanitization.md`, (2) URL-scrubbed, (3) redacted per
 * `contracts/redaction.md` (fail-closed), (4) control-char-escaped, and
 * (5) frozen in dev builds. See `contracts/log-event.md` LE-1..LE-11.
 */
export interface LogEvent {
  /** ISO-8601 string assigned by the pipeline; consumer-supplied input ignored. */
  timestamp: string;
  /** Severity matching the logger method called. */
  level: LogLevel;
  /** Required. Empty string allowed. Sanitized for length and control chars. */
  message: string;
  /** Always an object. May be empty. Sanitized and redacted before delivery. */
  attributes: Attributes;
  /** Always present. Merged from config + logger chain + correlation. */
  context: LogContext;
  /** Populated only when `Logger.error(msg, attrs, err)` is called with `err`. */
  error?: ErrorInfo;
}

// ---------------------------------------------------------------------------
// Transport boundary
// ---------------------------------------------------------------------------

/**
 * Delivery interface. Consumer transports MUST follow the security contract
 * in `contracts/transport.md` (T-S1..T-S5): body-only delivery (POST/PUT
 * JSON or `Blob` sendBeacon), HTTPS cross-origin, no event data in URL
 * paths / queries / fragments, treat events as immutable, idempotent
 * `flush`/`shutdown`. Failure isolation is provided by the package's
 * internal `SafeTransport` wrapper.
 */
export interface Transport {
  /** Stable diagnostic identifier. */
  name: string;
  /** Receive a fully processed `LogEvent`. May be sync or async. */
  send(event: LogEvent): void | Promise<void>;
  /** Optional flush hook for batching transports. */
  flush?(): Promise<void>;
  /** Optional shutdown hook. Must be idempotent. */
  shutdown?(): Promise<void>;
}

/**
 * Factory that produces a `Transport`. Used by `LoggerConfig.transports`
 * so configuration values can stay declarative — the factory is invoked
 * once at `configureLogging()` time.
 */
export type TransportFactory = () => Transport;

// ---------------------------------------------------------------------------
// Redaction (fail-closed)
// ---------------------------------------------------------------------------

/**
 * One redaction rule. At least one of `key` or `shape` must be set.
 *   - `key`: case-insensitive match against the IMMEDIATE property name of
 *     the value being inspected (never a value substring).
 *   - `shape`: match against leaf string values, regardless of key.
 */
export interface RedactionRule {
  key?: string | RegExp;
  shape?: RegExp;
  /** Replacement string. Default `'[REDACTED]'`. */
  replacement?: string;
}

/**
 * A redactor receives the post-sanitize, pre-control-char-guard `LogEvent`
 * and returns either a transformed event or `null` to drop the event
 * entirely. MUST be synchronous. If it throws or returns any other value,
 * the dispatcher drops the event (fail-closed) and invokes
 * `LoggerConfig.onInternalError`. See `contracts/redaction.md`.
 */
export type Redactor = (event: LogEvent) => LogEvent | null;

// ---------------------------------------------------------------------------
// Sanitizer (defense-in-depth before redaction)
// ---------------------------------------------------------------------------

/**
 * Configurable upper bounds for the sanitizer. Consumers MAY tighten any
 * limit by passing a value below the default; values above the documented
 * Max clamp to Max, values below Min clamp to Min, and both clamping events
 * emit one `onInternalError` notice at `configureLogging()` time.
 *
 * Defaults / bounds (locked by `contracts/sanitization.md`):
 *   maxDepth:           default  8, min  1, max     16
 *   maxStringLength:    default  8192, min 64, max 65536
 *   maxArrayLength:     default  1000, min  1, max 10000
 *   maxAttributeCount:  default  256, min  1, max  4096
 */
export interface SanitizerLimits {
  maxDepth: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxAttributeCount: number;
}

// ---------------------------------------------------------------------------
// URL scrubber options
// ---------------------------------------------------------------------------

/**
 * Options for `scrubUrl(url, options?)`. The default URL scrubber strips
 * query and (optionally) fragment params whose names match the redaction
 * denylist; `extraParams` adds project-specific names.
 */
export interface ScrubUrlOptions {
  /** Additional query/fragment param names to scrub (case-insensitive). */
  extraParams?: ReadonlyArray<string | RegExp>;
  /** Whether to also scrub the URL fragment. Default `true`. */
  fragment?: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Root logging configuration. Pass once via `configureLogging()`. Defaults
 * are documented in `contracts/logger-config.md`.
 */
export interface LoggerConfig {
  application?: AppIdentity;
  module?: ModuleIdentity;
  /** `'production' | 'development' | 'test'` or any string; unknown → `warn`. */
  environment?: string;
  /** Single level or per-environment map. Overrides env defaults. */
  level?: LogLevel | LevelMap;
  /** Static metadata merged into every emitted event's context. */
  context?: Partial<LogContext>;
  /** Per-emit dynamic context hook. Must be cheap and synchronous. */
  correlation?: () => Partial<LogContext>;
  /** Configured transports. Empty/undefined installs `NoopTransport`. */
  transports?: Array<Transport | TransportFactory>;
  /** Custom redactor. Fully replaces the default unless composed manually. */
  redactor?: Redactor;
  /** Tighten sanitizer bounds. Values above documented Max are clamped. */
  sanitizerLimits?: Partial<SanitizerLimits>;
  /**
   * Opt-in **error breadcrumbs** (off by default). When enabled, an error log
   * automatically carries the most recent events (`attributes['safesignal.breadcrumbs']`)
   * and the error's cause chain (`attributes['safesignal.errorCauses']`), built only
   * from the already sanitized + redacted event. `true` enables defaults; an object
   * overrides them. See {@link BreadcrumbsOptions}.
   */
  breadcrumbs?: boolean | BreadcrumbsOptions;
  /**
   * Opt-in **deep error serialization** (off by default, Feature 023). When
   * enabled, the event's `error` payload additionally carries the error's
   * flat `cause` chain (`error.causes`), `AggregateError` members
   * (`error.members`), and value-filtered own enumerable extra properties
   * (`error.fields`, incl. `DOMException.code`) — bounded, fail-safe, and
   * passed through the same sanitize → scrub → redact pipeline as all event
   * data. `true` enables safe defaults; an object tunes the limits. While
   * enabled, the breadcrumbs cause-chain attribute
   * (`attributes['safesignal.errorCauses']`) is never populated.
   * See {@link SerializeErrorsOptions}.
   */
  serializeErrors?: boolean | SerializeErrorsOptions;
  /**
   * Opt-in **error-stack normalization** (off by default). When set, an error
   * log's `error.stack` is parsed into trimmed, optionally source-map-resolved
   * structured frames and attached as `attributes['safesignal.stack']` (the raw
   * `error.stack` is preserved). Supply via the `./stacks` subpath:
   * `createStackNormalizer({ resolver })`. See {@link StackNormalizer}.
   */
  normalizeStack?: StackNormalizer;
  /**
   * Diagnostics hook for internal failures (transport throws, init failure,
   * redactor throw, sanitizer-limit clamp). Fires at most once per
   * failing transport per session.
   */
  onInternalError?: (err: Error) => void;
}

/**
 * One parsed call-site of a normalized error stack (Feature 017). All fields
 * optional. Frames ride in `attributes['safesignal.stack']` so the pipeline
 * scrubs/bounds them like any attribute.
 */
export interface StackFrame {
  function?: string;
  /** File path or URL; URL query/fragment params are scrubbed by the pipeline. */
  file?: string;
  line?: number;
  column?: number;
  /** Original source position when source-map-resolved. */
  original?: { file?: string; line?: number; column?: number; name?: string };
}

/**
 * Maps a raw `error.stack` string to trimmed structured frames, or `null` when
 * nothing parses (the raw stack stands). Synchronous. Produced by the `./stacks`
 * subpath's `createStackNormalizer`; configured once via `LoggerConfig.normalizeStack`.
 */
export type StackNormalizer = (stack: string) => StackFrame[] | null;

/**
 * Options for opt-in **error breadcrumbs** (Feature 016). Enable via
 * `LoggerConfig.breadcrumbs`. Off by default.
 */
export interface BreadcrumbsOptions {
  /**
   * Ring-buffer capacity — how many recent events an error log carries.
   * Default `20`; clamped to `[1, 100]` (one `onInternalError` notice on clamp).
   */
  maxEvents?: number;
}

/**
 * Options for `createLogger()` — layered on top of the root `LoggerConfig`.
 */
export interface CreateLoggerOptions {
  /** Optional free-form logger name for diagnostics. Not part of the event. */
  name?: string;
  /** Override `module` identity for this logger only (federated modules). */
  module?: ModuleIdentity;
  /** Additional static context for this logger. Merged with root context. */
  context?: Partial<LogContext>;
  /** Per-logger level override. Wins over root config and env defaults. */
  level?: LogLevel;
}

// ---------------------------------------------------------------------------
// The consumer-facing logger
// ---------------------------------------------------------------------------

/**
 * The consumer-facing logger. Every method returns synchronously and never
 * throws. The only `unknown` parameter in the public surface is the
 * optional `error` arg of `error()`; the pipeline immediately reduces it
 * to `ErrorInfo`.
 */
export interface Logger {
  debug(message: string, attributes?: Attributes): void;
  info(message: string, attributes?: Attributes): void;
  warn(message: string, attributes?: Attributes): void;
  error(message: string, attributes?: Attributes, error?: unknown): void;

  /** Return a derived logger with additional context layered on top. */
  child(context: Partial<LogContext>): Logger;
  /** Alias for `child()`. */
  withContext(context: Partial<LogContext>): Logger;
}
