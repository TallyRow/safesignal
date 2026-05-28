# US3 Review Boundary — Acceptance Verification

**Story**: User Story 3 — Opt-in micro-batching surfaces every drop
through the diagnostic hook (Priority: P3)

**Date**: 2026-05-28

**Acceptance gate**: T029a — confirm SC-003 (batching
`assertTransportContract` passes), SC-009 (one drop notice per forced
batch drop), SC-010 (reconfigure during in-flight batch drives drain
OR one drop notice — never both, never neither). B-1..B-12, F-2 batch
path, F-5, F-8 all pass. Order preservation across 1,000 events
asserted. No regression in US1 / US2.

## Behavioral contracts verified

### B-N (Batching — `contracts/batching.md`)

| ID    | Status | Locked in                                                                                |
|-------|--------|------------------------------------------------------------------------------------------|
| B-1   | ✓ PASS | TB-7 batching test in `tests/contract/transport-beacon.contract.test.ts` — opt-in via constructor flag |
| B-2   | ✓ PASS | `tests/integration/transport-beacon-batching.integration.test.ts` — envelope is exactly `{ events: LogEvent[] }` |
| B-3a  | ✓ PASS | Same file — size-threshold flush                                                          |
| B-3b  | ✓ PASS | Same file — pagehide-fired flush                                                          |
| B-4   | ✓ PASS | Same file — order preserved across 1,000 events; `tests/integration/transport-beacon-quickstart-batching.integration.test.ts` also verifies 50-event order |
| B-5a..d | ✓ PASS | `tests/unit/transport-beacon/batcher.test.ts` — N < maxBatchSize no-flush; threshold-meeting push flushes synchronously; buffer cleared BEFORE callback (re-entrant push lands in fresh batch); flush failure does not re-push |
| B-6   | ✓ PASS | Integration file — oversized envelope (`maxBatchSize × per-event-size > 64 KiB`) → `beacon_batch_drop` |
| B-7   | ✓ PASS | Integration file — oversized single event ejected from batch with one `oversized_event` notice; remaining batch flushes normally |
| B-8a..c | ✓ PASS | Batcher unit file — timer armed once when first event enters empty batch; cleared at flush; subsequent push re-arms; firing triggers flush of current buffer |
| B-9   | ✓ PASS | Integration file — pagehide-fired flush failure emits exactly one `beacon_batch_drop` notice |
| B-10  | ✓ PASS | Integration file — shutdown with non-empty buffer + flush failure: one drop notice + listener removed |
| B-11  | ✓ PASS | Integration file — drop notice payload contains `droppedCount` + transport name + reason, but ZERO event content (string-scan against `SECRET_MESSAGE` / `top-secret-value`) |
| B-12  | ✓ PASS | Integration file — `flush()` synchronizes against current batch only; no-op on empty buffer |

### F-N (Failure modes — batching-specific subset)

| ID   | Status | Locked in                                                              |
|------|--------|-------------------------------------------------------------------------|
| F-2 (batch eject path) | ✓ PASS | Integration file — oversized single event ejected with rate-limited notice; remaining batch unaffected |
| F-5  | ✓ PASS | Integration file — `beacon_batch_drop` fires for every failure flavor (sendBeacon refused + fetch reject; envelope > 64 KiB; pagehide flush failure; shutdown flush failure) |
| F-8 (batching variant) | ✓ PASS | Integration file — rate-limit per code per transport per session: 6 failing batches → ONE `beacon_batch_drop` notice |

> Default-mode failure modes (F-1, F-3, F-4, F-6, F-7) were locked at
> the US1 review boundary; T028 wiring preserved them as verified by
> the no-regression check below.

## Success Criteria (US3-relevant subset)

| SC     | Description                                                  | Status | Locked in                                                          |
|--------|--------------------------------------------------------------|--------|---------------------------------------------------------------------|
| SC-003 | 100% of `assertTransportContract` (T-1..T-9 + T-S1..T-S5) pass against the batching-mode transport | ✓ PASS | TB-7 batching variant in `tests/contract/transport-beacon.contract.test.ts` — full battery passes with outer hermetic doubles |
| SC-009 | Exactly one `onInternalError` notice per dropped batch       | ✓ PASS | Integration file B-9, B-10, F-8 — single notice per drop scenario; rate-limit isolates per session per transport |
| SC-010 | `configureLogging()` swap during pending batch drives drain OR exactly one drop notice — never both, never neither, never partial | ✓ PASS | Integration file `SC-010` test — assertion `drainDelivered !== dropNotice === true` |

