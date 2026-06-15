# Tasks: Opt-In Sampling / Rate-Limiting

**Input**: Design documents from `specs/022-sampling-rate-limiting/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅,
contracts/sampler-contract.md ✅, quickstart.md ✅

**Tests**: Tests are REQUIRED for this project. Every change that affects public API,
runtime behavior, failure handling, redaction, or environment-sensitive configuration
MUST include the appropriate contract, integration, and unit coverage.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story. US1 and US3 share P1 priority and
ship together — "no sampler without observability."

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US3)
- Include exact file paths in descriptions

## Path Conventions

This is a **package project**: `src/`, `tests/` at repository root.
Follow the existing structure: `src/sampler/` (new), `src/api/types.ts` (modified),
`src/config/config.ts` (modified), `src/runtime/configured-runtime.ts` (modified),
`src/index.ts` (modified).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the sampler source directory and verify zero new dependencies

- [ ] T001 Create `src/sampler/` directory structure per plan.md (add `.gitkeep`
  or initial empty barrel file)
- [ ] T002 Verify `npm ls --prod` shows no new dependencies introduced (samplers
  use only `Math.random()`, `performance.now()`, and existing internal utilities)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions and config normalization that ALL user stories depend on

**⚠️ CRITICAL**: No sampler implementation can begin until types and config
normalization exist

- [ ] T003 [P] Add `SamplerConfig` type to `src/api/types.ts`: `{ type: 'head' | 'rateLimit', rate: number, onDrop: (drop: DropNotification) => void, refillInterval?: number }`
- [ ] T004 [P] Add `DropNotification` type to `src/api/types.ts`: `{ level: LogLevel, message: string, timestamp: number, reason: 'head_sample' | 'rate_limited', samplerName: string }`
- [ ] T005 [P] Add `SamplerType` type alias to `src/api/types.ts`: `'head' | 'rateLimit'`
- [ ] T006 Add `sampling?: SamplerConfig` optional field to `LoggerConfig` interface in `src/api/types.ts`
- [ ] T007 Create `src/sampler/types.ts` with internal types (sampler constructor params, token bucket state shape) not exposed in public API
- [ ] T008 Add `normalizeSamplingConfig()` to `src/config/config.ts` — validates rate bounds (head: 0.0–1.0, rate-limit: ≥0), rejects if `onDrop` missing, clamps out-of-range values with `onInternalError` notice (matching existing sanitizer-limit clamp pattern). Returns `NormalizedSamplerConfig | undefined` (undefined when sampling not configured)
- [ ] T009 Add `NormalizedSamplerConfig` to `src/config/config.ts` alongside `NormalizedConfig`

**Checkpoint**: Types and config normalization ready — sampler implementation can now begin

---

## Phase 3: User Story 1 + 3 — Transport-Level Sampler with Observable Drops (Priority: P1) 🎯 MVP

**Goal**: `HeadSampler` and `RateLimitSampler` transport wrappers that drop events
according to their strategy, fire `onDrop` with structured metadata for every drop,
fail open on errors, and respect the never-throw boundary.

**US1 Independent Test**: Wrap a `ConsoleTransport` in a head-based sampler at 50%,
emit 100 events, verify ~50 reach inner transport and each drop fires `onDrop`.

**US3 Independent Test**: Configure a sampler with a counting `onDrop` callback,
emit events until drops occur, assert callback fires exactly once per drop with
correct DropNotification fields.

### Tests for US1+US3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Contract test for sampler Transport interface compliance in
  `tests/contract/sampler-contract.test.ts` — verify both `HeadSampler` and
  `RateLimitSampler` pass `assertTransportContract` (name, send, flush, shutdown).
  Covers S1.1–S1.6.
- [ ] T011 [P] [US1] Unit test for head sampler distribution accuracy in
  `tests/unit/sampler/head-sampler.test.ts` — 10,000 trials at rate 0.5,
  assert within 5% at 99% confidence (SC-001). Test extremes: rate=0 (all dropped),
  rate=1.0 (all passed). Test fail-open: decision throw → event passes through.
  Covers SC-001, SC-003, S2.1.
- [ ] T012 [P] [US1] Unit test for rate-limit sampler token bucket in
  `tests/unit/sampler/rate-limit-sampler.test.ts` — mock `performance.now()` via
  `vi.useFakeTimers()`. Fire 100 events at rate=10/s, assert ≤10 pass. Test token
  refill over multiple intervals. Test capacity bound (no token hoarding beyond
  capacity). Test fail-open: decision throw → event passes through. Covers SC-002,
  SC-003.
- [ ] T013 [P] [US3] Unit test for drop callback contract in
  `tests/unit/sampler/drop-callback.test.ts` — counting callback verifies one
  fire per drop (S3.1). Verify DropNotification field correctness: level, message,
  timestamp, reason, samplerName (S3.2). Test callback failure isolation: throwing
  `onDrop` does not propagate, `onInternalError` fires exactly once per session
  (S3.3, SC-004). Covers S3.1–S3.3, SC-004.
- [ ] T014 [P] [US3] Security test for sensitive-data isolation in
  `tests/security/sampler-no-leak.security.test.ts` — create a `LogEvent` with
  `attributes: { token: "s3cret", userId: "abc" }` and `context.traceparent`.
  Configure sampler to drop all events (rate=0). Assert `DropNotification` has
  NO `attributes`, `context`, or `error` fields. Assert string "s3cret" does not
  appear in any DropNotification field (S3.4, FR-007a). Covers S3.4, FR-007a,
  FR-011.

### Implementation for US1+US3

- [ ] T015 [P] [US1] Implement `HeadSampler` factory function in
  `src/sampler/head-sampler.ts` — wraps a `Transport`, implements `Transport`,
  uses `Math.random() < rate` for pass/drop decision. Catches decision errors
  (fail-open). Fires `onDrop` on drop. Delegates `flush()`/`shutdown()` to
  inner transport. Deduplicates `onDrop` error notification with `notified` flag
  (matching SafeTransport FS-12 pattern). Covers FR-001, FR-003, FR-007, FR-007a.
- [ ] T016 [P] [US1] Implement `RateLimitSampler` factory function in
  `src/sampler/rate-limit-sampler.ts` — token bucket with `performance.now()`
  refill. Configurable `refillInterval` (default 1000ms). Capacity = rate.
  Consumes 1 token per passed event. Catches decision errors (fail-open).
  Fires `onDrop` on drop. Delegates `flush()`/`shutdown()`. Same `notified`
  dedup pattern. Covers FR-002, FR-003, FR-007, FR-007a.
- [ ] T017 [US3] Implement `createDropNotification()` in `src/sampler/types.ts` —
  extracts `level`, `message`, `timestamp` from `LogEvent`, adds `reason` and
  `samplerName`. Does NOT access `attributes`, `context`, or `error`. Covers
  FR-006, FR-007a, FR-011.
- [ ] T018 [US1] Export `HeadSampler`, `RateLimitSampler`, `SamplerConfig`,
  `DropNotification`, `SamplerType` from `src/index.ts` — add to existing
  barrel exports. Verify `npm run typecheck` passes. Verify
  `npm run surface:check` passes (distributed surface contract test catches
  any unintended export changes).

**Checkpoint**: Samplers fully functional and independently testable. Wrap any
transport, observe every drop, fail-open, never-throw. `npm test` passes for
all Phase 3 tests.

---

## Phase 4: User Story 2 — Config-Level Sampling (Priority: P2)

**Goal**: Declarative `sampling` config section in `LoggerConfig` that
automatically wraps all transports. Per-transport opt-out (`sampling: false`)
and override. Configuration without `onDrop` is rejected.

**Independent Test**: Call `configureLogging()` with `sampling: { type: 'head', rate: 0.1, onDrop }`,
emit 100 events, verify ~10 reach the transport.

### Tests for US2 ⚠️

- [ ] T019 [P] [US2] Integration test for config-level sampling in
  `tests/integration/sampler-config.integration.test.ts` — call
  `configureLogging()` with sampling config, emit events, verify transport
  receives sampled events. Test: sampling OFF by default (no drops),
  head sampling at 10%, rate-limit sampling at 10/s. Covers FR-004, FR-005.
- [ ] T020 [P] [US2] Integration test for config rejection in
  `tests/integration/sampler-config.integration.test.ts` (same file) —
  `configureLogging()` with `sampling` but no `onDrop` → throws with
  clear error. Invalid rate (negative, NaN) → clamp + `onInternalError`
  notice. Covers S4.2.
- [ ] T021 [P] [US2] Integration test for per-transport override in
  same file — global sampling at 10%, one transport opts out
  (`sampling: false`), one transport overrides to rate-limit.
  Assert opt-out transport receives 100%, overriding transport uses
  rate-limit. Covers S4.3, S4.4.

### Implementation for US2

- [ ] T022 [US2] Integrate sampling into `buildConfiguredRuntime()` in
  `src/runtime/configured-runtime.ts` — after `sourceTransports` resolution,
  if `normalizedSamplingConfig` is defined, wrap each transport in the
  appropriate sampler. Then wrap all transports in `SafeTransport` as before.
  Sampler wrapping order: `SafeTransport(Sampler(innerTransport))`.
  Covers FR-004.
- [ ] T023 [US2] Implement per-transport `sampling` field support — if a
  transport entry has `sampling: false`, skip sampler wrapping for that
  transport. If a transport entry has its own `sampling` config, use that
  instead of the global config. Config shape for transport entries extended
  in `src/api/types.ts` to include optional `sampling` field. Covers FR-004
  override, S4.3, S4.4.
- [ ] T024 [US2] Wire `normalizeSamplingConfig()` into `normalizeConfig()` in
  `src/config/config.ts` — return normalized sampler config (or undefined)
  alongside other normalized fields. Pass through to `NormalizedConfig` and
  `buildConfiguredRuntime()`. Add `sampling` to `NormalizedConfig` type.

**Checkpoint**: `configureLogging({ sampling: { type: 'head', rate: 0.1, onDrop } })`
works end-to-end. Per-transport overrides work. Invalid config rejected.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation passes, bundle-size verification

- [ ] T025 [P] Update `src/api/types.ts` JSDoc — add documentation comments for
  `SamplerConfig`, `DropNotification`, and the new `sampling` field on
  `LoggerConfig`. Follow existing JSDoc style (locked invariants, cross-references
  to contracts).
- [ ] T026 [P] Update `src/sampler/head-sampler.ts` and
  `src/sampler/rate-limit-sampler.ts` JSDoc — document fail-open behavior,
  `onDrop` required, decision-function attribute isolation, and delegation
  semantics.
- [ ] T027 Bundle-size verification — run `npm run build` and check sampler code
  adds ≤ 2 KB gzipped over baseline (SC-007). If over budget, identify and trim.
  The existing CI bundle-size check will enforce this.
- [ ] T028 Security & Privacy validation pass — run `npm run test:security` and
  verify `sampler-no-leak.security.test.ts` passes. Verify no new path can leak
  secrets, tokens, or PII. Verify `onDrop` only receives metadata.
- [ ] T029 Log integrity validation pass — verify every drop is observable via
  `onDrop`. Verify `onDrop` is required at config time. Verify sampler does not
  reorder, batch, or transform passed-through events.
- [ ] T030 Lightweight Logger & federated runtime validation pass — verify sampler
  instances are created at `buildConfiguredRuntime()` time (not per-`Logger`).
  Create 100 `Logger` instances and verify no per-instance sampler creation.
  Verify sampler state is transport-level, not per-`Logger`.
- [ ] T031 Reproducible Verification & Mechanical Enforcement pass — run
  `npm run typecheck && npm test && npm run surface:check`. Verify identical
  pass/fail locally. Enumerate enforcement mechanisms for every gate:
  - S1–S4 contracts → `tests/contract/sampler-contract.test.ts`
  - SC-001/SC-003 → `tests/unit/sampler/head-sampler.test.ts`
  - SC-002/SC-003 → `tests/unit/sampler/rate-limit-sampler.test.ts`
  - SC-004/S3.1–S3.3 → `tests/unit/sampler/drop-callback.test.ts`
  - S3.4/FR-007a/FR-011 → `tests/security/sampler-no-leak.security.test.ts`
  - FR-004/FR-005/S4.2–S4.4 → `tests/integration/sampler-config.integration.test.ts`
  - SC-007 → CI bundle-size check
  - Public surface → `tests/contract/distributed-surface.contract.test.ts`
- [ ] T032 Run `quickstart.md` validation — copy-paste each code example into a
  temporary test file, verify `npm run typecheck` accepts the types, verify no
  runtime errors in the example patterns. Fix any discrepancies.
- [ ] T033 [P] Update `AGENTS.md` or project documentation if the new sampler
  exports change the project's described surface area (unlikely — sampler is
  additive, no existing surface changed).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001) — BLOCKS all user stories
- **US1+US3 (Phase 3)**: Depends on Foundational (Phase 2) complete
- **US2 (Phase 4)**: Depends on US1+US3 (Phase 3) — config integration wraps
  already-working samplers
- **Polish (Phase 5)**: Depends on all user stories complete

### Within Phase 3 (US1+US3)

- Tests (T010–T014) MUST be written and FAIL before implementation
- T010–T014 can all run in parallel (different files)
- T015 and T016 can run in parallel (different files)
- T017 depends on T015 or T016 (needs sampler context for DropNotification creation)
- T018 depends on T015, T016 (exports the implemented classes)

### Within Phase 4 (US2)

- Tests (T019–T021) before implementation (all in same file — run sequentially)
- T022 (buildConfiguredRuntime integration) depends on T024 (config normalization
  wired in) — do T024 first

### Parallel Opportunities

- All Phase 2 tasks except T006 and T008–T009: T003–T005, T007 can run in parallel
- All Phase 3 tests (T010–T014): parallel
- T015 and T016: parallel
- All Phase 4 tests (T019–T021): same file, sequential but independent of each other
- All Phase 5 tasks except sequential validation passes: parallel where marked [P]

---

## Implementation Strategy

### MVP First (US1+US3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1+US3 (samplers + observable drops)
4. **STOP and VALIDATE**: `npm test` passes all Phase 3 tests. Manually test:
   wrap a ConsoleTransport in HeadSampler at 50%, verify drops are observable.
5. Samplers are usable via transport-wrapper API right now — no config sugar needed.

### Incremental Delivery

1. Setup + Foundational → types and config normalization ready
2. US1+US3 → `HeadSampler`, `RateLimitSampler` functional, all drops observable
3. US2 → `configureLogging({ sampling: {...} })` declarative config works
4. Polish → docs, bundle-size, validation passes complete

---

## Parallel Example: Phase 3 Tests

```bash
# Launch all Phase 3 tests together (different files, no shared state):
Task: "Contract test in tests/contract/sampler-contract.test.ts"
Task: "Unit test in tests/unit/sampler/head-sampler.test.ts"
Task: "Unit test in tests/unit/sampler/rate-limit-sampler.test.ts"
Task: "Unit test in tests/unit/sampler/drop-callback.test.ts"
Task: "Security test in tests/security/sampler-no-leak.security.test.ts"
```

## Parallel Example: Sampler Implementation

```bash
# HeadSampler and RateLimitSampler are independent files:
Task: "Implement HeadSampler in src/sampler/head-sampler.ts"
Task: "Implement RateLimitSampler in src/sampler/rate-limit-sampler.ts"
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US3 are combined in Phase 3 because they ship together (P1)
- Tests MUST fail before implementation (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate the story independently
- `npm run typecheck` and `npm test` must pass before moving to next phase
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break
  independence
