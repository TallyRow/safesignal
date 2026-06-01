# Quickstart / Acceptance: GitLab → GitHub Migration

These walkthroughs are the feature's acceptance tests (it is documentation + automation, so verification is by exercising the documented flows against the live GitHub repo, not by code tests). Each maps to a Success Criterion (SC) in `spec.md`.

## 1. Contributor flow is GitHub-correct — SC-001, SC-002, FR-001, FR-011

1. Fresh-eyes read of `CONTRIBUTING.md`: every command/link resolves on GitHub; **no** `glab`, "merge request", or `gitlab.com` reference except entries explicitly marked historical.
2. Follow it end-to-end: clone via the GitHub URL → branch → open a **pull request**. Every step works with GitHub tooling (`gh`/web).
3. Existing-clone path: the documented `git remote set-url origin https://github.com/TallyRow/safesignal.git` repoints a GitLab clone.
4. Grep gate: `git grep -niE 'gitlab|glab|merge request' -- CONTRIBUTING.md GOVERNANCE.md README.md SECURITY.md` returns **only** lines marked historical.

## 2. Templates present on GitHub — SC-003, FR-002

1. On GitHub, **New issue** offers **Bug**, **Feature**, **Security** templates (or routes Security to the private channel via `config.yml`).
2. Opening a **pull request** pre-fills `PULL_REQUEST_TEMPLATE.md` with Summary / What changed / Verification / Test plan / **Constitution touchpoints** / **DCO sign-off**.
3. `.gitlab/issue_templates/` and `.gitlab/merge_request_templates/` no longer exist in the repo.

## 3. Release runbook matches reality — SC-004, FR-003

1. The rewritten "Cutting a release" section describes the GitHub Actions signed-tag flow: signed `git tag -s` → `verify-tag-signed` → quality gates → `npm publish --provenance` (OIDC Trusted Publisher, no token) → `provenance-verify`. **No** GitLab/`glab`/long-lived-token steps.
2. The documented failure modes match the real gates: lightweight-tag rejection, `repository.url`↔provenance match (E422), tagged-commit-on-`main`.
3. Trace against the actual `v1.3.0` run (or the next release): each runbook step corresponds to a real pipeline stage. Verify a published version with `npm audit signatures --pkg=@tallyrow/safesignal@<v>` → verified attestation.

## 4. Dependency automation alive — SC-005, FR-006

1. The Renovate GitHub App is installed on the TallyRow org; its onboarding PR was merged.
2. At least one dependency-update PR appears automatically, following `renovate.json` grouping (minor/patch grouped, majors isolated).
3. Renovate PRs are subject to `ci-success` but Renovate itself is **not** a required check.

## 5. Security reporting intact, no gap — FR-005

1. Repo **Settings → Code security** shows **Private vulnerability reporting: Enabled**; the repo Security tab offers "Report a vulnerability".
2. `SECURITY.md` documents both PVR and `security@tallyrow.com`, with the 72h/7d/90d policy preserved and **no** GitLab-only step.
3. The email channel was live throughout the SECURITY.md change (no disclosure gap).

## 6. GitLab decommissioned — SC-006, FR-007

1. The GitLab project is **archived/read-only**; new MRs/issues cannot be opened.
2. Its description/README points to `github.com/TallyRow/safesignal`.
3. `CHANGELOG.md` has a new entry recording the host change (historical entries unchanged).

## 7. No regression — SC-007, FR-008, FR-009

1. `ci-success` and the release pipeline remain green on `main` after the sweep.
2. `scripts/ci/*.sh` are unmodified; the workflows still feed them `CI_*` vars and pass.
3. `git diff` for this feature touches **no** `src/**`, `tests/**`, `dist`/`exports`, or workflow `.yml` behavior — only docs, `.github/` templates, `renovate`-adjacent cleanup, and `CHANGELOG.md`.
4. npm releases remain provenance-verified (`npm audit signatures`).
