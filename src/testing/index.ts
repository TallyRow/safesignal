/**
 * Test-only entrypoint, reachable ONLY via the `./testing` subpath of the
 * package's `exports` map. Helpers here are intended for consumer test
 * suites — they MUST NOT be imported by runtime code.
 *
 * As task T025 lands, this file will re-export:
 *   - assertTransportContract  — runs the documented Transport contract battery
 *                                against any user-provided Transport
 *                                (T-1..T-S5 from contracts/transport.md)
 *   - makeSecretFixture        — stable bag of password/JWT/bearer/session/
 *                                cookie/credit-card-shaped values for use in
 *                                consumer redaction tests
 *
 * This module MUST NOT re-export anything from the runtime entrypoint
 * (`src/index.ts`); helpers may import from internal paths only where
 * absolutely required to verify the package's own contracts.
 */
export {};
