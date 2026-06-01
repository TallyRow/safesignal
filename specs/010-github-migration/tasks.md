---
description: "Task list for Complete the GitLab → GitHub Migration"
---

# Tasks: Complete the GitLab → GitHub Migration

**Input**: Design documents from `/specs/010-github-migration/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Not applicable — this is a documentation / repo-metadata / automation feature. Acceptance is by the `quickstart.md` walkthroughs against the live GitHub repo; the existing `ci-success` and release pipelines enforce all code/release invariants unchanged. No automated test tasks are generated.

**Organization**: Grouped by user story (US1–US5 from spec.md) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 on user-story tasks only
- Exact file paths are included in each task

---

## Phase 1: Setup

- [x] T001 Verify branch currency before editing shared docs. **Done 2026-06-01**: constitution PR #4 (v1.4.0) merged; this branch was rebased onto `origin/main` (clean — PR #4's principle-list edits to `CONTRIBUTING.md`/`GOVERNANCE.md` are in different regions than this feature's GitLab-reference edits). The constitution is now v1.4.0 in-tree and the spec's Principle I/IX/XI citations are exact. (repo root)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared inputs every doc/template task depends on.

- [ ] T002 Capture the GitLab-reference inventory that drives the sweep and the final completeness gate: run `git grep -niE 'gitlab|glab|merge request|master' -- CONTRIBUTING.md GOVERNANCE.md README.md SECURITY.md` and record the matching lines as the worklist in this feature's notes. (analysis → `specs/010-github-migration/`)
- [ ] T003 [P] Create the `.github/ISSUE_TEMPLATE/` directory. (repo root)

**Checkpoint**: Inventory captured + template directory exists — user stories can begin.

---

## Phase 3: User Story 1 - Contributor-correct docs & templates (Priority: P1) 🎯 MVP

**Goal**: A contributor can follow `CONTRIBUTING.md` and the issue/PR templates using only GitHub tooling, with no GitLab-only step.

**Independent Test**: Walk clone → branch → open PR per `CONTRIBUTING.md`; file Bug/Feature/Security; confirm migrated templates and zero non-historical GitLab references (quickstart §1–2).

- [ ] T004 [P] [US1] Port the Bug issue template to `.github/ISSUE_TEMPLATE/bug.md` (front-matter `name`/`about`/`labels`; fields: steps to reproduce, expected, actual + errors, package version, browser/runtime, minimal reproduction) from `.gitlab/issue_templates/Bug.md`.
- [ ] T005 [P] [US1] Port the Feature issue template to `.github/ISSUE_TEMPLATE/feature.md` (consumer use case, proposed change, constitutional principle(s) touched, exported-symbol impact, alternatives) from `.gitlab/issue_templates/Feature.md`.
- [ ] T006 [P] [US1] Port the Security issue template to `.github/ISSUE_TEMPLATE/security.md` (non-sensitive questions only) from `.gitlab/issue_templates/Security.md`, AND add `.github/ISSUE_TEMPLATE/config.yml` that disables blank issues and routes vulnerabilities to GitHub Private Vulnerability Reporting + `security@tallyrow.com`.
- [ ] T007 [P] [US1] Create `.github/PULL_REQUEST_TEMPLATE.md` from `.gitlab/merge_request_templates/Default.md`, preserving the sections: Summary / What changed / Verification / Test plan / Constitution touchpoints / DCO sign-off checklist.
- [ ] T008 [US1] Remove `.gitlab/issue_templates/` and `.gitlab/merge_request_templates/` (superseded by `.github/`; `.gitlab/allowed_signers` already migrated — leave it for now, retired in T018/T020). (repo root)
- [ ] T009 [US1] Rewrite the non-release sections of `CONTRIBUTING.md`: `glab`→`gh`/web, "merge request"/MR→"pull request"/PR, GitLab clone URL→`https://github.com/TallyRow/safesignal.git`, add the existing-clone remote-repoint guidance (`git remote set-url origin …`, FR-011), and the `master`→`main` note. **Leave the "Cutting a release" section for T011 (US2).**
- [ ] T010 [P] [US1] Update `README.md`: replace the GitLab pipeline badge (line ~385) and any GitLab links with the GitHub Actions CI badge and GitHub repository links.

**Checkpoint**: Contribution path + templates are fully GitHub-correct (MVP delivered).

---

## Phase 4: User Story 2 - Accurate release runbook (Priority: P2)

**Goal**: The "Cutting a release" runbook matches the real GitHub Actions pipeline.

**Independent Test**: Trace the runbook step-by-step against `release.yml` / the `v1.3.0` run; every step maps to a real stage, no GitLab/token steps (quickstart §3).

- [ ] T011 [US2] Rewrite the "Cutting a release" section of `CONTRIBUTING.md` to mirror `.github/workflows/release.yml`: CHANGELOG-entry-first; **signed annotated** tag (`git tag -s`) on a `main` commit carrying the workflow; pipeline stages (`verify-tag-signed` → build/typecheck/test Node 20+22 → bundle-invariance, dependency-pins, changelog-validate → `npm publish --provenance` via the npm **Trusted Publisher / OIDC** with no long-lived token → `provenance-verify`); the three real failure modes (lightweight-tag rejection, `package.json` `repository.url`↔provenance **E422**, tagged-commit-must-be-on-`main`); and verification commands (`npm view …`, `npm audit signatures --pkg=…`). Remove the GitLab pipeline/`glab`/`NPM_TOKEN` content. (depends on T009 — same file)

