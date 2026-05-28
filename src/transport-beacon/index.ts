/**
 * Public entry of the `./transport-beacon` subpath
 * (`@your-org/frontend-logging-sdk/transport-beacon`).
 *
 * Exposes exactly two names — `createBeaconTransport` (factory) and
 * `BeaconTransportOptions` (options shape) — and nothing else. Locked
 * by TB-1 in
 * `specs/002-beacon-transport/contracts/transport-beacon-public-api.md`.
 *
 * T017 wires this entry to the real factory in `./beacon-transport.js`
 * landed by T016. The TB-1 reflection test verifies that
 * `Object.keys(import('./transport-beacon'))` is exactly
 * `['createBeaconTransport']` at runtime (`BeaconTransportOptions`
 * is a type-only export and erases).
 *
 * Boundary discipline (TB-11): the only `src/` import permitted in
 * this subpath is `import type` from `'../api/types.js'`, used by
 * `beacon-transport.ts` for the `LogEvent` / `Transport` types.
 * This file re-exports from `./beacon-transport.js` — an intra-
 * subpath relative import, also permitted.
 */

export {
  createBeaconTransport,
  type BeaconTransportOptions,
} from './beacon-transport.js';
