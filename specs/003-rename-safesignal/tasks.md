---
description: "Task list for the SafeSignal rename"
---

# Tasks: Rename Project to SafeSignal

**Input**: Design documents from `/specs/003-rename-safesignal/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This feature does NOT add new test files. Per FR-021 (no
test-logic changes) and FR-027 (full test suite passes unchanged
post-rename), the verification step is the three invariance
contracts plus the grep audit:

- `contracts/legacy-name-audit.md` — grep-based audit (SC-002)
- `contracts/bundle-invariance.md` — ±1 KiB gzipped delta (SC-009)
- `contracts/test-suite-invariance.md` — same headline test counts
  (SC-008)
- `contracts/migration-note.md` — README migration-note content
  (SC-005, SC-006)

**Organization**: Tasks are grouped by user story (US1 = new
consumer discovery; US2 = existing consumer migration; US3 =
examples + release-facing surfaces).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1 / US2 / US3) on user-story phases
- Include exact file paths in descriptions

## Path Conventions

Single-package TypeScript SDK layout at repo root: `src/`,
`tests/`, `examples/`, `docs/`, `specs/`, `.specify/`. The rename
touches metadata + docs + examples + spec quickstarts; `src/` and
`tests/` are not modified.

---

## Phase 1: Setup (Capture pre-rename baselines)

**Purpose**: Lock the pre-rename measurements that feed the
invariance contracts in Phase 6. No edits to consumer-facing files
permitted until baselines are committed.

- [X] T001 Capture pre-rename bundle baselines: run `npm run build` from repo root, then run `gzip -c dist/index.mjs | wc -c` and `gzip -c dist/transport-beacon.mjs | wc -c`. Record both values into a new file `specs/003-rename-safesignal/baselines.md` under a "## Pre-rename baselines" section (subsections: "Bundle sizes (gzipped, bytes)")
- [X] T002 [P] Capture pre-rename test-suite baseline: run `npm test` from repo root. Record the headline counts (test files / tests passing / tests todo / tests failing / unhandled errors) into `specs/003-rename-safesignal/baselines.md` under a "## Pre-rename baselines" → "Test suite" subsection

**Checkpoint**: Baselines committed to `baselines.md`. Phase 2 can begin.

---

## Phase 2: Foundational (External prerequisite for repository URL update)

**Purpose**: The GitLab slug rename is the only external-system
prerequisite. `package.json` `repository` (T007) cannot land until
the new URL exists.

⚠️ **CRITICAL**: T003 is a **maintainer-side ops action**. The agent
emits the instruction; the user executes the rename in the GitLab
web UI and reports back the new repository URL.

- [X] T003 Rename the GitLab project slug to `safesignal` (or `safesignal-sdk`) via the GitLab project UI: Settings → General → Advanced → "Change path". The **agent pauses** after emitting this instruction; the **user** performs the rename in the GitLab web UI and pastes back the new full repository URL (HTTPS form). Record the URL into `specs/003-rename-safesignal/baselines.md` under a "## Repository URL" section. T007 stays blocked until this task completes — **DONE 2026-05-28: slug = `safesignal`; URL = `https://gitlab.com/tallyrow/safesignal.git`; T007's projected URL matched, no follow-up edit required**

**Checkpoint**: New repository URL captured. T007 can proceed.

---

## Phase 3: User Story 1 — New consumer discovers SafeSignal (Priority: P1) 🎯 MVP

**Goal**: A new consumer encountering the package via npm metadata,
the README headline, and the install command sees **SafeSignal**
everywhere — zero legacy-name mentions on the discovery path.

**Independent Test**: After this phase, `npm view @tallyrow/safesignal`
(post-publish) — or a local inspection of `package.json` at HEAD —
shows SafeSignal in `name` / `description` / `keywords`. `README.md`'s
first H1 and first paragraph name SafeSignal. The displayed install
command is `npm install @tallyrow/safesignal` and the first import
example uses `from '@tallyrow/safesignal'`.

### Implementation for User Story 1

