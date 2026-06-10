# Tasks: Structured Error Serialization Depth

**Input**: Design documents from `/specs/023-error-serialization-depth/`

**Prerequisites**: plan.md, spec.md (frozen), research.md, data-model.md,
contracts/error-serialization.md, quickstart.md

**Tests**: REQUIRED (TDD) — every behavior gate ES-1…ES-13 lands as a failing
test before its implementation. Test code is held to the same typing/lint/
build standards as `src/` (no relaxations).

**Organization**: Grouped by user story (US1 cause chains P1 · US2
AggregateError P2 · US3 fields/DOMException P3), each independently testable.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

**Purpose**: Tiny shared prerequisites with no behavioral effect.

- [x] T001 Extend `PackageErrorCode` union with `'error_serialize_failed'` (plus its JSDoc) in src/internal/errors/internal-errors.ts — first source-touching step (R4: `safeNotify` accepts only `PackageError`)
- [x] T002 [P] Add `DEFAULT_SERIALIZE_ERRORS_LIMITS` (maxCauseDepth 8, maxMembers 10, maxFields 16, maxNodes 50) and `SERIALIZE_ERRORS_LIMIT_BOUNDS` (clamps [1,16]/[1,100]/[0,64]/[1,256] per data-model.md) in src/config/env-defaults.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, config plumbing, the serializer skeleton, event-builder
integration, and pipeline node coverage that every user story flows through.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Define `SerializedErrorNode`, `SerializeErrorsOptions`, extend `ErrorInfo` (causes/members/fields + truncation markers incl. `budgetExhausted`), add `LoggerConfig.serializeErrors?: boolean | SerializeErrorsOptions` — exactly per data-model.md — in src/api/types.ts
- [x] T004 [P] Write FAILING unit tests for config normalization (ES-13: `true` → defaults; per-key clamp-and-notify, one `onInternalError` notice per clamped key; absent/false → disabled) in tests/unit/config/serialize-errors-config.test.ts
- [x] T005 Implement `serializeErrors` normalization in src/config/config.ts (resolved limits object or `undefined`, stored beside `sanitizerLimits`; reuse the sanitizer clamp-and-notify flow) — makes T004 pass
- [x] T006a Create src/errors/serialize-error.ts (NEW directory — confirm `src/errors/` is picked up by existing tsup/tsconfig globs before writing) with the pure, throw-free `forEachErrorNode(error, cb)` walker only (R9) — prerequisite for T009–T011
- [x] T006b Add to src/errors/serialize-error.ts: error-like structural detection (R3), `NonError` coercion, node-budget machinery (data-model §Budget semantics: budget binding, depth-first, top-level payload not counted), and `serializeError(value, limits): ErrorInfo` returning name/message/stack for the top-level value (capture specifics land per story) — prerequisite for T007
- [x] T007 Integrate into src/pipeline/event-builder.ts: extend `BuildLogEventInput` with optional resolved limits; when present call `serializeError` in try/catch with fallback to `reduceError` + `safeNotify(PackageError('error_serialize_failed'))` (FR-006)
- [x] T008 Thread normalized limits from config into `buildLogEvent` input in src/api/logger.ts
- [x] T009 Extend `sanitizeErrorInfo` in src/pipeline/sanitizer.ts: via `forEachErrorNode`, bound every node `name`/`message` and every string in `fields` to `maxStringLength`; pass `fields` values through the existing attribute-value sanitizer (depth-bounded, type-tagged) (R9, FR-008)
- [x] T010 [P] Extend src/pipeline/url-scrubber.ts: scrub node `message` and `fields` strings via the walker (names excluded — exact parity with flat-field behavior, R9)
- [x] T011 [P] Extend src/pipeline/redactor.ts: shape rules on every node `name`/`message` (parity with redactor.ts:138–158); key-based redaction rules on `fields` entries (parity with attributes); existing fail-closed `redactor_failed` behavior preserved (FR-008)
- [x] T012 [P] Write the ES-10 off-by-default shape lock as the first block of tests/security/error-serialization.security.test.ts: with `serializeErrors` absent/false, `event.error` is exactly `{ name, message, stack? }` and no new attributes appear (SC-005)

