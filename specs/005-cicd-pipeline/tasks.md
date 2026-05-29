---
description: "Task list for the CI/CD pipeline and release workflow"
---

# Tasks: CI/CD Pipeline & Release Workflow

**Input**: Design documents from `/specs/005-cicd-pipeline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md

**Tests**: This feature does NOT add new vitest test files (FR-026
prohibits test-logic changes). The CI pipeline's `test` stage runs
the existing suite; the audit script (`contracts/audit-script.md`)
performs file-presence + content-marker checks; the **dogfood
release test** (T017) is the real proving-ground for the release
pipeline — a `v1.0.1-rc.1` signed tag exercises the full release
flow end-to-end.

**Organization**: Tasks are grouped by user story (US1 quality
gates, US2 release pipeline, US3 master→main rename, US4 docs).
Foundational phase (Phase 2) captures the maintainer-side ops
actions that block the in-repo work (GitLab UI, npm UI).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1 / US2 / US3 / US4) on user-story phases
- Include exact file paths in descriptions

## Path Conventions

Single-package TypeScript SDK at repo root. The feature adds
`.gitlab-ci.yml` at the root and a new `scripts/ci/` directory
holding 4 shell scripts. Modified files: `README.md`,
`CONTRIBUTING.md`, `GOVERNANCE.md`, `CLAUDE.md`. NO `src/**` or
`tests/**` changes.

---

## Phase 1: Setup (Capture pre-feature baselines)

**Purpose**: Lock test-suite baseline before any pipeline edits;
capture GitLab CI minute consumption baseline so post-feature
usage can be compared.

- [X] T001 Capture pre-feature baselines into a new file `specs/005-cicd-pipeline/baselines.md`: (a) run `npm test` and record the headline counts (test files / passing / todo / failing / unhandled); (b) note current GitLab CI/CD usage from the project's Settings → Usage page (maintainer-side observation — record minutes-used-this-month for the comparison after T017's dogfood run). Use the same `## Pre-feature baseline` heading pattern as F003 + F004 baselines.md

**Checkpoint**: Baseline captured. Foundational ops can begin.

---

## Phase 2: Foundational (Maintainer-side ops actions — BLOCKING)

**Purpose**: External-system prerequisites. None of these can be
performed by the agent; the maintainer executes them in the GitLab
or npm web UIs. They block downstream in-repo work that targets
`main` (US1, US3) or that requires the OIDC publish path (US2).

⚠️ **CRITICAL**: T002-T007 are **maintainer-side ops actions**.
The agent emits the instruction + verification command; the
maintainer performs the ops and confirms back. Same pattern as
F003's T003 (GitLab slug rename) and F004's tallyrow.com email
setup.

- [X] T002 **Maintainer**: rename GitLab default branch from `master` to `main` via Settings → Repository → Default branch. After save, verify with `git ls-remote --symref origin HEAD | head -1` (should print `ref: refs/heads/main`). GitLab automatically creates a `master` → `main` alias post-rename — **DO NOT actively disable this alias** in the GitLab settings; FR-021 requires it remain enabled for at least 90 days so external references with hard-coded `master` URLs continue to resolve. Blocks US1 (.gitlab-ci.yml uses `$CI_DEFAULT_BRANCH` resolving to `main`) and US3 in-repo sweep
- [X] T003 **Maintainer**: configure GitLab branch protection rules on `main` per `contracts/branch-protection-policy.md` Section "Branch protection rules on `main`". Settings → Repository → Protected branches: Allowed to merge = Maintainers; Allowed to push = No one; Allowed to force-push = No one; Allowed to delete = No one. Plus Settings → Merge requests: Pipelines must succeed = On; All threads must be resolved = On; Required approvals = 1. Verify by attempting `git push origin main` from local — should reject with "branch is protected" (maps R-011 / FR-019 / SC-007)
- [X] T004 [P] **Maintainer**: audit GitLab project Settings → CI/CD → Variables. Confirm NO variable named `NPM_TOKEN`, `NPM_PUBLISH_TOKEN`, `NODE_AUTH_TOKEN`, or any other long-lived npm credential exists. If any exist, remove them (this feature uses OIDC exclusively per FR-014). Record the verification timestamp in `baselines.md` under a "## NPM_TOKEN audit" subsection (maps R-010 / FR-014 / SC-006)
- [ ] T005 [P] **Maintainer**: enforce 2FA on the `@tallyrow/` npm scope via the npm web UI. Navigate to `https://www.npmjs.com/settings/tallyrow/packages` → enable "Require 2FA for publish" on the `@tallyrow/safesignal` package (and the scope-level setting if available). 2FA is a npm prerequisite for Trusted Publishers to work
- [ ] T006 [P] **Maintainer**: configure npm Trusted Publishers binding on `@tallyrow/safesignal` package settings. Navigate to `https://www.npmjs.com/package/@tallyrow/safesignal/access` → "Trusted Publishers" section → Add publisher. Issuer: `https://gitlab.com`. Subject claim pattern: `project_path:tallyrow/safesignal:ref_type:tag:ref:v*`. Workflow file: `.gitlab-ci.yml`. Environment: (leave empty). Save (maps R-009 / FR-014)
- [X] T007 [P] **Maintainer**: verify first-publish status of `@tallyrow/safesignal` on npm by running `npm view @tallyrow/safesignal versions --json`. Record the result in `baselines.md` under a "## npm registry state" subsection. If the response is "package not found", the first CI-triggered publish (T017's RC) will claim the scope+name. If versions exist, confirm the maintainer's npm account has publish rights

**Checkpoint**: All 6 ops actions complete. In-repo work (US1-US4) can begin.

---

## Phase 3: User Story 1 — Every merge request is gated by automated checks (Priority: P1) 🎯 MVP

**Goal**: Every MR against `main` automatically runs typecheck +
test + build + bundle-invariance + dependency-pins + DCO sign-off
check. Merge button disabled until all stages pass. F004's
documented contracts become mechanically enforced.

**Independent Test**: Open a no-op test MR (any tiny doc change);
GitLab pipeline runs all 9 jobs (typecheck × 2, test × 2, build ×
2, bundle-invariance, dependency-pins, dco-check); all pass green;
merge button enables. Then push a deliberately-broken commit
(e.g., remove a `Signed-off-by:` footer); dco-check fails; merge
button disables with the failure clearly named in the GitLab UI.

### Implementation for User Story 1

- [X] T008 [P] [US1] Create `scripts/ci/dco-check.sh` per `contracts/dco-check.md`'s full implementation. Verify every non-bot, non-merge commit in `$CI_MERGE_REQUEST_DIFF_BASE_SHA..$CI_COMMIT_SHA` carries a `Signed-off-by: Name <email>` footer matching the commit author. Failure output names offending commits + recovery commands. Set executable bit via `chmod +x scripts/ci/dco-check.sh` (maps R-007 / FR-007)
- [X] T009 [P] [US1] Create `scripts/ci/bundle-invariance-check.sh` per `research.md` § "Bundle-invariance comparison mechanics". Fetch merge-base via shallow `git fetch`, build in a worktree, compare gzipped `dist/index.mjs` + `dist/transport-beacon.mjs` against current build; fail if either delta exceeds 1024 bytes. Set executable bit (maps R-005 / FR-005)
- [X] T010 [US1] Create `.gitlab-ci.yml` at repo root with the full quality-gate pipeline structure from `research.md` § "`.gitlab-ci.yml` shape for this pipeline" and `contracts/ci-pipeline-stages.md`. Include: `default:` block with `node:22-alpine` image + `cache:` keyed on `package-lock.json` + `before_script: npm ci --prefer-offline --no-audit --no-fund`; `stages: [typecheck, test, build, audit, publish]`; `.node_matrix` hidden job with `parallel:matrix: NODE_VERSION: ["20", "22"]` + image selection; jobs `typecheck`, `test`, `build` extending `.node_matrix`; jobs `bundle-invariance` (needs build artifact), `dependency-pins` (runs the 3 named test files), `dco-check` (MR-only rule). All quality-gate jobs gated on `$CI_PIPELINE_SOURCE == "merge_request_event"` OR `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH`. Release pipeline jobs (US2) added in T015 — this task ships ONLY the quality-gate half (maps R-001..R-008 / FR-001..FR-010)
- [X] T011 [US1] Verify executable bits are set on both shell scripts: `chmod +x scripts/ci/dco-check.sh scripts/ci/bundle-invariance-check.sh && git update-index --chmod=+x scripts/ci/dco-check.sh scripts/ci/bundle-invariance-check.sh`. Commit so the executable bit propagates through git (otherwise CI sees non-executable scripts and `sh: permission denied` fails the jobs)
- [X] T012 [US1] **Dogfood test**: open a no-op test MR with a one-line doc change (e.g., adding a comment to a markdown file). Push and watch GitLab Pipelines. Verify: (a) all 6 quality-gate stages run; (b) all 9 jobs pass green; (c) merge button enables with CI green + approval state. Document the pipeline-run URL + wall-clock duration in `baselines.md` under a "## US1 first pipeline run" subsection. Close the test MR without merging (or merge it as a tiny doc fix if useful)

**Checkpoint**: US1 complete — CI quality gates enforced on every MR. MVP shippable here; the publish path lands in US2.

---

## Phase 4: User Story 2 — Releases publish to npm with provenance via signed tags (Priority: P1)

**Goal**: A signed `v*.*.*` tag triggers a release pipeline that
runs all quality gates + CHANGELOG validation, then publishes
`@tallyrow/safesignal` to npm with provenance via GitLab OIDC
trusted-publisher. No long-lived `NPM_TOKEN` anywhere.

**Independent Test**: Maintainer writes a `## [1.0.1-rc.1]` entry
in `CHANGELOG.md`, merges it on `main`, then creates and pushes
`git tag -s v1.0.1-rc.1`. Release pipeline runs end-to-end;
`v1.0.1-rc.1` publishes to npm under the `next` dist-tag with
provenance attestation; `npm audit signatures` confirms the
attestation.

### Implementation for User Story 2

- [X] T013 [P] [US2] Create `scripts/ci/changelog-validate.sh` per `research.md` § "CHANGELOG.md validation script". Extract version from `$CI_COMMIT_TAG` (strip leading `v`), grep `CHANGELOG.md` for `^## \[v?VERSION\]` regex match. Failure output names the expected heading format + recovery instructions. Set executable bit (maps R-009 / FR-017a)
- [X] T014 [P] [US2] Create `scripts/ci/provenance-verify.sh`. Run `npm view @tallyrow/safesignal@<tag-version>` (with 30-second sleep for npm propagation) to confirm version exists, then `npm audit signatures --pkg=@tallyrow/safesignal@<version>` to verify provenance. Soft-fail (warn but exit 0) if provenance lookup times out after 3 retries. Set executable bit
- [X] T015 [US2] Extend `.gitlab-ci.yml` with release-pipeline jobs per `contracts/release-pipeline.md`: `.release_only` hidden job with rule `$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+(-[\w.]+)?$/`; `verify-tag-signed` job (stage `typecheck`, runs `git tag -v $CI_COMMIT_TAG` + ancestor check); `changelog-validate` job (stage `audit`); `publish` job (stage `publish`, `id_tokens: NPM_ID_TOKEN: { aud: https://registry.npmjs.org }`, computes `DIST_TAG=next` for tags containing `-` else `latest`, runs `npm publish --provenance --tag $DIST_TAG`); `provenance-verify` job (stage `publish`, needs publish). All extend `.release_only`. The publish job needs all preceding release-pipeline jobs (maps R-009 / FR-011..FR-017a)
- [X] T016 [US2] Write the v1.0.1-rc.1 CHANGELOG entry in `CHANGELOG.md`. Add a `## [1.0.1-rc.1] — 2026-MM-DD` section at the top (before the existing `## [1.0.0]`). Content: brief release-candidate note explaining that this RC dogfoods the F005 release pipeline; explicit note that "v1.0.1-rc.1 is the first npm artifact published for `@tallyrow/safesignal`; v1.0.0 was an in-repo milestone documented in CHANGELOG but never shipped to npm" (resolves the v1.0.0 → v1.0.1-rc.1 discontinuity per the I1 analysis remediation, which also added a footnote to the v1.0.0 entry); "no consumer-visible API change" preservation statement; cross-reference to feature 005 spec
- [ ] T017 [US2] **Dogfood release test**: cut the v1.0.1-rc.1 signed tag and verify the release pipeline end-to-end. (a) After T016's CHANGELOG entry merges to `main`, run `git checkout main && git pull --ff-only`; (b) `git tag -s v1.0.1-rc.1 -m "Release v1.0.1-rc.1 — dogfood the F005 release pipeline"`; (c) `git tag -v v1.0.1-rc.1` to confirm signature; (d) `git push origin v1.0.1-rc.1`; (e) watch GitLab Pipelines — release pipeline triggers; verify all 12 jobs run (verify-tag-signed + typecheck × 2 + test × 2 + build × 2 + bundle-invariance + dependency-pins + changelog-validate + publish + provenance-verify); (f) verify `npm view @tallyrow/safesignal@1.0.1-rc.1` returns the version under the `next` dist-tag; (g) verify `npm audit signatures --pkg=@tallyrow/safesignal@1.0.1-rc.1` confirms Sigstore provenance attestation; (h) verify the package page at `https://www.npmjs.com/package/@tallyrow/safesignal` shows the new version under the Provenance section with a link back to the GitLab pipeline run. Record the pipeline URL + npm version URL + wall-clock duration in `baselines.md` under a "## US2 dogfood release" subsection. This is the real acceptance gate for the release pipeline (maps R-009 / R-010 / FR-013 / FR-014 / SC-004 / SC-005 / SC-006)

**Checkpoint**: US2 complete — release pipeline verified end-to-end with v1.0.1-rc.1 RC publish. Any future `v*.*.*` signed tag now safely ships to npm with provenance.

---

## Phase 5: User Story 3 — Default branch is `main` with in-repo sweep (Priority: P2)

**Goal**: All forward-going artifacts reference `main` (or
`$CI_DEFAULT_BRANCH`) instead of `master`. Archival specs
preserved verbatim. Branch protections (already configured in
T003 ops action) verified active.

**Independent Test**: `grep -rn 'master' --include='*.md'
--include='*.yml' --include='*.json' --include='*.ts'` against
forward-going artifacts (excluding `specs/001-` through `specs/004-`,
`package-lock.json`, `node_modules/`, `dist/`) returns zero
references to `master` as the default branch.

### Implementation for User Story 3

- [ ] T018 [US3] Local clone update (one-time per maintainer workstation; after T002 GitLab default-branch rename): run `git fetch origin && git branch -m master main && git branch -u origin/main main && git remote set-head origin -a`. Verify `git branch --show-current` reads `main`. Document in CONTRIBUTING.md's "Local development setup" section (a small addition — fold into T022's CONTRIBUTING update)
- [X] T019 [US3] In-repo sweep: run the grep command from `contracts/branch-protection-policy.md` § "In-repo `master` reference sweep". For each forward-going file with a `master` reference (excluding `specs/001-` through `specs/004-`, `package-lock.json`), update to `main` OR `$CI_DEFAULT_BRANCH` (prefer the variable in `.gitlab-ci.yml` and `scripts/ci/*.sh` so future renames don't need another sweep). Files expected to need updates: `CLAUDE.md` (none if SPECKIT marker was already current), `GOVERNANCE.md` (the "MRs against master" note already fixed in F004's analysis remediation — verify), `.gitlab-ci.yml` (should use `$CI_DEFAULT_BRANCH` from the start in T010, so likely no sweep needed), `scripts/ci/*.sh` (use `$CI_DEFAULT_BRANCH` from the start), `README.md` (the CI status badge URL uses `main`)
- [ ] T020 [US3] Verify branch protections active: from a maintainer workstation, attempt `git push origin main` against the rebased branch; expected: "rejected — protected branch". Attempt `git push --force origin main`; expected: "rejected — force push not allowed". Document the verification in `baselines.md` under a "## Branch protection verification" subsection (maps SC-007)

**Checkpoint**: US3 complete — `main` is the default branch, in-repo references swept, protections active.

---

## Phase 6: User Story 4 — Release process is documented (Priority: P3)

**Goal**: README displays a CI pipeline status badge; CONTRIBUTING
has a "Cutting a release" section codifying the maintainer flow
from `quickstart.md`; GOVERNANCE's stale "Feature 006" references
are corrected to "Feature 005".

**Independent Test**: A reader of `CONTRIBUTING.md` finds a
"Cutting a release" section with all 6 required content elements
(SemVer policy, CHANGELOG-first workflow, signed-tag command,
pipeline-stages description, npm verification, rollback procedure).
`README.md` displays a pipeline-status badge in Project resources.
`grep "Feature 006" GOVERNANCE.md` returns zero results.

### Implementation for User Story 4

- [X] T021 [P] [US4] Add a CI pipeline status badge to `README.md`'s `## Project resources` section. Insert the badge near the top of that section (or in the "Community and legal" subsection). Format: `[![pipeline status](https://gitlab.com/tallyrow/safesignal/badges/main/pipeline.svg)](https://gitlab.com/tallyrow/safesignal/-/commits/main)`. The badge auto-updates with each `main` push (maps R-014 / FR-023 / SC-011)
- [X] T022 [P] [US4] Add a `## Cutting a release` section to `CONTRIBUTING.md` between `## Local development setup` and `## Where to ask questions`. Content per `quickstart.md` § "Maintainer walkthrough — cutting a release": (a) SemVer level table (major / minor / patch / pre-release), (b) the CHANGELOG-first workflow (write entry, merge to main, then tag), (c) `git tag -s vX.Y.Z` command with example, (d) release-pipeline stage list with timings, (e) post-publish verification commands (`npm view`, `npm audit signatures`), (f) rollback procedure (cut v1.0.3 with fix; don't unpublish; use `npm deprecate` for security advisories). Also add the local-clone-update one-liner from T018 to the existing "Local development setup" section so contributors know how to migrate from `master` (maps R-015 / FR-024 / SC-009)
- [X] T023 [P] [US4] Fix GOVERNANCE.md's stale "Feature 006" references to "Feature 005" (or "as of v1.0.1, CI-mediated publish is configured per Feature 005"). The reference appears in the `### npm publish authority` subsection's "CI-mediated publish via OIDC planned in Feature 006" sentence. Update to reflect that this work is now Feature 005 and shipped (maps R-013 / FR-022 / SC-012)

**Checkpoint**: US4 complete — release process documented end-to-end; README discoverability for CI status; F004 stale references corrected.

---

## Phase 7: Polish & Verification

**Purpose**: Run the audit script per `contracts/audit-script.md`,
verify out-of-band manual checks (GitLab UI + npm UI), capture
post-feature baselines, write the final-review record. Optionally
cut the stable `v1.0.1` release tag as the final dogfood.

- [X] T024 Run `contracts/audit-script.md` reference script: verify all 5 required new files (`.gitlab-ci.yml` + 4 `scripts/ci/*.sh`) exist with executable bits + content markers; verify modified files (`README.md` badge, `CONTRIBUTING.md` § Cutting a release, `GOVERNANCE.md` Feature 006 → 005, `CLAUDE.md` SPECKIT marker); verify NO `NPM_TOKEN`/`NODE_AUTH_TOKEN` references in any committed CI config; verify `master` sweep returns zero forward-going matches. Record PASS / FAIL into `baselines.md`
- [ ] T025 [P] Out-of-band manual verification per `contracts/audit-script.md` § "Out-of-band verification": (a) GitLab Settings → Repository → Default branch shows `main`; (b) GitLab Settings → Repository → Protected branches shows the configured rules on `main`; (c) GitLab Settings → CI/CD → Variables shows NO `NPM_TOKEN`; (d) npmjs.com Trusted Publishers section on `@tallyrow/safesignal` shows the GitLab binding; (e) npm scope `@tallyrow/` has 2FA enforced. Record outcomes into `baselines.md`
- [X] T026 [P] Capture post-feature test-suite baseline + bundle baselines for comparison: `npm test` should still produce 48 / 1088 / 10 / 0 / 0 (identical to T001 pre-feature baseline per FR-026); `gzip -c dist/index.mjs | wc -c` and `gzip -c dist/transport-beacon.mjs | wc -c` should produce sizes within ±1 KiB of the F003-established baselines (8162 B, 3101 B). Record into `baselines.md` (maps R-016 / FR-026 / SC-010)
- [ ] T027 [P] Quickstart contributor walkthrough: walk `specs/005-cicd-pipeline/quickstart.md` § "Contributor walkthrough" steps 1-8 end-to-end on a scratch branch. Confirm every step's expected output matches reality. This validates that the documented contributor workflow actually works as advertised
- [X] T028 Write `specs/005-cicd-pipeline/checklists/final-review.md` recording: (a) the contracts' PASS / FAIL outcomes (file-presence audit, branch-protection verification, US1 first pipeline run, US2 dogfood RC publish, post-feature test invariance, post-feature bundle invariance); (b) pre-feature vs post-feature test-suite + bundle numbers; (c) one-line acceptance statement; (d) the v1.0.1-rc.1 publish URL on npmjs.com as the proof-of-concept artifact; (e) any open follow-ups (e.g., whether to cut the stable v1.0.1 tag immediately or defer)
- [ ] T029 **(optional dogfood)** Cut the stable `v1.0.1` release tag. After T017's RC has been validated and any RC-only fixes are merged: write a `## [1.0.1] — 2026-MM-DD` entry in `CHANGELOG.md` (can copy the RC entry content or expand it); merge to `main`; `git tag -s v1.0.1 -m "Release v1.0.1 — operational hardening"`; `git push origin v1.0.1`. Verify the release pipeline publishes `1.0.1` under the `latest` dist-tag. Document in `baselines.md`. This is OPTIONAL — the feature is acceptance-complete after T028, but cutting the stable release lands F005's actual value in consumer reach

**Checkpoint**: Feature complete. All acceptance contracts verified. Optionally `v1.0.1` shipped to npm under `latest`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001)**: No dependencies. MUST complete first to lock baseline.
- **Phase 2 (Foundational, T002-T007)**: Depends on Setup. T002 (default-branch rename) is the linchpin — it blocks US1 (.gitlab-ci.yml references `$CI_DEFAULT_BRANCH` which becomes `main` after rename) and US3. T003 (branch protections) gates US3 verification. T004-T007 (npm ops) gate US2 publish.
- **Phase 3 (US1)**: Depends on T002 (rename). T008/T009 [P] for scripts; T010 sequential on .gitlab-ci.yml; T011 bit-setting; T012 dogfood test.
- **Phase 4 (US2)**: Depends on Phase 3 (T010 ships the base .gitlab-ci.yml that T015 extends) + T005/T006/T007 (npm ops). T013/T014 [P] for scripts; T015 extends gitlab-ci.yml; T016 CHANGELOG entry; T017 dogfood RC publish.
- **Phase 5 (US3, T018-T020)**: T018 is per-maintainer-workstation. T019 sweep can run in parallel with US1/US2 development since it touches different files. T020 verification depends on T003 (protections active).
- **Phase 6 (US4, T021-T023)**: All [P] across distinct files. Can run in parallel with US1/US2/US3 development; ideally lands after US2's release pipeline is designed so the CONTRIBUTING "Cutting a release" section accurately describes shipped behavior.
- **Phase 7 (Polish, T024-T029)**: Depends on all user stories complete. T024/T025/T026/T027 [P] read-only verifications. T028 final-review writeup. T029 optional stable release.

### User Story Dependencies

- **US1 (P1 MVP)**: Depends on Setup + T002 (rename). No dependencies on other user stories. Ships the quality-gate half of the pipeline.
- **US2 (P1)**: Depends on Setup + T002 (rename for `$CI_DEFAULT_BRANCH` resolution) + T005/T006/T007 (npm Trusted Publishers + 2FA + scope state) + US1 (T010 ships .gitlab-ci.yml that T015 extends). US2's dogfood RC is the real acceptance gate.
- **US3 (P2)**: Depends on Setup + T002/T003 (rename + protections). In-repo sweep (T019) independent of US1/US2 development.
- **US4 (P3)**: Depends on Setup + T002 (so badge URL uses `main`) + design completion of US1/US2 (so docs match shipped behavior). T021/T022/T023 themselves are fully [P] across distinct files.

### Within Each User Story

- US1: T008 + T009 [P] (different scripts); T010 sequential on .gitlab-ci.yml; T011 chmod step; T012 dogfood
- US2: T013 + T014 [P] (different scripts); T015 sequential on .gitlab-ci.yml; T016 CHANGELOG; T017 dogfood
- US3: T018 → T019 → T020 (mostly sequential — workstation update, then sweep, then verification)
- US4: T021 + T022 + T023 fully [P] (different files)
- Polish: T024 first; T025/T026/T027 [P]; T028 writeup; T029 optional

### Parallel Opportunities

- **Setup**: T001 alone
- **Foundational**: T002 sequential (gates the rest); T003 + T004 + T005 + T006 + T007 can be batched into a single maintainer ops session (~20 minutes of UI clicking total)
- **US1**: T008 + T009 [P]
- **US2**: T013 + T014 [P]
- **US3**: T018-T020 mostly sequential
- **US4**: T021 + T022 + T023 fully [P]
- **Polish**: T024 first; T025-T027 [P]; T028 writeup; T029 optional
- **US3 + US4 + US1 development**: can all proceed in parallel after Foundational completes (different files, different concerns)

### Parallel Example: US4

```bash
# Three distinct files; safe to run concurrently:
Task: T021 README.md CI status badge
Task: T022 CONTRIBUTING.md "Cutting a release" section
Task: T023 GOVERNANCE.md Feature 006 → 005 fix
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Complete Phase 1 (Setup) — baseline captured.
2. Complete Phase 2 (Foundational) — GitLab + npm ops done (~30 min maintainer time).
3. Complete Phase 3 (US1, T008-T012) — CI quality gates shipped; first pipeline runs end-to-end.
4. **STOP and VALIDATE**: T012 dogfood test confirms quality gates work on a no-op MR.
5. The MVP shipping here is meaningful: every future MR is gated, even if release-pipeline publish (US2) hasn't shipped yet. Manual `npm publish` from the maintainer machine still works as a fallback.

### Full feature delivery

1. Setup + Foundational → ops + baseline done
2. US1 → CI quality gates verified on a no-op MR
3. US2 → release pipeline + dogfood RC publish to npm with provenance (the real proving-ground)
4. US3 + US4 can land in parallel with US1/US2 development → in-repo sweep + docs
5. Polish → full audit + final-review
6. Optional T029 → stable v1.0.1 release tag (the "shipped F005" event)

### Single-Developer Linear Strategy

A solo developer runs phases roughly in order with the
maintainer-ops-actions phase batched into a single ~30-minute UI
session. Commit cadence per memory: commit at the end of each
task without asking. The `[Spec Kit] T### — <summary>` convention
applies. Every commit on this branch MUST carry a `Signed-off-by:`
footer per F004's DCO requirement (dogfooded by this very
feature's own CI check once shipped).

---

## Notes

- **No new vitest test files** ship in this feature. The CI
  pipeline's `test` stage runs the EXISTING suite; this feature
  adds CI enforcement, not new test coverage. FR-026 prohibits
  test-logic changes.
- **No new `devDependencies`** in `package.json`. CI tooling lives
  in the GitLab runner image (`node:22-alpine` ships everything
  needed including `npm` ≥ 10 for `--provenance` support).
- **Maintainer-side ops actions (T002-T007)** are blocking but
  not agent-executable. Same pattern as F003's T003 GitLab slug
  rename and F004's tallyrow.com email DNS setup. The agent emits
  the instruction + verification command; the maintainer performs
  the ops in the GitLab/npm web UIs and confirms back.
- **The v1.0.1-rc.1 dogfood publish (T017)** is the real proving-
  ground for the release pipeline. Until that succeeds end-to-end
  with provenance attestation, US2 isn't actually verified —
  only designed. Plan for the RC tag to take ~12-15 min of
  pipeline wall-clock time and an additional ~5 minutes for
  troubleshooting if anything misconfigures (most likely failure
  mode: OIDC subject claim regex mismatch between GitLab's `sub`
  claim and npm's binding pattern).
- **`specs/005-cicd-pipeline/baselines.md`** is the scratch file
  where the agent records pre- and post-feature measurements,
  ops verification outcomes, and the dogfood pipeline URLs. Ships
  with the merge as audit trail.
- **Every commit on this branch MUST carry `Signed-off-by:`** per
  F004's DCO requirement. The agent commits with `git commit -s`;
  if any commit lacks the footer, the CI check (once this feature
  ships) would fail the MR. Dogfooded retroactively if any pre-
  feature commits need amending.
- **GOVERNANCE.md edits** in T023 are different from the master→
  main sweep edits in T019. Both may touch GOVERNANCE.md; sequence
  them carefully (T019 sweep first, T023 Feature 006 → 005 fix
  second) OR fold both into a single edit task. Per the data-
  model's per-file inventory, GOVERNANCE.md gets one combined
  edit pass.
- **Avoid**: editing `src/**` or `tests/**` (out of scope per
  FR-025 / FR-026); adding new `devDependencies` (out of scope
  per FR-027); modifying the `exports` map shape (out of scope
  per FR-028); editing archival specs under `specs/001-*` through
  `specs/004-*` (out of scope per F004 FR-018 historical
  archival).
