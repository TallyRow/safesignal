/**
 * Outbound W3C `traceparent` header injection for the `./transport-otlp`
 * delivery path (Feature 009).
 *
 * When `injectTraceparent` is enabled, a delivery request whose batch all
 * belongs to ONE valid trace gets a standard W3C `traceparent` (and, when
 * uniform, `tracestate`) request header so the ingest request is joinable to
 * its trace. SafeSignal is **carry-only**: this reads the already-normalized
 * `event.context.trace` (Feature 008 validates it once per emit, before any
 * transport sees the event) and never mints ids.
 *
 * Policy (homogeneous-only, fail-closed — contracts TI-3..TI-6, research D3/D4):
 *   - Per-event key = `none` when `context.trace` is absent OR structurally
 *     invalid (defensive guard for events that reach the transport without
 *     passing emit-time normalization), else the full `traceparent` string
 *     (so differing flags ⇒ differing keys ⇒ not homogeneous).
 *   - Inject `traceparent` iff the batch is non-empty AND every key is the
 *     same non-`none` value. Empty / trace-less / heterogeneous ⇒ no header.
 *   - Inject `tracestate` iff `traceparent` is injected AND every event shares
 *     the same defined `traceState` within `MAX_TRACESTATE_LEN`; else omit it
 *     while keeping `traceparent` (optional part dropped, valid ids kept).
 *   - Consumer `options.headers` win on any collision (spread last), so the
 *     injected header can never overwrite/expose an auth/secret value.
 *
 * Boundary discipline (TO-7): the only import is a **type-only** import from
 * `../api/types.js`. No `../trace/`, no `@opentelemetry/*`. Pure; never throws.
 *
 * Specs: `specs/009-traceparent-injection/contracts/traceparent-injection.md`.
 */

import type { LogEvent, TraceContext } from '../api/types.js';

/** Max `tracestate` length (W3C caps the header at 512 chars), mirrored here. */
const MAX_TRACESTATE_LEN = 512;

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const ALL_ZERO_TRACE_ID = '0'.repeat(32);
const ALL_ZERO_SPAN_ID = '0'.repeat(16);

/** Outcome of evaluating one delivery batch. */
export type BatchTraceparentDecision =
  | { inject: false }
  | { inject: true; traceparent: string; tracestate?: string };

interface ResolvedTrace {
  /** `'none'`, or the `traceparent` string (which also uniquely keys the trace). */
  readonly key: string;
  /** The `traceparent` string when valid, else `null`. */
  readonly traceparent: string | null;
  /** A bounded, non-empty `traceState`, else `null`. */
  readonly traceState: string | null;
}

const NONE: ResolvedTrace = {
  key: 'none',
  traceparent: null,
  traceState: null,
};

function hasValidIds(trace: TraceContext): boolean {
  return (
    typeof trace.traceId === 'string' &&
    TRACE_ID_RE.test(trace.traceId) &&
    trace.traceId !== ALL_ZERO_TRACE_ID &&
    typeof trace.spanId === 'string' &&
    SPAN_ID_RE.test(trace.spanId) &&
    trace.spanId !== ALL_ZERO_SPAN_ID
  );
}

function flagsHex(traceFlags: number | undefined): string {
  const n =
    typeof traceFlags === 'number' &&
    Number.isInteger(traceFlags) &&
    traceFlags >= 0 &&
    traceFlags <= 255
      ? traceFlags
      : 0;
  return n.toString(16).padStart(2, '0');
}

function resolve(event: LogEvent): ResolvedTrace {
  const trace = event.context.trace;
  if (trace === undefined || !hasValidIds(trace)) {
    return NONE;
  }
  const traceparent = `00-${trace.traceId}-${trace.spanId}-${flagsHex(
    trace.traceFlags,
  )}`;
  const traceState =
    typeof trace.traceState === 'string' &&
    trace.traceState.length > 0 &&
    trace.traceState.length <= MAX_TRACESTATE_LEN
      ? trace.traceState
      : null;
  return { key: traceparent, traceparent, traceState };
}

/**
 * Decide whether a delivery batch warrants a `traceparent`/`tracestate`
 * header. Pure; never throws.
 */
export function decideBatchTraceparent(
  events: ReadonlyArray<LogEvent>,
): BatchTraceparentDecision {
  if (events.length === 0) {
    return { inject: false };
  }
  const first = resolve(events[0] as LogEvent);
  if (first.key === 'none') {
    return { inject: false };
  }

  let tracestateUniform = true;
  for (let i = 1; i < events.length; i += 1) {
    const r = resolve(events[i] as LogEvent);
    if (r.key !== first.key) {
      return { inject: false }; // heterogeneous (or one is `none`)
    }
    if (r.traceState !== first.traceState) {
      tracestateUniform = false;
    }
  }

  const traceparent = first.traceparent as string;
  if (tracestateUniform && first.traceState !== null) {
    return { inject: true, traceparent, tracestate: first.traceState };
  }
  return { inject: true, traceparent };
}

/**
 * Build the per-request header map. When injection is disabled or the batch is
 * not homogeneous, returns the SAME `base` reference (no allocation,
 * byte-identical request). Otherwise returns a new map with `traceparent`
 * (and `tracestate`) UNDER the consumer `base` headers, so `base` always wins
 * on collision (TI-6). Never mutates `base`; never throws.
 */
export function buildRequestHeaders(
  base: Readonly<Record<string, string>>,
  events: ReadonlyArray<LogEvent>,
  enabled: boolean,
): Readonly<Record<string, string>> {
  if (!enabled) {
    return base;
  }
  const decision = decideBatchTraceparent(events);
  if (!decision.inject) {
    return base;
  }
  const injected: Record<string, string> = {
    traceparent: decision.traceparent,
  };
  if (decision.tracestate !== undefined) {
    injected.tracestate = decision.tracestate;
  }
  return { ...injected, ...base };
}
