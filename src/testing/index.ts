/**
 * Test-only entrypoint, reachable ONLY via the `./testing` subpath of the
 * package's `exports` map. Helpers here are intended for consumer test
 * suites — they MUST NOT be imported by runtime code.
 *
 * Exports:
 *   - assertTransportContract  — runs the documented Transport contract
 *                                battery against any user-provided
 *                                Transport (T-S1..T-S5 from
 *                                contracts/transport.md)
 *   - makeSecretFixture        — stable bag of password/JWT/bearer/
 *                                session/cookie/credit-card-shaped
 *                                values for redaction and leakage tests
 *   - FIXTURE_VALUES           — flat array of every fixture value, for
 *                                quick `.includes()` scans of captured
 *                                URLs or payloads
 */

export { assertTransportContract } from './assert-transport-contract.js';
export { FIXTURE_VALUES, makeSecretFixture } from './secret-fixtures.js';