**Checkpoint**: A maintainer can cut a release from the doc with no surprises.

---

## Phase 5: User Story 3 - Dependency automation on GitHub (Priority: P2)

**Goal**: Renovate keeps proposing updates under the existing policy, on GitHub.

**Independent Test**: A dependency-update PR appears automatically following `renovate.json` grouping; it is gated by `ci-success` but not itself required (quickstart §4).

- [ ] T012 [US3] Install the **Mend Renovate GitHub App** on the TallyRow org (maintainer, org-admin); it reuses the existing `renovate.json` verbatim. (external action — document in the feature PR description)
- [ ] T013 [US3] Merge the Renovate onboarding PR and confirm the config is honored (grouped minor/patch, isolated majors).
- [ ] T014 [US3] Confirm at least one automatic dependency-update PR is opened and is subject to `ci-success` (Renovate is not a required check).

**Checkpoint**: Supply-chain freshness automation is live on GitHub.

---

## Phase 6: User Story 4 - Governance & security docs reflect GitHub (Priority: P3)

**Goal**: `GOVERNANCE.md` and `SECURITY.md` describe real GitHub controls and the supported disclosure channels.

**Independent Test**: Every mechanism in the two docs maps to a real GitHub control/channel; the email channel is preserved with no gap (quickstart §5; spec US4).

- [ ] T015 [US4] Rewrite `GOVERNANCE.md`: GitLab handle→GitHub (`JohnGoure`), "MR approval"→the branch **ruleset** model (PR required into `main`, **0 required approvals** for the solo maintainer, required **`ci-success`** check, force-push/deletion blocked, the CODEOWNERS + code-owner-review trigger for a 2nd maintainer), and the **OIDC trusted-publisher** publish model (no long-lived token); point URLs/handles at GitHub. (edits a different region than PR #4's principle list)
- [ ] T016 [US4] Enable **GitHub Private Vulnerability Reporting** (repo Settings → Code security) **before** editing `SECURITY.md`, so there is no disclosure gap. (external/repo setting)
- [ ] T017 [US4] Rewrite `SECURITY.md`: document **GitHub PVR + preserved `security@tallyrow.com`**, GitHub **Security Advisories** for coordinated fixes, remove GitLab issue/advisory references, and keep the 72h/7d/90d response policy. (depends on T016)

**Checkpoint**: Governance/security docs are accurate and disclosure stays continuous.

---

## Phase 7: User Story 5 - GitLab decommission (Priority: P3)

**Goal**: The old GitLab home no longer misleads; source-of-truth is unambiguous.

**Independent Test**: GitLab project is read-only with a GitHub pointer; CHANGELOG records the host change (quickstart §6).

- [ ] T018 [US5] Remove `.gitlab-ci.yml` (dead on GitHub; contains the old Renovate scheduled job and the GitLab OIDC publish pipeline). (repo root)
- [ ] T019 [US5] Add a `CHANGELOG.md` entry recording the GitLab→GitHub host change (leave all historical entries untouched).
- [ ] T020 [US5] Archive the GitLab project read-only and add a redirect notice (project description + README) pointing at `github.com/TallyRow/safesignal`. **Do this LAST**, only after every in-repo link resolves to GitHub (T009–T017 done). (external action)

**Checkpoint**: Migration is complete; GitLab is decommissioned.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T021 [P] Completeness gate (SC-002): re-run `git grep -niE 'gitlab|glab|merge request' -- CONTRIBUTING.md GOVERNANCE.md README.md SECURITY.md` and confirm only lines explicitly marked historical remain.
- [ ] T022 [P] Non-regression check (FR-008): confirm the feature diff touches **no** `src/**`, `tests/**`, `dist`/`exports`, or workflow `.yml` behavior, and that `scripts/ci/*.sh` are unmodified (`git diff --stat origin/main...HEAD`).
- [ ] T023 Run the `quickstart.md` acceptance walkthroughs §1–§7 and confirm SC-001…SC-007.
- [ ] T024 Open all in-repo changes as a single PR into `main`; confirm the migrated `PULL_REQUEST_TEMPLATE.md` pre-fills (SC-003) and the PR is gated by `ci-success`; confirm `ci-success` and (post-merge) the release pipeline remain green (SC-007).

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T003)** → user stories.
- **US1 (T004–T010)** is the MVP. T004–T007 and T010 are `[P]` (distinct new files); T008 after the templates exist; T009 is the CONTRIBUTING base edit.
- **US2 (T011)** depends on **T009** (same file — `CONTRIBUTING.md`).
- **US3 (T012–T014)** is largely external; independent of the doc tasks.
- **US4**: **T016 before T017**; T015 independent.
- **US5**: **T020 (archive) is strictly last**, after T009–T017; T018/T019 can land with the in-repo PR.
- **Polish (T021–T024)** after all stories; T021/T022 are `[P]`.

## Parallel opportunities

- T004, T005, T006, T007 (four distinct new `.github/` files) + T010 (`README.md`) run in parallel.
- T021 and T022 run in parallel.

## Implementation strategy

- **MVP** = Phase 1–2 + **US1** (contributor-correct docs & templates) → the highest-impact, most-visible fix; shippable on its own.
- **Incremental**: add US2 (release runbook) and US4 (governance/security) in the same in-repo PR; US3 (Renovate) and US5 (archive) are external/maintainer actions sequenced around the PR, with the GitLab archive performed last.
- **Sequencing with PR #4**: done — the constitution v1.4.0 PR is merged and this branch is rebased onto it (T001), so the spec's Principle I/IX/XI citations are exact.