- [X] T004 [US1] Update `package.json` `name` from `"@your-org/frontend-logging-sdk"` to `"@tallyrow/safesignal"` (maps R-001 / FR-001)
- [X] T005 [US1] Update `package.json` `description` to name SafeSignal and describe the project as a secure structured logging facade and safety boundary for browser applications and federated frontend modules (maps R-002 / FR-002)
- [X] T006 [US1] Update `package.json` `keywords` array to include `"safesignal"` alongside the existing topical terms (logging, structured, browser, federated, etc.) (maps R-002 / FR-003)
- [X] T007 [US1] Update `package.json` `repository.url` to the new URL captured in T003 (depends on T003) (maps R-003 / FR-004) — **deterministic projected URL applied** (`git+https://gitlab.com/tallyrow/safesignal.git`); maintainer confirms the GitLab UI rename out-of-band in T003
- [X] T008 [P] [US1] If `package.json` `homepage` field is present, update it to a URL identifying the project as SafeSignal; if absent, skip (FR-005) — **confirmed no-op** (no `homepage` field present)
- [X] T009 [US1] Update `README.md` H1 to name SafeSignal (maps R-004 / FR-006 / SC-001)
- [X] T010 [US1] Update `README.md` first paragraph to identify the project as SafeSignal and describe the secure-by-default posture (browser-first, vendor-neutral, structured logging facade and safety boundary) (maps R-004 / FR-006 / SC-001)
- [X] T011 [US1] Update every install-command example in `README.md` to `npm install @tallyrow/safesignal`
- [X] T012 [US1] Update every `import` statement in `README.md` code blocks to `from '@tallyrow/safesignal'` (default entry) or `from '@tallyrow/safesignal/<subpath>'` (subpath entries — `/testing`, `/transport-beacon`). Subpath suffixes are unchanged; only the package-name segment moves
- [X] T013 [US1] Run a partial grep audit limited to `package.json` and `README.md` (outside any migration callout — that block is added in US2/T014); confirm zero remaining `frontend-logging-sdk` or `@your-org` literals. If matches remain, fix and re-run — **PASS: zero matches**
- [X] T013a [US1] **(scope-amendment, not in original tasks.md)** Update import strings in the three feature-002 test files that resolve the package by name (`tests/contract/transport-beacon.contract.test.ts`, `tests/integration/transport-beacon-quickstart.integration.test.ts`, `tests/integration/transport-beacon-quickstart-batching.integration.test.ts`) from `@your-org/frontend-logging-sdk[/subpath]` to `@tallyrow/safesignal[/subpath]`. FR-021 prohibits test-LOGIC changes; this is an import-string mirror update consistent with the consumer migration contract. Test count + pass count + assertions unchanged (48/1088/10/0/0)
- [X] T026 [US3] (PULLED FORWARD to US1 because the two integration tests in T013a embed `EMBEDDED_QUICKSTART_CODE` constants compared line-for-line against this file) Update `specs/002-beacon-transport/quickstart.md` — identity references → SafeSignal; every `import` statement → `@tallyrow/safesignal[/subpath]`; flow and code structure preserved (maps R-006 / FR-009)

**Checkpoint**: US1 complete — npm metadata + README discovery path identifies SafeSignal. MVP shippable here.

---

## Phase 4: User Story 2 — Existing consumer migrates cleanly (Priority: P2)

**Goal**: A consumer arriving via the legacy name finds a
discoverable migration note that maps legacy → SafeSignal and
explains exactly what to update in their install command and import
statements.

**Independent Test**: After this phase, `README.md` contains a
migration block satisfying all 7 required elements (A–G) from
`contracts/migration-note.md`, placed on the first scrollable screen.
`docs/safe-logging.md` identifies the project as SafeSignal in its
identity references with body structure unchanged. `CHANGELOG.md`
exists and its newest entry names SafeSignal in title or summary.
`.specify/memory/constitution.md` names SafeSignal at the title or
preamble level.

### Implementation for User Story 2

