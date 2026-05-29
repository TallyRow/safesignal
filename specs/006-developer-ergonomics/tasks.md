# Tasks: Developer Ergonomics & Supply-Chain Hygiene

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Branch**: `006-developer-ergonomics`

## Format: `[ID] [P?] [Story] Description`

- **[P]** = parallelizable (different files, no dependency on an incomplete task)
- **[US#]** = user-story phase task; Setup/Foundational/Polish carry no story label
- **Maintainer** = GitLab/credential action that must be done in a web UI (like F005 T002–T007)

## Path Conventions

Repo-root tooling/config: `.gitlab-ci.yml`, `biome.json`, `renovate.json`,
`.gitlab/`, `scripts/hooks/`, `package.json`, `vitest.config.ts`. No `src/**`
runtime change beyond the one-time mechanical format baseline.

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `@biomejs/biome` as an exact-pinned devDependency in `package.json` and run `npm install` to refresh `package-lock.json`
- [X] T002 [P] Create `biome.json` (lint recommended rules + formatter; `includes` for `src/`, `tests/`, root configs; ignore `dist/`, `node_modules/`, `.specify/`, `*.d.ts`, lockfiles). Pick formatter options to minimize baseline churn where reasonable
- [X] T003 [P] Add `package.json` scripts: `lint` (`biome lint`), `format` (`biome format --write`), `format:check` (`biome format`), `test:coverage` (`vitest run --coverage`)
- [X] T004 Capture pre-feature baselines into `specs/006-developer-ergonomics/baselines.md`: `npm test` headline (48/1,088/10/0/0); gzipped `dist/index.mjs` (8,162), `dist/transport-beacon.mjs` (3,101), `dist/testing.mjs` (2,724); coverage (95.16/95.28/98.47/95.16). Same `## Pre-feature baseline` pattern as F003–F005

## Phase 2: Foundational (Blocking Prerequisites)

**Blocks US2 (lint/format gate) and US3 (hooks) — neither can gate a dirty tree.**

- [X] T005 Apply the one-time format baseline: run `npm run format` across the whole tree; review the diff is purely mechanical (no logic change); commit as a dedicated "format baseline" commit
- [X] T006 Prove the baseline is behavior-neutral and bundle-safe: `npm test` still 48/1,088/10/0/0; `npm run build` then compare gzipped bundle sizes — MUST equal the T004 baselines; `npm run lint` + `npm run format:check` exit 0. Record results in `baselines.md` (maps FR-008, FR-017, FR-018)

---

## Phase 3: User Story 1 — Supply-chain scanning (Priority: P1) 🎯 MVP

**Goal**: every MR + `main` push is scanned for secrets and dependency advisories.
**Independent test**: a planted secret + a planted vulnerable dep are caught; a clean MR + the existing fake fixtures produce zero findings.

- [ ] T007 [P] [US1] Create `.gitlab/secret-detection-ruleset.toml` allowlisting known-benign fakes: `src/testing/secret-fixtures.ts`, the security/secret test files, `AKIAIOSFODNN7EXAMPLE`, and the synthetic private-range IPs in the URL-scrubber tests (maps FR-002, SC-002)
- [ ] T008 [US1] Extend `.gitlab-ci.yml`: `include:` the pinned GitLab **Secret-Detection** template; ensure it runs under MR + default-branch rules and consumes the T007 ruleset; `glab ci lint` after editing (maps FR-001)
- [ ] T009 [US1] Extend `.gitlab-ci.yml`: `include:` the pinned GitLab **Dependency-Scanning** template against `package-lock.json`; runs under MR + default-branch rules; `glab ci lint` (maps FR-003, FR-004)
- [ ] T010 [US1] **Maintainer/verify**: on a dogfood MR, confirm both scanners run on the free tier, the allowlist yields **zero** false positives on the committed tree, and a deliberately-planted secret + vulnerable dependency are each reported. Record outcomes in `baselines.md` (maps SC-001, SC-002)

---

## Phase 4: User Story 2 — Lint + format CI gate (Priority: P1)

**Goal**: lint + format enforced as blocking CI jobs on every MR.
**Independent test**: committed tree passes both; a planted lint/format violation fails the matching job. Depends on Phase 2 (clean baseline).

- [ ] T011 [US2] Extend `.gitlab-ci.yml`: add a `lint` job (`npm run lint`) under `.quality_gate_rules` (`node:22-alpine`, `npm ci`, no `needs: build`); `glab ci lint` (maps FR-006)
- [ ] T012 [US2] Extend `.gitlab-ci.yml`: add a `format-check` job (`npm run format:check`) under `.quality_gate_rules`; `glab ci lint` (maps FR-006)
- [ ] T013 [US2] Verify on the dogfood MR: both jobs are green on the clean tree; a planted lint error fails `lint` and a planted format drift fails `format-check`, each naming the file. Record in `baselines.md` (maps SC-003)

---

## Phase 5: User Story 3 — Local pre-commit hooks (Priority: P2)

**Goal**: lint/format/DCO caught at commit time. Depends on Phase 1 (Biome scripts) + Phase 2 (clean baseline).
**Independent test**: with hooks enabled, a staged violation or a missing sign-off blocks the commit; a clean signed-off commit succeeds.

- [ ] T014 [P] [US3] Create `scripts/hooks/pre-commit` (pure shell): compute staged lintable files (`git diff --cached --name-only --diff-filter=ACM`), run Biome lint + format-check on them; BLOCK on findings with a fix pointer; never re-stage (maps FR-009, FR-010)
- [ ] T015 [P] [US3] Create `scripts/hooks/commit-msg` (pure shell): fail if `$1` lacks a `Signed-off-by: Name <email>` trailer; print the `git commit -s` remedy (maps FR-009, FR-010)
- [ ] T016 [US3] Set executable bits and commit them: `chmod +x scripts/hooks/* && git update-index --chmod=+x scripts/hooks/pre-commit scripts/hooks/commit-msg`
- [ ] T017 [US3] Document the one-time opt-in (`git config core.hooksPath scripts/hooks`) + the Biome workflow in `CONTRIBUTING.md`; note CI remains authoritative (maps FR-011)
- [ ] T018 [US3] Verify: enable hooks, confirm a staged format violation blocks commit, a missing sign-off blocks commit, and a clean signed-off commit succeeds (maps SC-004)

---

## Phase 6: User Story 4 — Renovate dependency automation (Priority: P2)

**Goal**: weekly dependency-update MRs, batched. Independent of US1–US3, US5.
**Independent test**: the scheduled pipeline opens batched/major MRs (or a clean no-op), each running the full quality gate.

- [ ] T019 [US4] Create `renovate.json`: extend a base preset; weekly `schedule`; group minor/patch into one MR, isolate each major; target `main`; enable auto-rebase + lockfile maintenance (maps FR-012)
- [ ] T020 [US4] Add the Renovate runner to CI gated on `$CI_PIPELINE_SOURCE == "schedule"` (separate `include` or job, off the per-MR critical path); `glab ci lint` (maps FR-013)
- [ ] T021 [US4] **Maintainer**: create a `safesignal`-scoped GitLab Project Access Token (Developer role, `api` scope) and store it as the masked/protected CI variable `RENOVATE_TOKEN`. MUST NOT have npm publish rights (maps FR-014, FR-019)
- [ ] T022 [US4] **Maintainer**: create the weekly **scheduled pipeline** (Settings → CI/CD → Pipeline schedules) targeting `main`
- [ ] T023 [US4] Verify: run the scheduled pipeline manually; confirm Renovate opens correctly-batched MRs (minor/patch grouped, majors separate) and each runs the full quality gate; or a clean no-op when nothing is outdated (maps SC-005)

---

## Phase 7: User Story 5 — Coverage gating (Priority: P3)

**Goal**: enforce the **existing** `vitest.config.ts` thresholds in CI. Independent of other stories.
**Independent test**: coverage job passes at the ~95% baseline; a planted coverage drop below a threshold fails it.

- [ ] T024 [US5] Extend `.gitlab-ci.yml`: add a `coverage` job (`npm run test:coverage`) under `.quality_gate_rules` (`node:22-alpine`, `npm ci`, no `needs: build`); `glab ci lint` (maps FR-015)
- [ ] T025 [US5] Verify on the dogfood MR: the coverage job passes at baseline; a planted under-threshold change fails it with a per-package report. Record in `baselines.md` (maps SC-006)
- [ ] T026 [P] [US5] Document the coverage thresholds + the relaxation-review process in `CONTRIBUTING.md` (or `contracts/quality-gates.md` reference). Note thresholds were retained from `vitest.config.ts` (90% global; 100% on the four pipeline-security files), stronger than baseline−2pp (maps FR-016)

---

## Phase 8: Polish & Cross-Cutting

- [ ] T027 Dogfood MR: open one MR that exercises ALL new gates (`lint`, `format-check`, `coverage`, `secret_detection`, `dependency_scanning`) alongside the existing F005 gates; confirm the full pipeline is green. Record the pipeline URL + per-job verdicts in `baselines.md` (the F005 lesson: never trust an un-run pipeline)
- [ ] T028 [P] Post-feature invariance: `npm test` = 48/1,088/10/0/0; gzipped bundles identical to T004; coverage ≥ thresholds. Record in `baselines.md` (maps SC-007)
- [ ] T029 [P] Confirm local↔CI reproducibility: `npm run lint`, `npm run format:check`, `npm run test:coverage` give the same pass/fail on a fresh clone as their CI jobs (maps SC-008, FR-021)
- [ ] T030 Write `specs/006-developer-ergonomics/checklists/final-review.md`: gate outcomes, maintainer-ops status (T021/T022), invariance numbers, acceptance statement
- [ ] T031 **Decision**: ratify constitution **v1.3.0** (merge the `constitution-v1.3.0` branch) so the spec's Principle VIII/IX citations resolve on `main` — or explicitly document deferral. Soft prerequisite; not blocking implementation

---

## Dependencies & Execution Order

### Phase order

1. **Setup (T001–T004)** → blocks everything.
2. **Foundational (T005–T006)** — format baseline → blocks US2 + US3.
3. **User stories** (after their prerequisites):
   - **US1 (T007–T010)** — independent of the baseline; can start right after Setup. 🎯 P1.
   - **US2 (T011–T013)** — needs Foundational (clean tree). P1.
   - **US3 (T014–T018)** — needs Setup (scripts) + Foundational (clean tree). P2.
   - **US4 (T019–T023)** — independent; maintainer ops (T021/T022) gate verification. P2.
   - **US5 (T024–T026)** — independent; thresholds already exist. P3.
4. **Polish (T027–T031)** — dogfood depends on all gate tasks (T008/T009/T011/T012/T024).

### Parallel opportunities

- After Setup: **US1** and **US4** (`renovate.json`) can proceed in parallel with the Foundational baseline (they don't touch `src/`).
- T002/T003 are [P] (different files). T007 (allowlist) [P]. T014/T015 (two hook files) [P]. T026/T028/T029 [P].

### MVP scope

The two **P1** stories together are the MVP: **US1 (supply-chain scanning)** +
**US2 (lint/format gate)** — the public-repo guardrails + the quality floor.
US3–US5 are incremental hardening on top.

## Implementation Strategy

- **Increment 1 (MVP)**: Setup → Foundational baseline → US1 + US2 → dogfood.
  Ships the supply-chain scanning + lint/format gate.
- **Increment 2**: US3 hooks (faster local loop) + US5 coverage job (low-risk;
  thresholds already exist).
- **Increment 3**: US4 Renovate (needs maintainer PAT + scheduled pipeline).
- Each increment is an independently mergeable MR that keeps the pipeline green.
- Carry every F005 lesson: `glab ci lint` after each `.gitlab-ci.yml` edit, and a
  real dogfood run before trusting any new gate.
