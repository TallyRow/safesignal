# US1 Review Boundary — Acceptance Verification

**Story**: User Story 1 — Host application configures HTTPS delivery
without writing transport plumbing (Priority: P1) 🎯 MVP

**Date**: 2026-05-27

**Acceptance gate**: T019a — confirm TB-1..TB-12 (excluding TB-7
batching variant), D-1..D-12, F-1..F-4, F-7 all pass against the
implementation. SC-001, SC-002, SC-004, SC-006, SC-007, SC-008
verified.

## Contract assertions

### TB-N (Public API — `contracts/transport-beacon-public-api.md`)

| ID    | Status | Locked in                                                                                 |
|-------|--------|--------------------------------------------------------------------------------------------|
| TB-1  | ✓ PASS | `tests/contract/transport-beacon.contract.test.ts` — subpath exports exactly 2 names      |
| TB-2  | ✓ PASS | Same file — default-entry surface bit-identical to v1 + does not re-export the new symbols |
| TB-3  | ✓ PASS | Same file — returned `Transport`-shaped object, prototype === Object.prototype             |
| TB-4  | ✓ PASS | `tests/performance/transport-beacon-construction.performance.test.ts` — 1,000-instance sweep |
| TB-5  | ✓ PASS | `tests/unit/transport-beacon/endpoint-validation.test.ts` — endpoint-validation matrix     |
| TB-6  | ✓ PASS | Same file — options-shape validation                                                       |
| TB-7  | ✓ PASS (default-mode) / ⏳ skipped (batching, unskips at T026) | `tests/contract/transport-beacon.contract.test.ts` — assertTransportContract from `./testing` |
| TB-8  | ✓ PASS | Same file — `name` field defaults to `'beacon'`, overridable via options                   |
| TB-9  | ✓ PASS | Same file — two instances install independent listeners; rate-limits don't cross-contaminate |
| TB-10 | ✓ PASS | Same file — synchronous factory + synchronous `send()`                                     |
| TB-11 | ✓ PASS | `tests/security/transport-beacon-bundle-shape.security.test.ts` — source-import boundary + bundle vendor-neutrality + default-entry isolation |
| TB-12 | ✓ PASS | Same contract file — `package.json` exports map gains exactly `./transport-beacon` with `types`/`import`/`require` triple; no new deps |

### D-N (Delivery — `contracts/delivery.md`)

| ID   | Status | Locked in                                                                |
|------|--------|---------------------------------------------------------------------------|
| D-1  | ✓ PASS | `tests/contract/transport-beacon.contract.test.ts` — TB-10 send returns void synchronously |
| D-2  | ✓ PASS | `tests/unit/transport-beacon/delivery.test.ts` — payload === JSON.stringify(event) |
| D-3  | ✓ PASS | Same file — size check precedes primitive call                            |
| D-4  | ✓ PASS | Same file — sendBeacon called with Blob('application/json')               |
| D-5  | ✓ PASS | Same file — fetch fallback call shape (POST + keepalive + headers + credentials) |
| D-6  | ✓ PASS | Same file — at most one primitive call; sendBeacon true → no fetch        |
| D-7  | ✓ PASS | Same file — both primitives undefined → beacon_unavailable                |
| D-8  | ✓ PASS | `tests/security/transport-beacon-secret-sweep.security.test.ts` — recorded URL == endpoint exactly |
| D-9  | ✓ PASS | Structural — no public API mutates endpoint (verified by TB-1 surface lock) |
| D-10 | ✓ PASS | `tests/unit/transport-beacon/lifecycle.test.ts` — lazy install, gated, removed on shutdown |
| D-11 | ✓ PASS | `tests/contract/transport-beacon.contract.test.ts` — default-mode flush is a no-op |
| D-12 | ✓ PASS | `tests/unit/transport-beacon/lifecycle.test.ts` — shutdown idempotent, send-after-shutdown no-op |

### F-N (Failure modes — `contracts/failure-modes.md`)

| ID   | Status | Locked in                                                                |
|------|--------|---------------------------------------------------------------------------|
| F-1  | ✓ PASS | `tests/unit/transport-beacon/endpoint-validation.test.ts` — construction throws on every invalid shape |
| F-2  | ✓ PASS | `tests/unit/transport-beacon/delivery.test.ts` — oversized_event with rate-limit |
| F-3  | ✓ PASS | Same file — beacon_unavailable when sendBeacon + fetch both undefined     |
| F-4  | ✓ PASS | Same file — transport_send_failed when sendBeacon false + fetch rejects/non-2xx |
| F-7  | ✓ PASS | Same file — fetch rejection cause preserved via `Error.cause`             |