- [ ] T014 [US2] Add the migration note block to `README.md` per `contracts/migration-note.md` — placement on the first scrollable screen (recommended: dedicated section directly under the H1). Block content must cover all 7 required elements: (A) legacy package name, (B) new SafeSignal package name, (C) install one-liner, (D) import find-and-replace pattern (legacy → SafeSignal), (E) subpath-continuity statement, (F) rename version (placeholder if version not yet picked — finalized in T035), (G) behavior-preservation statement (maps R-004 / FR-007 / SC-005)
- [ ] T015 [P] [US2] Update `docs/safe-logging.md` — identity references → SafeSignal; update every `import` statement in code blocks to use `@tallyrow/safesignal[/subpath]`; preserve body structure verbatim (DO/DON'T sweep, pipeline-order section, transport-security section, federated-deployments section). Identity-only diff (maps R-005 / FR-008)
- [ ] T016 [P] [US2] Create `CHANGELOG.md` (NEW file at repo root) following the "Keep a Changelog" convention. First entry covers the rename version (placeholder if version not yet picked — finalized in T035). Entry MUST: (a) title or summary names SafeSignal, (b) identify the rename as the primary change, (c) link to the README migration note, (d) restate the behavior-preservation statement from `contracts/migration-note.md` Element G (maps R-007 / FR-010 / SC-006)
- [ ] T017 [P] [US2] Update `.specify/memory/constitution.md` to name the project as SafeSignal at the title or preamble level (research.md found zero literal legacy-name matches; this is a minimal identity-line addition rather than a body replacement). Preserve all 7 principles verbatim. Keep version `1.2.0`. `Last Amended` MAY bump to 2026-05-28 (maps R-011 / FR-016 / FR-017 / SC-007)

**Checkpoint**: US2 complete — migration story discoverable end-to-end across README, docs, CHANGELOG, and constitution.

---

## Phase 5: User Story 3 — Examples + release-facing surfaces reflect SafeSignal (Priority: P3)

**Goal**: Every example project's metadata + inline `index.ts`
headers + the shared example helper + every forward-going feature
spec's `quickstart.md` names SafeSignal and uses
`@tallyrow/safesignal[/subpath]` in code.

**Independent Test**: After this phase, both example projects'
`package.json` `description` fields name SafeSignal; both example
`index.ts` header doc comments name SafeSignal and every `import`
statement uses `@tallyrow/safesignal[/subpath]`;
`examples/shared/beacon-transport.ts` JSDoc + `import type` use
`@tallyrow/safesignal[/subpath]`; both feature-001 and feature-002
`quickstart.md` files identify SafeSignal and use
`@tallyrow/safesignal[/subpath]` imports.

### Implementation for User Story 3

- [ ] T018 [P] [US3] Update `examples/host-app/package.json` `description` to identify SafeSignal and the example's role (single-app consumer). Example: `"Single-app consumer example for SafeSignal (@tallyrow/safesignal)."` (maps R-008 / FR-011)
- [ ] T019 [P] [US3] Update `examples/host-app/index.ts` header doc comment to name SafeSignal in the first paragraph; update every `import` statement to use `@tallyrow/safesignal` (default) or `@tallyrow/safesignal/transport-beacon` (subpath) (maps R-009 / FR-013)
- [ ] T020 [P] [US3] First run `ls examples/host-app/README.md` to confirm presence. If the file exists and references the legacy name, update identity references to SafeSignal. If the file is absent or contains no legacy refs, mark the task a confirmed no-op and proceed (FR-015)
- [ ] T021 [P] [US3] Update `examples/federated-module/package.json` `description` to identify SafeSignal and the example's role (federated module consumer). Example: `"Federated module consumer example for SafeSignal (@tallyrow/safesignal)."` (maps R-008 / FR-012)
- [ ] T022 [P] [US3] Update `examples/federated-module/index.ts` header doc comment to name SafeSignal in the first paragraph; update every `import` statement (including the standalone-iteration block at the bottom of the file) to use `@tallyrow/safesignal[/subpath]` (maps R-009 / FR-014)
- [ ] T023 [P] [US3] Update `examples/federated-module/README.md` identity references to SafeSignal (maps R-010 / FR-015)
- [ ] T024 [P] [US3] Update `examples/shared/beacon-transport.ts` — JSDoc at line 33 (`import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing'` → `from '@tallyrow/safesignal/testing'`) and `import type` at line 42 (`from '@your-org/frontend-logging-sdk'` → `from '@tallyrow/safesignal'`). No other lines change
- [ ] T025 [P] [US3] Update `specs/001-structured-logging-core/quickstart.md` — identity references → SafeSignal; every `import` statement → `@tallyrow/safesignal[/subpath]`; flow and code structure preserved (maps R-006 / FR-009)
- [ ] T026 [P] [US3] Update `specs/002-beacon-transport/quickstart.md` — identity references → SafeSignal; every `import` statement → `@tallyrow/safesignal[/subpath]`; flow and code structure preserved (maps R-006 / FR-009)
- [ ] T027 [P] [US3] Scan `.specify/templates/**/*.md` for any literal `frontend-logging-sdk` or `@your-org` references. If found, update each to SafeSignal / `@tallyrow/safesignal`. If grep returns zero matches (as research.md anticipates — templates use generic terms), this task is a confirmed no-op (FR-019)

**Checkpoint**: US3 complete — every forward-going consumer-surface file uses the SafeSignal identity.

---

## Phase 6: Polish & Verification (Run all 4 contracts)

**Purpose**: Run the four contracts from `contracts/`. Each invariant
must PASS before the rename feature can be considered complete.

- [ ] T028 Re-run `npm run build` from a clean state (`rm -rf dist/ && npm run build`). Capture post-rename gzipped sizes via `gzip -c dist/index.mjs | wc -c` and `gzip -c dist/transport-beacon.mjs | wc -c`. Append to `specs/003-rename-safesignal/baselines.md` under a "## Post-rename measurements" section
- [ ] T029 [P] Verify `contracts/bundle-invariance.md`: assert `abs(post_index_gz - baseline_index_gz) <= 1024` AND `abs(post_tb_gz - baseline_tb_gz) <= 1024`. Record PASS / FAIL with the actual deltas into `specs/003-rename-safesignal/baselines.md`. On FAIL, investigate the cause before proceeding (maps R-013 / FR-026 / SC-009)
- [ ] T030 [P] Run `npm test` from repo root; verify `contracts/test-suite-invariance.md`: file count / passing count / todo count / failing count / unhandled count must each match the T002 baseline exactly. Record PASS / FAIL into `specs/003-rename-safesignal/baselines.md`. On FAIL, investigate (maps R-012 / FR-021 / FR-027 / SC-008)
- [ ] T031 [P] Confirm the existing dependency-pins + bundle-shape security tests pass with unchanged assertion counts: `npm test -- tests/contract/dependency-pins.test.ts tests/security/bundle-shape.security.test.ts tests/security/transport-beacon-bundle-shape.security.test.ts`. Record PASS / FAIL into `specs/003-rename-safesignal/baselines.md` (maps R-015 / R-016 / SC-010)
- [ ] T032 Run the legacy-name audit per `contracts/legacy-name-audit.md` — execute the reference shell one-liner from the contract document against the in-scope globs. Expected outcome: zero matches, OR all matches sit inside the README migration-note block (T014) and the CHANGELOG entry (T016). Any match outside an allowed migration-context callout triggers a fix-and-rerun loop. Record audit output + PASS / FAIL into `specs/003-rename-safesignal/baselines.md` (maps R-014 / FR-025 / SC-002 / SC-011)
- [ ] T033 Quickstart smoke validation: walk `specs/003-rename-safesignal/quickstart.md` end-to-end against the renamed `package.json`. Verify every install/import statement is consistent with the post-rename state. Optionally `npm pack` and link the tarball into a scratch directory to confirm `import { createLogger } from '@tallyrow/safesignal'` resolves
- [ ] T034 [P] Create `specs/003-rename-safesignal/checklists/final-review.md` recording: (a) the four contracts' PASS / FAIL outcomes, (b) pre-rename vs post-rename baseline numbers (bundle sizes + test counts), (c) one-line acceptance statement, (d) the rename version that ships
- [ ] T035 Bump `package.json` `version` per Assumptions (major version bump because import strings are a breaking change for consumers). Update the rename-version placeholder in `README.md` migration note (T014) and in `CHANGELOG.md` (T016) to match the final version string. Re-run T032 audit one more time to catch any newly-introduced placeholder references

**Checkpoint**: All four contracts PASS, version bumped, final-review checklist written. Rename feature complete and ready for merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001-T002)**: No dependencies. MUST complete first so baselines are locked before any consumer-facing file changes.
- **Phase 2 (Foundational, T003)**: External GitLab UI action. T003 must complete before T007 (the `package.json` `repository` update) can land.
- **Phase 3 (US1, T004-T013)**: T007 depends on T003. T004-T012 can otherwise land in any order. T013 is the US1 audit gate and runs last in the phase.
- **Phase 4 (US2, T014-T017)**: T014 (README migration note) depends on US1's README edits (T009-T012) being in place — write the migration note as a final-pass addition to the README. T015-T017 are independent of T014 and can run in parallel with it.
- **Phase 5 (US3, T018-T027)**: Independent of US2 (different files). Can be picked up immediately after US1's T013 audit gate passes. All US3 tasks are [P] across distinct files.
- **Phase 6 (Polish, T028-T035)**: Depends on all user stories complete. T028 (post-rename build) must run before T029/T031. T032 (audit) must run after T014 + T016 + all US3 file edits.