**Checkpoint**: Foundation ready — `npm test` green, ES-10 + ES-13 enforced
(T012 can be authored in parallel with T007/T008 but passes green only after
T007+T008 land).

---

## Phase 3: User Story 1 - Cause chains travel with the error (Priority: P1) 🎯 MVP

**Goal**: With `serializeErrors` enabled, a logged error's `cause` chain
appears as `error.causes` — flat, ordered, bounded, redacted — and the
feature-016 attribute is suppressed.

**Independent Test**: Log an error wrapping two nested causes → event exposes
3/3 links in order (SC-001); no-cause error → no `causes` key; chain absent
from `safesignal.errorCauses` while enabled.

### Tests for User Story 1 ⚠️ write first, must fail

- [x] T013 [P] [US1] Write FAILING contract tests in tests/contract/error-serialization.contract.test.ts: ES-1 (flat ordered chain incl. `entry.causes === undefined` flatness assertion; absent when no cause), ES-3 (depth clip sets `causesTruncated: true`), US1.3 (`NonError` coercion of non-error causes)
- [x] T014 [P] [US1] Write FAILING unit tests in tests/unit/errors/serialize-error.test.ts: ES-2 (cycle terminates, no hang; terminating node does NOT carry `causesTruncated`), cross-realm error-like objects serialized structurally (R3), depth bound + budget interaction on chains
- [x] T015 [P] [US1] Write FAILING security tests (append to tests/security/error-serialization.security.test.ts): ES-11 (enabled → `safesignal.errorCauses` never populated, with and without breadcrumbs on; disabled + breadcrumbs → 016 output unchanged) and ES-9 chain coverage (shape-rule redaction applies to cause-entry `name`/`message`; URL scrubbing applies to cause messages)

### Implementation for User Story 1

- [x] T016 [US1] Implement flat cause-chain capture in src/errors/serialize-error.ts: defensive `.cause` walk (seen-set cycle guard), flatten outermost-first into `causes`, clip at `maxCauseDepth`/budget with `causesTruncated`, entries never carry their own `causes` — makes T013/T014 pass
- [x] T017 [US1] Apply FR-014 gate in src/api/logger.ts (016 block at logger.ts:221–238 runs only when `serializeErrors` is disabled) — makes T015 ES-11 pass; verify ES-9 chain assertions pass via T009–T011 coverage

**Checkpoint**: US1 fully functional — MVP. ES-1/2/3/9(chains)/11 green
(ES-10 already green from Phase 2).

---

## Phase 4: User Story 2 - AggregateError members are visible (Priority: P2)

**Goal**: `AggregateError.errors` serialized as recursive `members`,
count-bounded with honest `membersTotal`, all under the binding node budget.

**Independent Test**: Log an `AggregateError` of 3 members → all 3 listed
with names/messages (SC-002); 1,000 members → exactly `maxMembers` +
`membersTotal: 1000`.

### Tests for User Story 2 ⚠️ write first, must fail

- [ ] T018 [P] [US2] Write FAILING contract tests (append to tests/contract/error-serialization.contract.test.ts): ES-4 (members in original order; clip to `maxMembers` sets `membersTotal` = original count; member with its own cause chain captured within bounds — US2.3)
- [ ] T019 [P] [US2] Write FAILING unit tests (append to tests/unit/errors/serialize-error.test.ts): ES-5 pathological inputs per SC-006 (1,000-member aggregates, aggregates-in-causes and causes-in-members nesting, total nodes ≤ `maxNodes`, `budgetExhausted` on top-level payload, depth-first emission order, inner limits subordinate to budget)
- [ ] T021 [P] [US2] Write FAILING ES-9 member-coverage security tests (append to tests/security/error-serialization.security.test.ts): redaction shape rules + URL scrub reach member node `name`/`message` at arbitrary nesting depth (out-of-sequence ID kept after review reorder — runs with T018/T019)

