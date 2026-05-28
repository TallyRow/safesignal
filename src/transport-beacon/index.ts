/**
 * `./transport-beacon` subpath entry — placeholder for T001 plumbing.
 *
 * This file is intentionally empty at T001. T003 will replace its
 * contents with a real `createBeaconTransport` factory stub
 * (`throw new Error('not implemented')`) and the
 * `BeaconTransportOptions` interface so the contract-test scaffolding
 * can compile against the subpath. T016 then wires the real
 * default-mode implementation.
 *
 * The empty `export {}` makes this file a valid ES module so
 * `npm run build` (tsup) can emit `dist/transport-beacon.{mjs,cjs,d.ts}`
 * without an entry-point error during T001.
 */

export {};