> Out of US1 scope (covered by US3): F-5 (`beacon_batch_drop`), F-6
> (`transport_shutdown_failed`), F-8 batching-specific rate-limit,
> F-10 SafeTransport interaction with batching.

## Success Criteria (US1-relevant subset)

| ID     | Description                                                  | Status | Locked in                                                          |
|--------|--------------------------------------------------------------|--------|---------------------------------------------------------------------|
| SC-001 | New consumer can configure HTTPS delivery in ≤5 minutes      | ✓ PASS | `tests/integration/transport-beacon-quickstart.integration.test.ts` — drift guard + scripted runtime smoke |
| SC-002 | 100% of `assertTransportContract` assertions pass (default)  | ✓ PASS | TB-7 default block — full T-1..T-9 + T-S1..T-S5 battery passes      |
| SC-004 | End-to-end secret sweep emits 100+ events; zero fixture leak | ✓ PASS | `tests/security/transport-beacon-secret-sweep.security.test.ts` — 4 cases, full FIXTURE_VALUES scan against body + URL |
| SC-006 | Constructing 1,000 transports: zero listeners / timers / network / ambient reads | ✓ PASS | `tests/performance/transport-beacon-construction.performance.test.ts` — 6 cases including batching-options variant |
| SC-007 | Default entry bundle bit-identical-or-smaller vs. pre-feature snapshot | ✓ PASS | `dist/index.mjs` = 8162 B gzipped (unchanged); bundle-shape test asserts no beacon-source fingerprints in default entry |
| SC-008 | New subpath ≤ 5 KiB (5120 B) gzipped                         | ✓ PASS | `dist/transport-beacon.mjs` = 2448 B gzipped — 52% under budget    |

## Test suite state at gate

- **44 test files**, including 6 new files for this feature
- **1049 tests pass**
- **1 skipped** — TB-7 batching variant (unskips at T026 in US3)
- **10 todo** — pre-existing from feature 001 (out of scope for US1)
- **0 fail**

## Constitution v1.2.0 — US1 traceability

| Principle | Status against US1 implementation                                                |
|-----------|----------------------------------------------------------------------------------|
| I. Stable Consumer API & Clear Boundaries | Default entry bit-identical (SC-007). New subpath the only path to beacon symbols (TB-2). Safe path is the easy path: HTTPS-only default, explicit opt-in for loopback, no header-injection API. |
| II. Browser-First Runtime Resilience | `send`/`flush`/`shutdown` never throw to caller (F-3..F-7 verified via the `transport_send_failed` async path). `SafeTransport` wraps the transport at `configureLogging()` time as defense-in-depth. |
| III. Framework-Neutral Structured Observability | JSON-encoded `LogEvent` body; no vendor data model; bounded shape inherited from pipeline. |
| IV. Secure & Privacy-Safe Logging by Default | HTTPS at construction; loopback opt-in only (`allowInsecureLoopback`); body-only delivery; `credentials: 'same-origin'`; no Authorization-header API. |
| V. Testable, Minimal, Maintainable | Dedicated test groups under `tests/contract/`, `tests/security/`, `tests/integration/`, `tests/unit/transport-beacon/`, `tests/performance/`. |
| VI. Log Integrity & Monitoring Suitability | Every drop fires `onInternalError` with a documented `BeaconErrorCode`; FS-12 rate-limit per code per transport per session; no silent reorder/dedup/mutate. |
| VII. Lightweight Logger Instances & Federated Runtime | 1,000-transport construction sweep verifies zero listeners / timers / network / ambient reads (SC-006). Multi-instance independence verified by TB-9. |

## Verdict

**US1 ACCEPTED.** All TB-N, D-N, F-1..F-4, F-7 contract IDs pass.
All US1-relevant SCs verified. No constitution violations. The MVP
is feature-complete: a host application can install
`@your-org/frontend-logging-sdk`, import `createBeaconTransport`
from `./transport-beacon`, pass an HTTPS endpoint, and ship structured
events over the wire — exactly the five-minute path documented in
`quickstart.md`.

**Next phase**: US2 (federated module composition, P2). T020–T023a.
