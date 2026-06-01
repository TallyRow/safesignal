# Tasks: Enforce Deprecate-Before-Remove for the Public API

**Input**: Design documents from `/specs/011-deprecate-before-remove/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. The testable units here are the gate's pure verdict logic and the surface
extractor; contract tests target those (there is no `src/` runtime change in this feature).

**Organization**: Tasks are grouped by user story (from spec.md) so each story is an
independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

Package layout at repo root: tooling under `scripts/api/` (Node ESM; no new Bash script), committed contract
artifacts under `api/`, tests under `tests/contract/`, CI under `.github/workflows/`, docs at
root (`CONTRIBUTING.md`). `api/` is **not** in `package.json` `files` (`["dist"]`) — nothing
new ships.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the directories and test fixtures the rest of the feature builds on.

- [X] T001 Create `api/` and `scripts/api/` directories; confirm `package.json` `files` stays `["dist"]` so `api/` is never published (record the check in the PR description).
- [X] T002 [P] Add gate test fixtures under `tests/contract/fixtures/api-surface/` — sample `baseline.json`, `current-removed.json`, `current-removed-deprecated.json`, `current-added.json`, `current-changed.json`, `allow.json`, plus edge-case fixtures for the spec's Edge Cases: `current-entrypoint-removed.json` (whole `exports` subpath gone → every symbol REMOVED), `current-add-then-removed.json` (symbol never in baseline, absent in current → no-op), and a missing-baseline scenario (no `baseline.json` → PASS) (per `contracts/api-surface-schema.md`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The surface extractor and the seeded baseline — every user story depends on the
surface representation and on `api/surface.json` existing.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Implement the surface extractor `scripts/api/extract-surface.mjs` (Node ESM): load the four built `dist/*.d.ts` entry points via the bundled `typescript` compiler API, enumerate exported symbols (`checker.getExportsOfModule`), and emit a deterministic `PublicSurface` JSON — per-symbol `{ entry, name, kind, signature, deprecated }`, sorted by `(entry,name)`, normalized signatures, `@deprecated` read from JSDoc tags, no absolute paths/secrets (per `research.md` R1/R3/R4/R6, `data-model.md`, `contracts/api-surface-schema.md`). Ship a sibling `scripts/api/extract-surface.d.mts` declaration so the TS tests import it typed (keeps `typecheck:tests` green without `allowJs`).
- [X] T004 Register `"api:extract": "node scripts/api/extract-surface.mjs"` in `package.json`; run `npm run build && npm run api:extract` to seed `api/surface.json` (the v1.3.0 surface) and create `api/surface-allow.json` = `[]`; verify a second `api:extract` re-run is byte-identical and `npm pack --dry-run` does **not** list `api/`.

**Checkpoint**: Surface extraction works and a frozen baseline exists — gate, repro, and docs can proceed.

---

## Phase 3: User Story 1 — Undeprecated breaking removal cannot merge (Priority: P1) 🎯 MVP

**Goal**: A removed or incompatibly-changed public symbol fails the gate closed unless it was
`@deprecated` in the frozen baseline, and the gate blocks merge via `ci-success`.

**Independent Test**: Delete a non-deprecated public export (e.g., `scrubUrl`), build, run
`npm run api:check` → non-zero with the symbol named; restore → passes; the `api-surface` CI job
blocks merge (quickstart Walkthrough 1).

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T005 [P] [US1] Contract test `tests/contract/api-surface-gate.contract.test.ts` exercising the verdict logic over the Phase-1 fixtures: REMOVED non-deprecated → FAIL; REMOVED baseline-deprecated → PASS; ADDED → PASS; CHANGED (no allow, not deprecated) → FAIL; CHANGED with matching allow-entry → PASS; CHANGED baseline-deprecated → PASS; **plus the edge cases**: whole entry-point removal → each symbol REMOVED (rule applies); add-then-remove (never in baseline) → no-op PASS; no prior baseline → PASS (seeds, nothing to break); version bump does **not** exempt a removal (rule ignores `version`).

### Implementation for User Story 1

- [X] T006 [US1] Implement the pure comparison module `scripts/api/compare-surface.mjs` (Node ESM, + sibling `compare-surface.d.mts`): `(baseline, current, allow) → GateVerdict { removed, changed, added, violations, pass }` applying the rule in `contracts/api-surface-check.md` — pure additions auto-pass; a CHANGED signature passes only via baseline `deprecated:true` or an exact-match reviewed `AllowEntry`, **never** by demanding a deprecation cycle (revised FR-005). Makes T005 pass.
- [X] T007 [US1] Implement the gate entrypoint `scripts/api/check-surface.mjs`: **guard the honest `dist/*.d.ts` prerequisite in-process** (if absent, print "run `npm run build` first" and exit non-zero — never a silent pass), read `api/surface.json` + `api/surface-allow.json`, extract the current surface via T003, call `compare-surface`, print a verdict table (bundle-invariance style), `process.exit(verdict.pass ? 0 : 1)`.
- [X] T008 [US1] Register `"api:check": "node scripts/api/check-surface.mjs"` in `package.json` — a cross-platform Node entrypoint (no Bash wrapper) so local outcomes match CI on Windows/macOS/Linux; the `dist/` prerequisite guard lives in `check-surface.mjs` (T007).
- [X] T009 [US1] Add an `api-surface` job to `.github/workflows/ci.yml` (consume the existing build artifact like other jobs; run `npm run api:check`) and add `api-surface` to the `ci-success` aggregate `needs[]` so an undeprecated breaking change cannot merge (FR-009).

**Checkpoint**: US1 fully functional — removals fail closed locally and block merge in CI.

---

## Phase 4: User Story 2 — Reproduce the verdict locally before pushing (Priority: P2)

**Goal**: One documented script yields the same verdict locally and in CI, with honest
prerequisites and deterministic output (Principle IX).

**Independent Test**: Run `npm run api:check` locally and compare to the `api-surface` CI job
for the same commit (identical verdict); run it with no `dist/` → loud, actionable failure, never
a silent pass (quickstart Walkthroughs 5 & the prerequisite path).

### Tests for User Story 2 ⚠️

- [X] T010 [P] [US2] Test `tests/contract/api-surface-prereq.contract.test.ts`: invoking the gate (`npm run api:check` / `node scripts/api/check-surface.mjs`) with `dist/*.d.ts` absent exits non-zero and prints an actionable "run `npm run build` first" message (never passes silently).
- [X] T011 [P] [US2] Test `tests/contract/api-surface-determinism.contract.test.ts`: re-extracting an unchanged build via `scripts/api/extract-surface.mjs` yields byte-identical output (sorted symbols, stable keys, trailing newline).

### Implementation for User Story 2

- [X] T012 [US2] Confirm `npm run api:check` is the single documented entrypoint with no CI-only shim: verify the `ci.yml` `api-surface` job invokes exactly `npm run api:check`; confirm the Node entrypoint runs identically on Windows/macOS/Linux (no Bash dependency) and that the TS tests resolve the `.mjs` tooling via the shipped `.d.mts` declarations under `typecheck:tests`; document local/CI parity in `quickstart.md` (Walkthrough 5). Resolve any resolver/format difference in-config, not with a skip.

**Checkpoint**: US1 + US2 both pass independently; the gate is reproducible at the desk.

---

## Phase 5: User Story 3 — Rule traceable to its check; failures actionable (Priority: P3)

**Goal**: Failures name the offending symbol(s) and the remediation, and the documented rule
references its enforcing mechanism (Principle X discoverability; FR-010, FR-011).

**Independent Test**: Trigger a failure → output names the symbol + deprecate-before-remove
steps; from `CONTRIBUTING.md`, a single hop reaches `npm run api:check` / the `api-surface`
CI job / contract (quickstart Walkthroughs 7 & the failure message).

### Tests for User Story 3 ⚠️

- [X] T013 [P] [US3] Test `tests/contract/api-surface-message.contract.test.ts`: a gate failure output names every offending symbol and includes the deprecate-before-remove remediation guidance — no opaque/unattributed failure (SC-006).

### Implementation for User Story 3

- [X] T014 [US3] Harden the failure output in `scripts/api/check-surface.mjs`: for each violation, name `(entry, name)`, its class (REMOVED/CHANGED), and the remediation (ship `@deprecated` + replacement + migration path for one minor, or revert), per `contracts/api-surface-check.md` (FR-010). Makes T013 pass.
- [X] T015 [US3] Update `CONTRIBUTING.md`: add a "Deprecating a public symbol" how-to; an **enforcement reference** linking Principle II / Principle X → `npm run api:check` (`scripts/api/check-surface.mjs`), the `api-surface` CI job, and `specs/011-deprecate-before-remove/contracts/api-surface-check.md` for rule→check traceability (FR-011); and a note that **disabling or removing the `api-surface` gate is subject to the constitution amendment process**, documenting the gate's required status as an enforced invariant (FR-012). Updating the constitution to name the mechanism is an optional patch-level refinement, not required by this feature (FR-011 clarification).

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep the baseline fresh across releases, file the deferred-scope follow-up, and run
the constitution-mandated validation passes.

- [X] T016 Release wiring + runbook (FR-007 / SC-004): add a freshness step to `.github/workflows/release.yml` asserting `api/surface.json` equals the surface extracted from the tagged commit's build (alongside `changelog-validate`); update `CONTRIBUTING.md § Cutting a release` to run `npm run api:extract`, commit the refreshed `api/surface.json`, and reset `api/surface-allow.json` to `[]` before tagging.
- [ ] T017 [P] **Named, time-bound follow-up** (Principle X): file a tracked GitHub issue "Automated structural API compatibility classification" capturing the plan.md Complexity Tracking boundary (auto-distinguish compatible widenings from incompatible signature changes so the `surface-allow.json` override can shrink), with a stated deadline of **2026-09-01**; reference it from `plan.md` Complexity Tracking.
- [X] T018 Reproducible-Verification & Mechanical-Enforcement validation pass: confirm every gate this feature documents runs through `npm run api:check` (and the release freshness step) with identical local/CI exit codes; confirm `api-surface` is in `ci-success` `needs[]` and fails closed; confirm `tests/` here meets the same typing/lint/build standards as `src/` with no tolerated relaxation introduced.
- [X] T019 Supply-chain & distributed-surface validation (Principle XI): `npm pack --dry-run` shows `api/` excluded and `exports`/`files`/`main`/`module`/`types` unchanged; confirm attested OIDC publish, signed tags, DCO, and dependency pins remain intact and **no new dependency** was added; confirm this feature closes the constitution Sync Impact TODO item (a) (deprecation-discipline now mechanically enforced).
- [X] T020 [P] Security/privacy validation (FR-013): confirm `api/surface.json`, `api/surface-allow.json`, and gate output contain only public symbol names/kinds/signatures — no secrets, tokens, consumer data, or absolute paths.
- [X] T021 Run all `quickstart.md` walkthroughs (1–7) and confirm each acceptance criterion; record results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup; **blocks all user stories** (T003 extractor + T004 baseline are prerequisites for the gate, repro, and docs).
- **User Stories (Phases 3–5)**: all depend on Foundational. US1 → US2 → US3 in priority order, but US2 and US3 only *reference* US1's gate script; once the gate exists they are independently testable.
- **Polish (Phase 6)**: depends on the user stories being complete (T016 release wiring assumes the gate + baseline exist).

### User story dependencies

- **US1 (P1)**: needs Foundational only. The MVP.
- **US2 (P2)**: needs Foundational + US1's `check-surface.mjs` entrypoint (T007/T008) to test prerequisite + determinism behavior.
- **US3 (P3)**: needs Foundational + US1's `check-surface.mjs` (T007) to harden/test failure output; docs (T015) are otherwise independent.

### Within each story

- Tests (T005, T010/T011, T013) are written to FAIL before their implementation tasks.
- Pure logic (`compare-surface.mjs`) before entrypoint (`check-surface.mjs`) before npm-script/CI wiring.

### Parallel opportunities

- T002 (fixtures) runs parallel to nothing blocking (Setup).
- Within US1, T005 (test) is [P] and authored alongside others but must precede T006.
- US2's T010 and T011 are [P] (different test files).
- Across stories after Foundational: US2 and US3 work can proceed in parallel with US1 hardening once T007/T008 land.
- Polish T017 and T020 are [P] (independent of the rest).

---

## Parallel Example: User Story 1

```bash
# Author the verdict-logic test first (it must fail before T006):
Task: "T005 Contract test for gate verdict logic in tests/contract/api-surface-gate.contract.test.ts"

# Then implement in dependency order (not parallel — same logical module chain):
#   T006 compare-surface.mjs → T007 check-surface.mjs → T008 npm entrypoint → T009 CI wiring
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (extractor + seeded baseline) → 3. Phase 3 US1.
4. **STOP and VALIDATE**: delete a public symbol → gate fails; restore → passes; CI `api-surface`
   blocks merge. This alone closes the core of issue #5.

### Incremental delivery

1. Setup + Foundational → surface + baseline ready.
2. US1 → deprecate-before-remove enforced & merge-blocking (MVP).
3. US2 → reproducible locally with honest prerequisites.
4. US3 → actionable failures + rule→check traceability.
5. Polish → release-time baseline refresh + filed follow-up + validation passes.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- No `src/` runtime change: the public package surface, `exports`, and `files` are untouched; the
  only shipped behavior change is the new CI gate (which does not affect the published artifact).
- The deferred structural-compatibility classification is **filed, not waived** (T017) — the
  documented gate is enforced today (removal hard-fail + reviewed CHANGED override).
- Commit after each task or logical group; the whole feature lands via one PR gated by the
  (now `api-surface`-including) `ci-success`.
