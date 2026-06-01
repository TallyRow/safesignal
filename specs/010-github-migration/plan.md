# Implementation Plan: Complete the GitLab → GitHub Migration

**Branch**: `010-github-migration` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-github-migration/spec.md`

## Summary

Finish the documentation, repo-metadata, template, dependency-automation, and decommissioning layer of the GitLab → GitHub move (the repo, CI/CD, branch ruleset, npm Trusted Publisher, and first provenance-backed release already landed). Concretely: rewrite the contributor/governance/security docs for GitHub mechanics; migrate `.gitlab/` issue + MR templates to `.github/`; re-home dependency automation onto the **Renovate GitHub App** (reusing `renovate.json` verbatim); enable **GitHub Private Vulnerability Reporting** alongside the preserved `security@` email; and **archive the GitLab project read-only** with a redirect, recording the host change in `CHANGELOG.md`. No `src/`, public-API, `exports`, or runtime change; the host-neutral `scripts/ci/*.sh` stay untouched.

## Technical Context

**Language/Version**: N/A for runtime — this feature edits Markdown docs, GitHub config (`.github/` templates), and repo metadata. No TypeScript/`src` change.

**Primary Dependencies**: GitHub platform features (issues/PR templates, branch rulesets, Private Vulnerability Reporting, Actions — already configured); Mend **Renovate GitHub App**; existing `renovate.json`.

**Storage**: N/A.

**Testing**: Acceptance is by **documented-flow walkthrough** against the live GitHub repo (clone → branch → PR; file Bug/Feature/Security; release-runbook trace) — see `quickstart.md`. The existing automated gates (`ci-success`, the release pipeline) continue to enforce all code/release invariants unchanged.

**Target Platform**: GitHub (`github.com/TallyRow/safesignal`) + npm registry.

**Project Type**: Reusable browser package — but this feature is **repo housekeeping / documentation / automation**, not package code.

**Performance Goals**: N/A (no runtime).

**Constraints**: No `src`/API/`exports`/runtime change; `scripts/ci/*.sh` must keep working unchanged (workflows feed them `CI_*` vars); no vulnerability-disclosure gap during the SECURITY.md change; historical references (CHANGELOG entries, past `specs/`) left intact; provenance + reproducible-verification preserved.

**Scale/Scope**: ~5 living docs edited, ~4 template files created, 1 `.gitlab/` dir removed, 1 CHANGELOG entry, 2 external one-time actions (Renovate App install, GitLab archive), 1 repo setting (PVR).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version note.** This branch is off `main`, which carries **constitution v1.3.0** (principles I–IX). The **v1.4.0** amendment (adds Principle I *Spec-Driven Development* and Principle XI *Supply-Chain Integrity*, renumbering the rest) is in flight as **PR #4** and is the agreed governing direction. The check below is against the in-tree v1.3.0 gates; the two incoming principles are addressed explicitly at the end. The spec's "Principle I/XI" citations use v1.4.0 numbering and become exact once PR #4 merges. **Sequencing recommendation: merge PR #4 before (or with) implementing this feature** so principle numbering is consistent — not a hard blocker.

- **API Stability** — ✅ N/A. No consumer-facing API, config, type, or behavior is touched. (`package.json` `repository.url`/`bugs`/`homepage` were already updated in the v1.3.0 release, PR #3; not part of this feature.)
- **Browser Resilience & Failure Safety** — ✅ N/A. No runtime/`src` code.
- **Neutrality & Portability** — ✅ N/A for the package. (At the project-infra level the move *reduces* host lock-in; no package coupling introduced.)
- **Structured Observability** — ✅ N/A. No event model / logging change.
- **Secure Logging by Default & Sensitive Data Minimization** — ✅ N/A to logging behavior. Security-relevant only in that the `SECURITY.md` rewrite MUST preserve the disclosure channel with **no gap** (FR-005); the redaction/safe-logging docs (`docs/safe-logging.md`) are unchanged and continue to model safe behavior.
- **Log Integrity & Monitoring Suitability** — ✅ N/A. No event production change.
- **Lightweight Logger Instances & Federated Runtime** — ✅ N/A. No logger/runtime code.
- **Reproducible Verification** — ✅ Applies, preserved. FR-009 requires every documented quality check keep running through the GitHub workflows with identical local/CI outcomes; this feature adds **no new check** and changes **no verification path**. `scripts/ci/*.sh` remain host-neutral and unmodified (FR-008). The Renovate move does not gate merges.
- **Mechanical Enforcement of Documented Contracts** — ✅ Applies, no regression. The feature introduces **no new machine-checkable code invariant**, and disables **no existing enforced gate** (`ci-success`, release pipeline stay intact). Documentation correctness ("docs match reality") is verified by the acceptance walkthroughs (SC-001..SC-004), which is appropriate — it is doc accuracy, not a code invariant. No undocumented-gate remediation tasks are created by this feature.
- **Test & Documentation Coverage** — ✅ Applies (this is fundamentally a documentation feature). "Tests" = the acceptance walkthroughs in `quickstart.md`. Docs continue to model safe logging; no example normalizes insecure patterns.

**Incoming v1.4.0 principles (PR #4):**
- **Principle I — Spec-Driven Development (NON-NEGOTIABLE)** — ✅ Satisfied by construction: this feature is itself running the full Spec Kit lifecycle (specify → clarify → plan → tasks → implement) with this Constitution Check.
- **Principle XI — Supply-Chain Integrity & Verifiable Provenance** — ✅ Preserved: FR-009 keeps releases provenance-attested via OIDC on GitHub; the Renovate App preserves dependency screening; the GitLab archive keeps historical provenance source links resolvable.

**Result: PASS** (no violations; Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/010-github-migration/
├── spec.md              # /speckit-specify output (+ /speckit-clarify)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output (acceptance walkthroughs)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

*No `data-model.md` or `contracts/` — this feature has no data entities and changes no external interface (docs/metadata/automation only).*

### Repository files affected

```text
Living docs (edited — GitLab→GitHub):
├── CONTRIBUTING.md   # glab→gh; "merge request"/MR→"pull request"/PR; clone URL;
│                     #   rewrite "Cutting a release" for the GitHub Actions signed-tag
│                     #   + OIDC-provenance flow; master→main note; remote-repoint guidance (FR-011)
├── GOVERNANCE.md     # GitLab handle→GitHub; "MR approval"→branch-ruleset model
│                     #   (PR required, 0 approvals, ci-success required, CODEOWNERS path);
│                     #   OIDC trusted-publisher release model
├── README.md         # replace GitLab pipeline badge + links with GitHub equivalents
├── SECURITY.md       # GitHub Private Vulnerability Reporting + preserved security@ email;
│                     #   GitLab advisory refs → GitHub Security Advisories
└── CHANGELOG.md      # NEW entry recording the host change (historical entries untouched)

GitHub templates (created from .gitlab/ equivalents):
└── .github/
    ├── ISSUE_TEMPLATE/{bug,feature,security}.{md|yml}   # + config.yml (route security → PVR/email)
    └── PULL_REQUEST_TEMPLATE.md                          # Summary/What changed/Verification/
                                                          #   Test plan/Constitution touchpoints/DCO

Removed:
└── .gitlab/issue_templates/**, .gitlab/merge_request_templates/**   # superseded by .github/
    # (.gitlab/allowed_signers already migrated to .github/allowed_signers)

External / one-time (not repo files):
├── Renovate GitHub App installed on the TallyRow org (reuses renovate.json)
├── GitHub Private Vulnerability Reporting enabled on the repo
└── GitLab project archived read-only + redirect notice

Preserved UNCHANGED (non-regression — FR-008):
├── scripts/ci/*.sh                 # host-neutral; fed CI_* by the workflows
├── src/**, tests/**, dist exports  # no change
├── .github/workflows/*.yml         # already live
└── renovate.json                   # reused verbatim by the App
```

**Structure Decision**: Documentation + repo-metadata + `.github/` templates + automation re-homing. No source tree changes; the package layout is untouched.

## Approach & sequencing

1. **Templates first** (`.github/` issue + PR templates) — low-risk, unblocks correct contributor UX immediately; then remove `.gitlab/` templates.
2. **Docs sweep** — `CONTRIBUTING` (largest: release-runbook rewrite), `GOVERNANCE`, `README`, `SECURITY`. Coordinate with **PR #4** which also edits `CONTRIBUTING`/`GOVERNANCE` in *different regions* (principle list) — expected to auto-merge; if PR #4 lands first, rebase this branch onto it.
3. **External actions** — install Renovate App; enable PVR (these are org/repo settings, done by the maintainer; the spec/tasks document the steps and the verification).
4. **Decommission last** — only after all in-repo links resolve to GitHub: archive the GitLab project + redirect, add the CHANGELOG host-change entry.

All in-repo edits land via a single PR gated by `ci-success` (per the ruleset). External actions are checklist items verified in `quickstart.md`.

## Complexity Tracking

> No Constitution Check violations — none to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
