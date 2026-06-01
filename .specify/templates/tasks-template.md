---

description: "Task list template for feature implementation"
---

# Tasks: [FEATURE NAME]

**Input**: Design documents from `/specs/[###-feature-name]/`

**Prerequisites**: plan.md (required), spec.md (required for user stories),
research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for this project. Every change that affects public API,
runtime behavior, failure handling, metadata, redaction, or environment-sensitive
configuration MUST include the appropriate contract, integration, and unit coverage.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- **Package project**: `src/`, `tests/`, `examples/`, `docs/` at repository root
- **Web app**: `backend/src/`, `frontend/src/`
- Paths shown below assume a reusable package layout - adjust based on plan.md
  structure

<!--
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.

  The /speckit-tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/

  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment

  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools
- [ ] T004 [P] Establish package contract and browser runtime test scaffolding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be
implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T005 Define exported package API and compatibility guardrails
- [ ] T006 [P] Setup browser-safe transport and failure-handling infrastructure
  (including fail-closed redaction and SafeTransport-style isolation)
- [ ] T007 [P] Define structured event schema, level handling, and metadata model
  with bounded depth, bounded size, and no raw object dumping
- [ ] T008 Implement secure-by-default redaction/privacy guardrails and safe
  defaults (default sensitive-key denylist, fail-closed handling, applied uniformly
  to attributes, context, and serialized error data)
- [ ] T009 Setup environment configuration management
- [ ] T009a [P] Establish log integrity & monitoring suitability guardrails
  (stable structure, origin attribution, documented drop/sample/batch behavior)
- [ ] T009b [P] Establish lightweight-`Logger` and federated-runtime guardrails:
  cheap, side-effect-free `Logger` construction (no per-instance backend init,
  transport open, timer, global listener, console patch, network work, or
  ambient read); shared runtime resources configured once at the package level;
  explicit host/module ownership of configuration; and a documented
  duplicate-package-copy contract (isolated / shared / explicitly unsupported)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - [Title] (Priority: P1) 🎯 MVP

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Contract test for [public API] in tests/contract/test_[name].ts
- [ ] T011 [P] [US1] Integration test for [consumer journey] in tests/integration/test_[name].ts
- [ ] T012 [P] [US1] Failure-safety or browser runtime test in tests/integration/test_[name].ts
- [ ] T013 [P] [US1] Metadata/redaction behavior test in tests/unit/test_[name].ts

### Implementation for User Story 1

- [ ] T014 [P] [US1] Create [Entity1] model in src/[path]/[entity1].ts
- [ ] T015 [P] [US1] Create [Entity2] model in src/[path]/[entity2].ts
- [ ] T016 [US1] Implement [Service] in src/[path]/[service].ts (depends on T014, T015)
- [ ] T017 [US1] Implement [consumer-facing feature] in src/[path]/[file].ts
- [ ] T018 [US1] Add validation and error handling
- [ ] T019 [US1] Update package docs and integration guidance for User Story 1

**Checkpoint**: At this point, User Story 1 should be fully functional and testable
independently

---

## Phase 4: User Story 2 - [Title] (Priority: P2)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 2 ⚠️

- [ ] T020 [P] [US2] Contract test for [public API] in tests/contract/test_[name].ts
- [ ] T021 [P] [US2] Integration test for [consumer journey] in tests/integration/test_[name].ts
- [ ] T022 [P] [US2] Failure-safety or browser runtime test in tests/integration/test_[name].ts

### Implementation for User Story 2

- [ ] T023 [P] [US2] Create [Entity] model in src/[path]/[entity].ts
- [ ] T024 [US2] Implement [Service] in src/[path]/[service].ts
- [ ] T025 [US2] Implement [consumer-facing feature] in src/[path]/[file].ts
- [ ] T026 [US2] Integrate with User Story 1 components (if needed)
- [ ] T027 [US2] Update package docs and integration guidance for User Story 2

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - [Title] (Priority: P3)

**Goal**: [Brief description of what this story delivers]

**Independent Test**: [How to verify this story works on its own]

### Tests for User Story 3 ⚠️

- [ ] T028 [P] [US3] Contract test for [public API] in tests/contract/test_[name].ts
- [ ] T029 [P] [US3] Integration test for [consumer journey] in tests/integration/test_[name].ts
- [ ] T030 [P] [US3] Privacy, metadata, or environment-configuration test in tests/unit/test_[name].ts

### Implementation for User Story 3

- [ ] T031 [P] [US3] Create [Entity] model in src/[path]/[entity].ts
- [ ] T032 [US3] Implement [Service] in src/[path]/[service].ts
- [ ] T033 [US3] Implement [consumer-facing feature] in src/[path]/[file].ts
- [ ] T034 [US3] Update package docs and integration guidance for User Story 3

**Checkpoint**: All user stories should now be independently functional

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] TXXX [P] Documentation updates in docs/ (must model safe logging; no
  insecure-pattern normalization in examples)
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit tests in tests/unit/
- [ ] TXXX Security & Privacy validation pass: verify secure defaults, redaction
  coverage on attributes/context/error data, fail-closed behavior, and that no new
  path leaks secrets, credentials, tokens, session identifiers, or unnecessary
  personal data
- [ ] TXXX Log integrity validation pass: verify event structure, origin
  attribution, and that any drop/sample/batch/transform behavior is documented and
  tested
- [ ] TXXX Lightweight-`Logger` & federated-runtime validation pass: many-instance
  scale test (creating N `Logger` instances stays linear and incurs no
  per-instance backend/transport/timer/global-listener initialization); host vs.
  module ownership test (a federated module cannot accidentally replace the
  host's configured runtime); duplicate-package-copy contract verified against
  its documented classification (isolated / shared / explicitly unsupported)
- [ ] TXXX Reproducible Verification & Mechanical Enforcement validation pass:
  enumerate every quality gate this feature documents (in spec.md, plan.md,
  contracts/, or this tasks list); confirm each runs through a single
  documented `npm` script (or equivalent) with identical pass/fail behavior
  locally and in CI for the same source state; confirm each is guarded by a
  named automated check (test file path, CI job name, lint rule identifier,
  or publish-time hook) that fails closed when the gate is violated; confirm
  test code under `tests/` is held to the same typing, lint, build, and
  import-resolution standards as `src/`, with any tolerated relaxation
  carrying a written, named, time-bound removal condition; file a remediation
  task for any documented gate that lacks an enforcement path
- [ ] TXXX Deprecation & supply-chain validation pass: if any published contract
  changes incompatibly, confirm the replacement shipped first with a documented
  migration path, the deprecation is signaled (types / `@deprecated` / changelog),
  and the deprecated contract is retained for at least one minor release before
  removal (with an automated check that a removed public symbol was deprecated in a
  prior minor, or a documented release-checklist gate filed as remediation). If the
  release pipeline, publish path, dependency set, or distributed surface changed,
  confirm attested publishing, signed tags, DCO attribution, pinned/screened
  dependencies, and ship-vs-documented parity remain enforced
- [ ] TXXX Validate consumer migration notes and package API docs
- [ ] TXXX Run quickstart.md validation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on
  other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with
  US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with
  US1/US2 but should be independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Documentation and migration notes before story closure
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team
  capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Contract test for [public API] in tests/contract/test_[name].ts"
Task: "Integration test for [consumer journey] in tests/integration/test_[name].ts"
Task: "Failure-safety or browser runtime test in tests/integration/test_[name].ts"

# Launch all models for User Story 1 together:
Task: "Create [Entity1] model in src/[path]/[entity1].ts"
Task: "Create [Entity2] model in src/[path]/[entity2].ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break
  independence