## Examples + docs updated

| Artifact | Change | Verification |
|----------|--------|--------------|
| `docs/safe-logging.md` | New top-level "Beacon transport batching (opt-in)" section between transport-security and federated-ownership sections. Covers envelope, when-to-enable, sizing rule, drop-notice routing, lifecycle, anti-patterns. | (manual — no test gate) |
| `tests/integration/transport-beacon-quickstart-batching.integration.test.ts` | New scripted harness: drift guard on quickstart's "Opt-in batching" code block + runtime smoke (50 events → 1 batched flush) + partial-batch assertion. | `npm run test` ✓ |

## Test suite state at gate

- **48 test files**, +1 from US2 (the new quickstart-batching integration file)
- **1079 tests pass** (+27 from US2: T024 = 8, T025 = 12, TB-7 batching = 1, quickstart-batching = 3, plus batching-mode source-import boundary scans)
- **0 skipped**
- **10 todo** — pre-existing from feature 001 (out of US3 scope)
- **0 fail, 0 unhandled errors**

## Bundle invariants

- `dist/transport-beacon.mjs` — **3101 B gzipped** (60% under SC-008's 5120 B budget); full implementation including batcher
- `dist/index.mjs` — **8162 B gzipped** (unchanged; SC-007 holds; bundle-shape test confirms no beacon-source identifiers leak into the default entry)

## Constitution v1.2.0 — US3 traceability

| Principle | Status against US3 implementation                                                |
|-----------|----------------------------------------------------------------------------------|
| I. Stable Consumer API | No surface change — `BeaconTransportOptions.batching` was always part of the type (T016 validated it). Batching is **opt-in via an explicit constructor flag**; default behavior unchanged. |
| II. Browser Resilience | All batching code paths swallow throws — `dispatchBatch` try/catches the envelope encode; the batcher's flush callback try/catches the consumer-provided flush; the consumer's `onInternalError` is wrapped in try/catch. Async drop paths (timer-fired flush, pagehide flush, fetch reject) route through the same `notifyBatchDrop` channel. |
| III. Framework-Neutral Structured Observability | Wire body remains a JSON-encoded `LogEvent` (default mode) or `{ events: LogEvent[] }` envelope (batch mode). No vendor data model; bounded shape inherited from the pipeline. |
| IV. Secure & Privacy-Safe Logging by Default | Drop-notice payloads carry only structural metadata (droppedCount, reason summary, transport name) — never event content (B-11 verified by string-scan against fixture values). |
| V. Testable, Minimal, Maintainable | Batcher state machine isolated in its own module (`src/transport-beacon/batcher.ts`, 90 lines). T024's 8 unit tests fully exercise it. Integration tests verify composition. |
| VI. Log Integrity & Monitoring Suitability | No silent reorder/dedup/transform. Order preservation verified at 1,000-event scale (B-4). Every drop fires `beacon_batch_drop` with documented `BeaconErrorCode`. SC-010 reconfigure scenario explicitly verifies drain-or-notice — never both, never neither. |
| VII. Lightweight Logger & Federated Runtime | Construction is still side-effect-free (T014 SC-006 sweep re-verified with batching options — 1,000 transports → zero listeners / timers / network calls). The batcher's one-shot timer is armed only on FIRST event entering an empty batch, lazily, post-construction. |

## Verdict

**US3 ACCEPTED.** Opt-in micro-batching is feature-complete:
- Every documented contract ID (B-1..B-12, F-2/F-5/F-8 batching paths) passes
- Drop notices are structural-only, rate-limited per session, and consistently routed through `BeaconTransportOptions.onInternalError`
- Order preservation holds at 1,000-event scale
- The SC-010 reconfigure-during-in-flight-batch scenario from the `/speckit-analyze` C1 fix is locked end-to-end
- Bundle stays well under SC-008's 5120 B budget (3101 B gzipped)
- Constitution v1.2.0 all 7 principles preserved

**Phase 5 (US3) complete.** Next phase: Polish & Cross-Cutting Concerns
(T030–T037). Remaining work:
- T030 dependency-pins audit extension
- T031 remove `examples/shared/beacon-transport.ts`
- T032 docs/safe-logging.md beacon-transport section (already added by T029 batching subsection — T032 covers the broader transport overview)
- T033 README quickstart update
- T034 final secret-sweep regression
- T035 final lightweight-construction regression
- T036 final bundle-shape regression
- T037 final review boundary (Constitution v1.2.0 + SC-001..SC-012)
