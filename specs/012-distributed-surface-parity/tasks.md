# Tasks: Enforce Distributed-Surface Parity with exports/docs

**Input**: Design documents from `/specs/012-distributed-surface-parity/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: REQUIRED. The gate **is** a Vitest contract test. Its inline pure `checkParity` helper is
unit-tested with synthetic drifted inputs to prove fail-closed behavior without mutating the real
package; a real-package assertion confirms the live surface is honest. There is no `src/` change.

**Organization**: Tasks are grouped by user story (from spec.md) so each story is an independently
testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

One new test at `tests/contract/distributed-surface.contract.test.ts` (TypeScript — the pure
`checkParity` helper lives inline, so there is no `.mjs`/`.d.mts` boundary). The documented surface
contract already exists at `specs/012-distributed-surface-parity/contracts/distributed-surface.md`
(produced in planning). CI lives in `.github/workflows/`, docs at root (`CONTRIBUTING.md`). No
`src/`, `exports`, or `files` change.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The one project-level addition the gate needs.

- [X] T001 [P] Register `"surface:check": "vitest run tests/contract/distributed-surface.contract.test.ts"` in `package.json` `scripts` (the documented local entrypoint — no new dependency).

> **Foundational phase**: none. The documented surface contract — the source of truth the gate
> compares against — was produced in planning at
> `specs/012-distributed-surface-parity/contracts/distributed-surface.md`. No other blocking
> prerequisite exists; user-story work can begin immediately after Setup.

---

## Phase 3: User Story 1 — A broken or dishonest distributed surface cannot ship (Priority: P1) 🎯 MVP

**Goal**: A removed/renamed `exports` target (doesn't ship) or a stray packaged file (rides along)
fails the gate closed, and the gate blocks merge and release.

**Independent Test**: Feed `checkParity` a synthetic surface with a missing target and one with a
stray `src/` file → both fail; the real package passes; the test runs in the `dependency-pins` CI
job (quickstart Walkthroughs 1 & 2).

### Tests for User Story 1 ⚠️ (write the failing cases first)

- [X] T002 [US1] In `tests/contract/distributed-surface.contract.test.ts`, implement the inline pure helper `checkParity(packedFiles, pkg)` returning `{ missingTargets, strayFiles, pass }` per `contracts/distributed-surface.md` + `data-model.md`: derive declared targets from `pkg.exports[*].{types,import,require}` + `main`/`module`/`types` (strip leading `./`); `missingTargets` = targets not in `packedFiles`; `strayFiles` = packed paths failing the in-surface rule (`startsWith('dist/')` OR `=== 'package.json'` OR `/^(README|LICEN[CS]E)/i`).
- [X] T003 [US1] Unit cases over `checkParity` proving fail-closed: a synthetic surface with a missing declared target → `pass === false` naming it; a synthetic packed set containing `src/secret.ts` → `pass === false` naming it; a clean synthetic surface (all targets present, only `dist/**` + npm metadata) → `pass === true`; **and a resolution-support case** (FR-006): a packed set whose `dist/` files include a source map (`dist/index.mjs.map`), a CommonJS declaration (`dist/index.d.cts`), and the shared chunk (`dist/types-abc.d.ts`) — none named by any `exports` key — still `pass === true` (no false positive on normal build output) (SC-001/SC-002).

### Implementation for User Story 1

- [X] T004 [US1] Real-package assertion in the same test: spawn `npm pack --dry-run --json` (`node:child_process`), parse `[0].files[].path` → packed set, read the actual `package.json`, and assert `checkParity(packed, pkg).pass` is true — the live distributed surface is honest (FR-001). **Parse stdout only** (npm writes notices to stderr, JSON to stdout); set a generous per-test timeout (e.g. 30s) for the spawned process; note `npm pack` runs `prepare`/`prepack` lifecycle — none are defined in `package.json`, so it will not rebuild (the T006 `dist/` guard ensures the built surface is present).
- [X] T005 [US1] Wire the test into the `dependency-pins` job's `npm test --` invocation in **both** `.github/workflows/ci.yml` and `.github/workflows/release.yml`, so a drifted surface can't merge (via `ci-success`) or publish (FR-008). Give that test step a descriptive `name:` (e.g., "Packaging contracts: dependency-pins, bundle-shape, distributed-surface parity") so a failure surfaces that the parity gate ran (discoverability).

**Checkpoint**: US1 fully functional — missing-target/stray-file drift fails closed locally and blocks merge + release in CI.

---

## Phase 4: User Story 2 — Reproduce the verdict locally before pushing (Priority: P2)

**Goal**: One documented command yields the same verdict locally and in CI, with an honest
build prerequisite (Principle IX).

**Independent Test**: Remove `dist/` and run `npm run surface:check` → loud, actionable failure;
run locally vs the `dependency-pins` CI job for the same commit → identical verdict (quickstart
Walkthroughs 5 & 6).

### Tests for User Story 2 ⚠️

- [X] T006 [US2] Add an honest `dist/` prerequisite guard (`beforeAll`) to `tests/contract/distributed-surface.contract.test.ts`: if `dist/index.mjs` is absent, fail with an actionable "run `npm run build` first" message — never a silent pass/skip (Principle IX).

### Implementation for User Story 2

- [X] T007 [US2] Confirm `npm run surface:check` is the single documented entrypoint producing the **identical verdict** as the CI run — the CI `dependency-pins` job runs the *same test file* via `npm test --`, not the literal `surface:check` command (an accepted form difference: Principle IX requires identical *verdict* for the same source, which the shared test guarantees; there is no CI-only shim or divergent logic); confirm `npm pack --dry-run --json` is network-free and deterministic; document this parity in `quickstart.md` (Walkthrough 6).

**Checkpoint**: US1 + US2 pass independently; the gate is reproducible at the desk with an honest prerequisite.

---

## Phase 5: User Story 3 — The contract is documented and failures are actionable (Priority: P3)

**Goal**: The shipped subpath set must match the documented public-subpath set; failures name the
specific drift; and the rule is traceable to its check.

**Independent Test**: Add an undocumented `exports` key → the gate fails naming it; read a failure
and confirm it names the drift + remediation; from `CONTRIBUTING.md` reach the enforcing check in
one hop (quickstart Walkthroughs 4 & 7).

### Tests for User Story 3 ⚠️

- [X] T008 [US3] Extend `checkParity` with the **subpath-drift** dimension — `subpathDrift: { undocumented, missing }` comparing `Object.keys(pkg.exports)` against the documented `PUBLIC_SUBPATHS` constant (`['.', './testing', './transport-beacon', './transport-otlp']`, referencing `contracts/distributed-surface.md`); fold it into `pass`. Add unit cases: an undocumented key (`./experimental`) fails; a documented-but-missing subpath fails (FR-004/SC-004).

### Implementation for User Story 3

- [X] T009 [US3] Make the gate's failure output actionable: name each drift by class (missing target / stray file / subpath drift) and path, with the remediation from `contracts/distributed-surface.md`; assert the message content in a test so failures are never opaque (FR-009/SC-006).
- [X] T010 [US3] Add a "Distributed-surface parity" section to `CONTRIBUTING.md`: the rule, an **enforcement reference** linking Principle XI / Principle X → `npm run surface:check`, the `dependency-pins` CI job, and `specs/012-distributed-surface-parity/contracts/distributed-surface.md` (rule→check traceability, FR-010); and a note that **disabling or removing the gate is subject to the constitution amendment process** (FR-011).

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T011 Reproducible-Verification & Mechanical-Enforcement validation pass: confirm the gate runs via `npm run surface:check` with identical local/CI exit codes; confirm the test is in the `dependency-pins` job in `ci-success` **and** `release.yml` and fails closed; confirm `tests/` here meets the same typecheck/lint standards as `src/` with no tolerated relaxation introduced.
- [X] T012 [P] Supply-chain & distributed-surface validation (Principle XI): confirm `package.json` `exports`/`files`/`main`/`module`/`types` are **unchanged** by this feature; **no new dependency** was added; the new test + contract artifacts are not under `dist/` (`npm pack --dry-run --json` still lists only the prior file set — nothing new ships); confirm this feature closes the constitution Sync Impact TODO **item (b)**.
- [X] T013 [P] Security/privacy validation (FR-012): confirm the test, `contracts/distributed-surface.md`, and the gate's failure output contain only file paths and packaging metadata — no secrets, tokens, consumer data, or absolute machine paths (`npm pack` JSON emits repo-relative paths).
- [X] T014 Run all `quickstart.md` walkthroughs (1–7) and confirm each acceptance criterion; record results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational**: none (the documented surface contract already exists from planning).
- **User Stories (Phases 3–5)**: US1 first (defines `checkParity` + the test file + wiring). US2 and US3 build on US1's test file (add the prerequisite guard, the subpath dimension, messages, docs); once US1's helper + file exist they are independently testable.
- **Polish (Phase 6)**: depends on the user stories being complete.

### User story dependencies

- **US1 (P1)**: needs Setup only. The MVP — `checkParity` (missing-target + stray-file) + real-package assertion + CI/release wiring.
- **US2 (P2)**: needs US1's test file (T002/T004) to add the `dist/` prerequisite guard and confirm parity.
- **US3 (P3)**: needs US1's `checkParity` (T002) to extend with the subpath dimension and message hardening; the `CONTRIBUTING.md` doc (T010) is otherwise independent.

### Within each story

- Tests (T003, T006, T008's cases) are written to FAIL before/with their implementation.
- The pure `checkParity` helper before its unit cases and the real-package assertion; the test file before CI wiring.

### Parallel opportunities

- T001 (Setup) is [P].
- Polish T012 and T013 are [P] (independent verification tasks, different concerns).
- The single test file is built up sequentially across US1→US2→US3 (same file), so those implementation tasks are not mutually [P]; `CONTRIBUTING.md` (T010) can proceed in parallel with the test work.

---

## Parallel Example: User Story 1

```bash
# Author the helper and its failing unit cases first (same file, sequential):
#   T002 checkParity (missing/stray) → T003 fail-closed unit cases → T004 real-package assertion
#   → T005 CI + release wiring
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → 2. Phase 3 US1 (`checkParity` + fail-closed cases + real-package assertion + CI/release wiring).
3. **STOP and VALIDATE**: a missing target or stray file fails the gate; the real package passes; the `dependency-pins` job runs it on merge and release. This alone closes the core of issue #6.

### Incremental delivery

1. Setup → entrypoint ready.
2. US1 → distributed-surface parity enforced & merge/release-blocking (MVP).
3. US2 → reproducible locally with an honest prerequisite.
4. US3 → subpath↔docs parity + actionable failures + rule→check traceability.
5. Polish → validation passes.

---

## Notes

- [P] = different files, no incomplete-task dependency.
- No `src/` runtime change and **no packaging change**: `exports`, `files`, `main`/`module`/`types`
  are untouched; the feature only adds verification. The new test/contract do not ship (not under
  `dist/`).
- Unlike Feature 011, the gate is a single TypeScript contract test with an inline pure helper — no
  committed baseline, no `.mjs`/`.d.mts` boundary.
- Commit after each task or logical group; the whole feature lands via one PR gated by the
  (parity-test-including) `dependency-pins` job within `ci-success`.
