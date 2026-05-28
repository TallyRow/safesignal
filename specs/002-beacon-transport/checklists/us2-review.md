# US2 Review Boundary — Acceptance Verification

**Story**: User Story 2 — Federated modules share the host's beacon
transport without setup or interference (Priority: P2)

**Date**: 2026-05-27

**Acceptance gate**: T023a — confirm SC-005 (1,000 events delivered
with correct module attribution, no duplication, no loss), FR-024
(multi-instance coexistence with independent listeners), no second
listener installed when only the host transport is configured.

## Functional requirements verified

| FR    | Status | Locked in                                                              |
|-------|--------|------------------------------------------------------------------------|
| FR-023 | ✓ PASS | `tests/integration/transport-beacon-host-module.integration.test.ts` — "host + 50 module loggers" test asserts exactly 1,000 network calls, each module attributed correctly, no duplication, no loss |
| FR-024 | ✓ PASS | Same file — "two beacon transports against different endpoints" test asserts each instance installs its own pagehide listener with distinct handler references; per-instance rate-limit isolation verified by forced-drop scenario |

## Success Criteria (US2-relevant subset)

| SC     | Description                                                  | Status | Locked in                                                          |
|--------|--------------------------------------------------------------|--------|---------------------------------------------------------------------|
| SC-005 | 50 module loggers × 20 events = 1,000 network calls with correct module identity | ✓ PASS | T020 test in `tests/integration/transport-beacon-host-module.integration.test.ts` — 1,000 calls, perModuleCount.get(`mod-${i}`) === 20 for every i, no two byte-identical bodies |

## Multi-instance independence (TB-9 expansion)

The TB-9 contract is locked at two levels:
- **Unit-level** (`tests/contract/transport-beacon.contract.test.ts`): two factory invocations produce independent state.
- **Integration-level** (`tests/integration/transport-beacon-host-module.integration.test.ts`): two `createBeaconTransport` instances wired into one runtime via `configureLogging({ transports: [bt1, bt2] })` each:
  - install their own pagehide listener (2 registrations, distinct handler references)
  - receive every event the pipeline emits (`callsA.length === callsB.length === EVENT_COUNT`, `textsA === textsB` element-wise)
  - have their own rate-limit state — a forced drop on transport-A produces ONE notice on A's `onInternalError` and ONE notice on B's, each naming the correct `transportName`

## Examples updated

| Example | Change | Verification |
|---------|--------|--------------|
| `examples/host-app/index.ts` | New section (point 6) creates two synthetic module loggers via `createLogger({ module: {...} })` showing the host-side perspective of the federated pattern. | `npm run typecheck` ✓ |
| `examples/federated-module/index.ts` | Drops every reference to the soon-to-be-removed `examples/shared/beacon-transport.ts` (typecheck-only import + two anti-pattern code comments). Standalone-iteration block now imports `createBeaconTransport` from `@your-org/frontend-logging-sdk/transport-beacon` with the `allowInsecureLoopback` pattern. | `npm run typecheck` ✓ |
| `examples/federated-module/tsconfig.json` | Drops `"../shared/beacon-transport.ts"` from `include`. | (covered by typecheck above) |

## Test suite state at gate

- **45 test files**, +1 from US1 (the new host-module integration file)
- **1052 tests pass** (+3 from US1: T020's 1 test + T021's 2 tests)
- **1 skipped** — TB-7 batching variant (unskips at T026 in US3)
- **10 todo** — pre-existing from feature 001 (out of US2 scope)
- **0 fail**

## Constitution v1.2.0 — US2 traceability

| Principle | Status against US2 implementation                                                |
|-----------|----------------------------------------------------------------------------------|
| I. Stable Consumer API | No surface change beyond US1. Federated modules use `createLogger({ module })` — feature-001 API, unmodified. |
| II. Browser Resilience | Multi-instance forced-drop scenario verifies each transport's `onInternalError` handles async fetch rejection independently; no propagation to caller. |
| VII. Lightweight Logger & Federated Runtime | EXPLICITLY proven by SC-005 + the "exactly one pagehide listener across 1,000 emissions" assertion. 50 federated-module loggers do NOT compound listener / timer / network state on the shared transport. Each module's `createLogger({ module })` is a constant-cost handle allocation — feature 001's invariant carries through to this feature. |

## Verdict

**US2 ACCEPTED.** The federated module pattern works end-to-end:
- 50 module loggers can share a single beacon transport
- Each module's `context.module.name` reaches the wire correctly
- 1,000 events deliver with no duplication, no loss, no reordering at the transport boundary
- The host's pagehide listener is installed exactly once regardless of module count (FR-024)
- Two beacon transports against different endpoints coexist with full state independence

**Phase 4 (US2) complete.** Next phase: US3 (opt-in batching, P3). T024–T029a.