### Implementation for User Story 2

- [ ] T020 [US2] Implement recursive member capture in src/errors/serialize-error.ts: detect aggregate errors structurally (array-valued `errors` own property), emit member nodes (each may carry causes/members/fields) bounded by `maxMembers` + budget — makes T018/T019/T021 pass

**Checkpoint**: US1 + US2 independently functional.

---

## Phase 5: User Story 3 - Custom subclass fields and DOMException details (Priority: P3)

**Goal**: Safe own enumerable extra fields (and DOMException's legacy `code`)
captured value-filtered, bounded, redacted; extraction is fail-safe under
hostile inputs.

**Independent Test**: Log a custom subclass with two extra fields → both in
`error.fields` with redaction applied; log a DOMException → `fields.code`
present; a throwing getter never drops the event (SC-003).

### Tests for User Story 3 ⚠️ write first, must fail

- [ ] T022 [P] [US3] Write FAILING contract tests (append to tests/contract/error-serialization.contract.test.ts): ES-6 (own enumerable JSON-safe fields captured; functions/symbols/prototype props excluded; `maxFields` clip sets `fieldsTruncated`; DOMException `fields.code`), ES-7 (no nested node ever carries stack text; top-level `stack` unchanged)
- [ ] T023 [P] [US3] Write FAILING fault-injection unit tests in tests/unit/errors/serialize-error-failsafe.test.ts: ES-8 (throwing property getters, throwing `cause` getter, exotic objects/Proxies → event still delivered with at least name/message; zero throws to caller; `onInternalError` receives `PackageError` with code `error_serialize_failed`; partial extraction keeps safely-extracted data — US3.4)
- [ ] T024 [P] [US3] Write FAILING security tests (append to tests/security/error-serialization.security.test.ts): ES-9 fields coverage (key-based redaction: a `token`/`password` field value never reaches the transport — SC-004; megabyte field strings clipped to `maxStringLength`)

### Implementation for User Story 3

- [ ] T025 [US3] Implement value-filtered field capture in src/errors/serialize-error.ts: guarded own-enumerable reads (per-property try/catch), JSON-safe filter (primitives, plain objects/arrays via sanitizer-limit depth), skip name/message/stack/cause, `maxFields` + `fieldsTruncated`; DOMException special case reads prototype `code` (structural detection, R2) — makes T022/T023/T024 pass
- [ ] T026 [US3] Confirm fail-safe wrapper end-to-end in src/pipeline/event-builder.ts against the fault-injection suite (fallback payload, single `safeNotify`, no double-notification) — adjust only if T023 exposes gaps

**Checkpoint**: All user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T027 Measure `dist/index.{mjs,cjs}` gzip deltas (`npm run build` + the size-lock test's own measurement) and raise `DEFAULT_ENTRY_MJS_GZ_MAX`/`DEFAULT_ENTRY_CJS_GZ_MAX` in tests/security/transport-beacon-bundle-shape.security.test.ts by the measured delta rounded up to the next 50 bytes, with a dated rationale comment naming feature 023 (ES-12; >1.5 KB growth = stop and simplify per R7)
- [ ] T028 [P] Amend specs/001-structured-logging-core/contracts/sanitization.md (verify the path exists before editing — this is a deliberate cross-feature amendment, never a new file) per contracts/error-serialization.md §Contract amendments (error-payload node coverage documented; attribute Error type-tag rule explicitly unchanged), with a dated amendment note
- [ ] T029 [P] Update README.md (deep error serialization section: enable, bounds, privacy posture, FR-014 interplay with breadcrumbs) and verify quickstart.md examples run as written — examples must model safe logging only
- [ ] T030 [P] Add CHANGELOG.md `[Unreleased]` entry (additive `ErrorInfo` fields, new `serializeErrors` config, 016-attribute suppression note while enabled)
- [ ] T031 SC-007 documentation review (named gate per Constitution X, filed from spec): review all docs/examples added by this feature for accuracy of bounds + privacy behavior and absence of unsafe patterns; record completion in this file before release
- [ ] T032 Update the api-extractor surface report for the additive public types: run `npm run api:extract` (updates the report), then confirm `npm run api:check` passes; verify the report diff is exactly the new symbols (`SerializedErrorNode`, `SerializeErrorsOptions`, `ErrorInfo` additions, `LoggerConfig.serializeErrors`)
- [ ] T033 Mechanical-enforcement validation pass: confirm each of ES-1…ES-13 maps to a named, existing, failing-closed test (`grep -rE "ES-[0-9]+" tests/` and cross-check against contracts/error-serialization.md); confirm no tolerated test-code relaxation exists; file remediation tasks here if any gate is unenforced
- [ ] T034 Run full `npm run verify` (build, typecheck, lint, format:check, all test suites, api:check) and fix anything red — single authoritative gate, identical local/CI (Constitution IX)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately. T001 ∥ T002.
- **Foundational (Phase 2)**: needs Phase 1. T003 → (T004 ∥ T005-after-T004) ;
  T006a needs T003; T006b needs T006a; T007 needs T006b + T001; T008 needs
  T007 + T005; T009–T011 need T006a (walker) + T003; T012 needs T003 (type
  exists) and passes only after T007/T008.
- **User Stories (Phases 3–5)**: all need Phase 2 complete. US1 → US2 → US3
  recommended (single implementer; serializer file is shared), though tests
  within each story are parallel.
- **Polish (Phase 6)**: needs all desired stories. T027 needs final code size;
  T028–T030 parallel; T032 after types stop moving; T034 last.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P2)**: Foundational only (shares serialize-error.ts with US1 —
  sequence implementation tasks, parallelize test authoring).
- **US3 (P3)**: Foundational only (same note).

### Within Each User Story

Tests written and FAILING before implementation; security assertions verified
green at story checkpoint; commit after each task or logical group (DCO
signed, `npm run format:check` before each commit).

### Parallel Opportunities

- T001 ∥ T002; T004 ∥ T006a (then T006b); T009 → then T010 ∥ T011; T012 ∥ T010/T011.
- US2 test authoring: T018 ∥ T019 ∥ T021 (all before T020).
- Per story: all test-authoring tasks [P] together (different files or
  distinct append blocks), then implementation sequentially in
  serialize-error.ts.
- Polish: T028 ∥ T029 ∥ T030.

---

## Parallel Example: User Story 1

```bash
# Author all US1 tests together (they must fail):
Task: "ES-1/ES-3 contract tests in tests/contract/error-serialization.contract.test.ts"
Task: "ES-2/cross-realm unit tests in tests/unit/errors/serialize-error.test.ts"
Task: "ES-11 + ES-9(chains) security tests in tests/security/error-serialization.security.test.ts"

# Then implement sequentially:
Task: "Flat cause-chain capture in src/errors/serialize-error.ts"
Task: "FR-014 gate in src/api/logger.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2 (foundation, ES-10/ES-13 enforced).
2. Phase 3 (US1): cause chains + FR-014 suppression → **stop and validate**:
   `npm test`, quickstart US1 example works, ES-1/2/3/9/10/11 green.
3. Demo-able MVP: `serializeErrors: true` delivers full cause chains.

### Incremental Delivery

Each story checkpoint leaves `npm run verify` green and every prior story's
contract intact (additive-only changes to serialize-error.ts). Size-lock bump
(T027) happens once, after US3, when the final footprint is measurable.

---

## Notes

- ES IDs reference contracts/error-serialization.md; FR/SC/US IDs reference
  the frozen spec.md.
- Commit cadence: after each task or logical group; `git commit -s`; run
  `npm run format:check` first (pre-commit hook enforces Biome).
- The pre-push hook runs full `npm run verify` — expect T032/T027 to be
  required before any push that changes the public surface/bundle size.