### User Story Dependencies

- **US1 (P1)**: Depends on Setup + Foundational. No dependencies on other stories.
- **US2 (P2)**: Depends on Setup + Foundational + US1 (specifically the README's H1/paragraph/install/imports must be in place before T014 attaches the migration note).
- **US3 (P3)**: Depends on Setup + Foundational only. Can run **in parallel with US2** because different files are touched.

### Within Each User Story

- All US tasks edit distinct files (or distinct fields within `package.json` — these are mutually exclusive line-level edits and serialize naturally in a single edit pass)
- US2's T014 sequences after US1's T009-T012 (same file: `README.md`)
- US3's tasks are [P] across the `examples/` subtree, the shared transport file, and the two feature-spec quickstarts

### Parallel Opportunities

- **Setup**: T001 / T002 are [P] (different commands, independent measurements)
- **US1**: T008-T012 are largely [P] (all edit `README.md`, so serialize; T008 edits `package.json` `homepage` only)
- **US2**: T015 / T016 / T017 are all [P] (different files: `docs/safe-logging.md`, `CHANGELOG.md`, `.specify/memory/constitution.md`); T014 edits `README.md` and depends on US1 T009-T012
- **US3**: T018-T027 are all [P] (entirely distinct files)
- **Polish**: T029 / T030 / T031 are [P] read-only verifications; T028 must complete first

### Parallel Example: User Story 3

```bash
# Different files across examples/ and specs/*/quickstart.md;
# all can run concurrently:
Task: T018 examples/host-app/package.json description
Task: T019 examples/host-app/index.ts header + imports
Task: T021 examples/federated-module/package.json description
Task: T022 examples/federated-module/index.ts header + imports
Task: T023 examples/federated-module/README.md identity refs
Task: T024 examples/shared/beacon-transport.ts JSDoc + import type
Task: T025 specs/001-structured-logging-core/quickstart.md
Task: T026 specs/002-beacon-transport/quickstart.md
Task: T027 .specify/templates/ scan (likely no-op)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) — baselines committed.
2. Complete Phase 2 (Foundational) — GitLab slug renamed externally; new URL captured.
3. Complete Phase 3 (US1) — `package.json` metadata + README discovery path identifies SafeSignal.
4. **STOP and VALIDATE**: Local inspection of `package.json` + the rendered `README.md` shows SafeSignal as the discovery identity end-to-end. Run T013's partial audit.
5. The MVP is shippable here: a consumer hitting `package.json` or the README sees SafeSignal everywhere. The migration note (US2) and examples + quickstarts (US3) are additive and ship in the same PR but represent additional polish, not blockers for the MVP-level "rename complete" claim.

### Incremental Delivery

1. Setup + Foundational → baselines locked + GitLab slug renamed
2. US1 → package metadata + README discovery path (MVP)
3. US2 → migration story discoverable across README, docs, CHANGELOG, constitution
4. US3 → examples + forward-going quickstarts identify SafeSignal
5. Polish → run all 4 invariance gates, bump version, write final-review

### Single-Developer Linear Strategy

The rename is mechanical; verification is sequential. A single
developer can run phases strictly in order with a commit after each
task. Per the auto-commit-per-task cadence from the user's memory:
commit at the end of each task without asking; the
`[Spec Kit] T### — <one-line summary>` convention from features 001
+ 002 applies.

---

## Notes

- [P] tasks edit different files and have no inter-task dependencies.
- No new test files are added by this feature (FR-021 prohibits
  test-logic changes). Verification is the three invariance contracts
  + the grep audit + the migration-note content contract.
- `specs/003-rename-safesignal/baselines.md` is the scratch file
  where the agent records pre- and post-rename measurements. It
  ships with the merge so the audit trail is preserved.
- Commit after each task or logical group; the `[Spec Kit] T### —
  <one-line summary>` convention applies.
- T003 (GitLab slug rename) is a **maintainer-side ops action**.
  The agent emits the instruction and waits for the user to report
  the new repository URL before T007 can land.
- T035 (version bump) is the final task because the chosen version
  string flows into the README migration note (T014) and the
  CHANGELOG entry (T016) — finalize those references after the
  version is picked.
- Avoid: editing `src/**` or `tests/**` (out of scope per FR-020 /
  FR-021); editing archival specs under `specs/001-*` or
  `specs/002-*` outside of each one's `quickstart.md` (out of scope
  per FR-018); editing the dormant OTel adapter namespace
  constants (`FLSDK_EVENT_KEY`, `LOGGER_NAME`) — future-work.
- FR-018's optional "originally authored under the project's former
  name" callout at the top of each historical `spec.md` is
  **intentionally not implemented** in this feature. The spec says
  the callout MAY be added but is not required; the archival specs
  remain unedited as point-in-time records, and the README +
  CHANGELOG migration notes carry the legacy-to-SafeSignal mapping
  for any consumer arriving via a stale link.
