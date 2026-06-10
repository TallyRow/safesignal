/**
 * Low-level delivery primitives for the beacon transport.
 *
 * The functions here are deliberately small and composable. The
 * `beacon-transport.ts` factory (T016) wires them into the per-event
 * delivery policy defined in `contracts/delivery.md` D-3..D-7:
 *
 *   1. Compute `payload = JSON.stringify(event)`.
 *   2. If `getPayloadByteLength(payload) > BEACON_SIZE_LIMIT_BYTES`:
 *      drop the event and fire `oversized_event` (F-2).
 *   3. `tryBeacon(endpoint, payload)`. On `true`, done.
 *   4. `await tryFetchKeepalive(endpoint, payload)`. On `true`, done.
 *      On `false`, drop with `transport_send_failed` (F-4). On reject,
 *      drop with `transport_send_failed` carrying `.cause` (F-7).
 *
 * Boundary discipline (TB-11): zero imports from `src/internal/**`,
 * `src/runtime/**`, `src/pipeline/**`, `src/config/**`, `src/context/**`,
 * or `src/transport/**`. Zero vendor-SDK imports.
 *
 * Specs: `specs/002-beacon-transport/contracts/delivery.md` D-2..D-7;
 * `specs/002-beacon-transport/research.md` §1, §2.
 */

/**
 * The effective per-call `navigator.sendBeacon` size budget. ~64 KiB
 * per origin in modern browsers (research §1). Bodies whose serialized
 * byte length exceeds this constant short-circuit to `oversized_event`
 * without invoking either primitive — the fetch keepalive fallback
 * shares the same budget (research §2) so attempting it would waste a
 * network call on a guaranteed-failure payload.
 */
export const BEACON_SIZE_LIMIT_BYTES = 65536;

/**
 * Return the UTF-8 byte length of `payload`. Uses `TextEncoder` because
 * `payload.length` is UTF-16 code-unit count, not byte count — and
 * `sendBeacon`'s budget is measured in bytes.
 *
 * `TextEncoder` is baseline-available in every modern browser this
 * package targets; it is the only ambient API the transport touches at
 * the delivery layer.
 */
export function getPayloadByteLength(payload: string): number {
  return new TextEncoder().encode(payload).length;
}

/**
 * Attempt delivery via `navigator.sendBeacon(endpoint, blob)` where
 * `blob` is `new Blob([payload], { type: 'application/json' })`. The
 * `Blob` form is required so the browser sends the body as
 * `application/json` and so the request is unambiguously body-only
 * (T-S1..T-S5).
 *
 * Returns:
 *   - `true`  — the browser accepted the payload onto the beacon queue.
 *   - `false` — the browser refused (size limit / queue full / etc.),
 *               `navigator.sendBeacon` is unavailable, OR a synchronous
 *               throw was caught internally. Either way the caller
 *               should fall through to `tryFetchKeepalive`.
 *
 * Never throws. Never returns a Promise.
 */
export function tryBeacon(endpoint: string, payload: string): boolean {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav === undefined || typeof nav.sendBeacon !== 'function') {
    return false;
  }
  try {
    const blob = new Blob([payload], { type: 'application/json' });
    return nav.sendBeacon(endpoint, blob);
  } catch {
    // Some legacy environments throw on oversized sendBeacon payloads
    // instead of returning false. Treat as "refused" so the caller
    // falls through; the same caller's size pre-check already short-
    // circuited the oversized case for modern runtimes.
    return false;
  }
}

/**
 * Attempt delivery via `fetch(endpoint, { method: 'POST', body: payload,
 * keepalive: true, headers: { 'content-type': 'application/json' },
 * credentials: 'same-origin' })`.
 *
 * Resolves:
 *   - `true`  — `fetch` resolved with `response.ok` (status in
 *               `[200, 299]`).
 *   - `false` — `fetch` is unavailable in the runtime, OR `fetch`
 *               resolved with a non-2xx status.
 *
 * Rejects:
 *   - With the underlying `fetch` rejection reason if the Promise
 *     rejected (network error, browser-enforced budget overflow, etc.).
 *     The caller wraps this in a `BeaconError(transport_send_failed)`
 *     carrying `.cause` per F-7.
 *
 * The `credentials: 'same-origin'` choice keeps cookies from leaking
 * cross-origin by default (Principle V). Consumers who need credentialed
 * delivery to a same-origin endpoint inherit the correct behaviour
 * automatically; cross-origin endpoints get no cookies, which is the
 * safer default.
 */
export async function tryFetchKeepalive(
  endpoint: string,
  payload: string,
): Promise<boolean> {
  const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchFn !== 'function') {
    return false;
  }
  const response = await fetchFn(endpoint, {
    method: 'POST',
    body: payload,
    headers: { 'content-type': 'application/json' },
    keepalive: true,
    credentials: 'same-origin',
  });
  return response.ok;
}
