/**
 * Delivery primitive for the OTLP transport: POST the OTLP/HTTP+JSON body
 * via `fetch` with `keepalive: true` (research D6, TO-2).
 *
 * `navigator.sendBeacon` is deliberately NOT used — it cannot set the
 * custom auth + `Content-Type` headers OTLP backends require (FR-004).
 * `keepalive` preserves best-effort delivery during page unload.
 *
 * `deliver(...)` NEVER throws or rejects: every outcome (2xx, 2xx with an
 * OTLP partial-success rejection, non-2xx, network reject, missing
 * `fetch`) is reduced to a `DeliveryResult` for the caller to map onto a
 * rate-limited notice. There is no retry (research D7).
 *
 * Boundary discipline (TO-7): zero `src/` imports; zero vendor imports.
 *
 * Specs: `specs/007-transport-otlp/contracts/otlp-payload.md` OP-1;
 * `contracts/transport-otlp-public-api.md` TO-2/TO-4.
 */

/** Outcome of a single delivery attempt. Never an exception. */
export type DeliveryResult =
  | { kind: 'delivered' }
  | { kind: 'unavailable' }
  | { kind: 'send_failed'; detail: string; cause?: unknown }
  | { kind: 'partial_rejection'; rejected: number };

/**
 * POST `body` to `endpoint` with `keepalive: true`, merging the caller's
 * static `headers` (e.g. auth) over the mandatory `content-type`.
 * `credentials: 'same-origin'` keeps cookies from leaking cross-origin by
 * default (Principle V); auth travels only in the explicit headers.
 *
 * When `encoding` is `'protobuf'`, `Content-Type` is `application/x-protobuf`
 * and `body` is a `Uint8Array` — no JSON.parse validation is performed.
 */
export async function deliver(
  endpoint: string,
  headers: Readonly<Record<string, string>>,
  body: string | Uint8Array,
  encoding: 'json' | 'protobuf' = 'json',
): Promise<DeliveryResult> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchFn !== 'function') {
    return { kind: 'unavailable' };
  }

  const contentType =
    encoding === 'protobuf' ? 'application/x-protobuf' : 'application/json';

  let response: Response;
  try {
    response = await fetchFn(endpoint, {
      method: 'POST',
      body: body as BodyInit,
      headers: { 'content-type': contentType, ...headers },
      keepalive: true,
      credentials: 'same-origin',
    });
  } catch (cause) {
    return { kind: 'send_failed', detail: 'fetch rejected', cause };
  }

  if (!response.ok) {
    return { kind: 'send_failed', detail: `HTTP ${response.status}` };
  }

  // For protobuf encoding the response body is not JSON; skip validation.
  if (encoding === 'protobuf') {
    return { kind: 'delivered' };
  }

  // 2xx — check for an OTLP partial-success rejection in the body. A
  // missing / non-JSON / unexpected body is treated as full success.
  const rejected = await readRejectedCount(response);
  if (rejected > 0) {
    return { kind: 'partial_rejection', rejected };
  }
  return { kind: 'delivered' };
}

async function readRejectedCount(response: Response): Promise<number> {
  try {
    if (typeof response.json !== 'function') return 0;
    const parsed = (await response.json()) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return 0;
    const partial = (parsed as { partialSuccess?: unknown }).partialSuccess;
    if (typeof partial !== 'object' || partial === null) return 0;
    const raw = (partial as { rejectedLogRecords?: unknown })
      .rejectedLogRecords;
    // OTLP encodes int64 as a string in JSON, but tolerate a number too.
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    // A body that cannot be read/parsed does not turn a 2xx into a failure.
    return 0;
  }
}
