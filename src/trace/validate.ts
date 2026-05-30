/**
 * Fail-closed validation/normalization of W3C Trace Context.
 *
 * `normalizeTraceContext` is the single point where supplied trace context —
 * whether handed in directly as `context.trace` or produced by
 * `parseTraceparent` — is checked against W3C rules. It is called once per
 * emit during context resolution, before sanitize/redact.
 *
 * Policy (require both ids; contract TC-4, research D4):
 *   - `traceId`  MUST be 32 lowercase-hex, not all-zero.
 *   - `spanId`   MUST be 16 lowercase-hex, not all-zero.
 *   - If either id is invalid, the WHOLE trace is dropped (returns
 *     `undefined`) — a real W3C `traceparent` always carries both, so partial
 *     validity is a malformed-input artifact, and a half-correlated record is
 *     misleading (Principle VI).
 *   - `traceFlags` is kept only as an integer in [0, 255], else omitted.
 *   - `traceState` is kept only as a string within `MAX_TRACESTATE_LEN`, else
 *     omitted.
 *
 * Pure and side-effect-free; NEVER throws.
 *
 * Specs: `specs/008-trace-context/contracts/trace-context.md` TC-4;
 * `data-model.md`.
 */

import type { TraceContext } from '../api/types.js';

/** Max `tracestate` length (W3C caps the header at 512 chars). */
export const MAX_TRACESTATE_LEN = 512;

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const ALL_ZERO_TRACE_ID = '0'.repeat(32);
const ALL_ZERO_SPAN_ID = '0'.repeat(16);

function isValidTraceId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    TRACE_ID_RE.test(value) &&
    value !== ALL_ZERO_TRACE_ID
  );
}

function isValidSpanId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SPAN_ID_RE.test(value) &&
    value !== ALL_ZERO_SPAN_ID
  );
}

/**
 * Validate + normalize an arbitrary candidate into a `TraceContext`, or return
 * `undefined` when the ids are absent/invalid. Optional parts that are invalid
 * are individually omitted while valid ids are kept.
 */
export function normalizeTraceContext(
  candidate: unknown,
): TraceContext | undefined {
  if (typeof candidate !== 'object' || candidate === null) {
    return undefined;
  }
  const c = candidate as {
    traceId?: unknown;
    spanId?: unknown;
    traceFlags?: unknown;
    traceState?: unknown;
  };

  if (!isValidTraceId(c.traceId) || !isValidSpanId(c.spanId)) {
    return undefined; // require both ids — drop the whole trace fail-closed
  }

  const trace: TraceContext = { traceId: c.traceId, spanId: c.spanId };

  if (
    typeof c.traceFlags === 'number' &&
    Number.isInteger(c.traceFlags) &&
    c.traceFlags >= 0 &&
    c.traceFlags <= 255
  ) {
    trace.traceFlags = c.traceFlags;
  }

  if (
    typeof c.traceState === 'string' &&
    c.traceState.length > 0 &&
    c.traceState.length <= MAX_TRACESTATE_LEN
  ) {
    trace.traceState = c.traceState;
  }

  return trace;
}
