/**
 * Pure W3C `traceparent` parser — the one ergonomic affordance for the common
 * case where a host holds the header string (e.g. SSR-injected) rather than a
 * pre-parsed object.
 *
 * Format: `version-traceId-spanId-flags` =
 *   `00-<32hex>-<16hex>-<2hex>`. Version `00` is the current spec; for forward
 * compatibility, any 2-hex version is accepted and only the four known fields
 * are read (extra trailing fields are ignored).
 *
 * The parsed candidate is run through `normalizeTraceContext`, so the result is
 * always a valid `TraceContext` or `undefined`. NEVER throws.
 *
 * Specs: `specs/008-trace-context/contracts/trace-context.md` TC-5;
 * `research.md` D2.
 */

import type { TraceContext } from '../api/types.js';

import { normalizeTraceContext } from './validate.js';

const VERSION_RE = /^[0-9a-f]{2}$/;

/**
 * Parse a W3C `traceparent` string (and optional `tracestate`) into a validated
 * `TraceContext`, or `undefined` on any shape violation. Pure; never throws.
 */
export function parseTraceparent(
  traceparent: string,
  tracestate?: string,
): TraceContext | undefined {
  if (typeof traceparent !== 'string') return undefined;

  const parts = traceparent.trim().split('-');
  if (parts.length < 4) return undefined;

  const [version, traceId, spanId, flagsHex] = parts;
  if (version === undefined || !VERSION_RE.test(version)) return undefined;
  // Version ff is explicitly invalid per the W3C spec.
  if (version === 'ff') return undefined;
  if (flagsHex === undefined || !/^[0-9a-f]{2}$/.test(flagsHex)) {
    return undefined;
  }

  const traceFlags = Number.parseInt(flagsHex, 16);

  // normalizeTraceContext does the id/hex/non-zero + bound checks and returns
  // undefined if traceId/spanId are not well-formed.
  return normalizeTraceContext({
    traceId,
    spanId,
    traceFlags,
    ...(typeof tracestate === 'string' ? { traceState: tracestate } : {}),
  });
}
