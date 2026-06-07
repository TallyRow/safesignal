/**
 * Public entry of the `./transport-otlp` subpath
 * (`@tallyrow/safesignal/transport-otlp`).
 *
 * Exposes exactly two names — `createOtlpTransport` (factory) and
 * `OtlpTransportOptions` (options shape, type-only) — and nothing else.
 * Locked by TO-1 in
 * `specs/007-transport-otlp/contracts/transport-otlp-public-api.md`.
 *
 * Boundary discipline (TO-7): the only `src/` import permitted anywhere
 * under `src/transport-otlp/**` is a **type-only** import from
 * `'../api/types.js'`. No `@opentelemetry/*` import and no import from
 * `../internal/telemetry/otel/` — the OTLP/HTTP+JSON payload is
 * hand-serialized with zero runtime dependencies (research D1).
 */

export type { OtlpEncoding } from './otlp-serializer.js';

export {
  createOtlpTransport,
  type OtlpTransportOptions,
} from './otlp-transport.js';
