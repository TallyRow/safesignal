# Feature Specification: Complete the GitLab → GitHub Migration

**Feature Branch**: `010-github-migration`

**Created**: 2026-06-01

**Status**: Draft

**Input**: User description: "Complete the GitLab→GitHub migration for SafeSignal (TallyRow org)" — finish the documentation, repo-metadata, template, dependency-automation, and decommissioning work after the repository, CI/CD, and first provenance-backed release already moved to GitHub.

## Context

The structural migration already shipped and is **not** in scope here: `github.com/TallyRow/safesignal` exists with full history; GitHub Actions CI (`ci.yml` with a `ci-success` aggregate gate) and release (`release.yml`, signed-tag publish) workflows are live; `.github/allowed_signers` is migrated; a branch ruleset protects `main` (PR required, 0 approvals for the solo maintainer, `ci-success` required, force-push/deletion blocked); the npm Trusted Publisher (OIDC, tokenless) is configured; and `v1.3.0` published to npm with verifiable provenance. `package.json` `repository.url` already points at GitHub.

What remains is the **human-facing and housekeeping layer** that still describes or depends on GitLab. This spec covers only that remaining work.

## Clarifications

### Session 2026-06-01

- Q: How should dependency-update automation be re-homed on GitHub? → A: **Renovate GitHub App** (Mend), reusing the existing `renovate.json` policy verbatim (grouped minor/patch, isolated majors); no scheduled-workflow fallback.
- Q: How should the old GitLab project be decommissioned? → A: **Archive read-only** with a redirect notice pointing at GitHub — reversible, and historical URLs / GitLab-era provenance links keep resolving (not deleted, not a live mirror).
- Q: How should vulnerability reports be routed on GitHub? → A: **Enable GitHub Private Vulnerability Reporting AND keep the `security@tallyrow.com` email channel** (two intake paths, no disclosure gap; GitHub Security Advisories for coordinated fixes).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contributor follows GitHub-correct guidance (Priority: P1)

A new contributor reads `CONTRIBUTING.md`, clones the repo, creates a branch, and opens a change for review using only GitHub tooling — with no step that references a GitLab-only command, URL, or concept that would fail or mislead them.

**Why this priority**: The contribution path is the most-used document and the most visible inconsistency after the move; broken instructions block or confuse every new contributor. This is the MVP of the remaining migration.

**Independent Test**: Walk the documented contribution flow end-to-end on GitHub (clone → branch → open a pull request) and confirm every instruction resolves on GitHub with zero GitLab-only steps.

**Acceptance Scenarios**:

1. **Given** a contributor with no prior context, **When** they follow `CONTRIBUTING.md` to open a change for review, **Then** every command and link refers to GitHub (pull requests, `gh`/web, GitHub issues) and none refers to `glab`, "merge request", or a GitLab URL except where explicitly marked historical.
2. **Given** a contributor filing a bug, feature, or security report on GitHub, **When** they start a new issue, **Then** the migrated Bug / Feature / Security templates are offered.
3. **Given** a contributor opening a pull request, **When** the PR body loads, **Then** the migrated pull-request template (Summary / What changed / Verification / Test plan / Constitution touchpoints / DCO) is pre-filled.

---

### User Story 2 - Maintainer cuts a release from an accurate runbook (Priority: P2)

A maintainer follows the "Cutting a release" runbook and the steps match the actual GitHub Actions pipeline: write the CHANGELOG entry, create a **signed** tag, push it, and watch the provenance-attested publish.

**Why this priority**: Releases are infrequent but high-stakes; an inaccurate runbook risks a botched or unsigned release. The current runbook describes the retired GitLab pipeline.

**Independent Test**: Follow the rewritten runbook against a dry-run or the next real release and confirm each step corresponds to a real pipeline stage and outcome (signed-tag gate → quality gates → `npm publish --provenance` via OIDC → provenance verification).

**Acceptance Scenarios**:

1. **Given** a maintainer ready to release, **When** they follow the runbook, **Then** it describes the GitHub Actions signed-tag flow, the npm Trusted Publisher / OIDC tokenless model, and the provenance attestation — with no GitLab pipeline, `glab`, or long-lived-token steps.
2. **Given** the runbook's recovery guidance, **When** a release gate fails, **Then** the documented failure modes match the GitHub workflow's actual gates (signed-tag verification, CHANGELOG validation, provenance/repository match).

---

### User Story 3 - Dependency updates keep flowing on GitHub (Priority: P2)

Dependency-update proposals continue to arrive automatically after the move, preserving the project's update policy, so the dependency set stays current and supply-chain-screened.

**Why this priority**: Lapsed dependency automation silently erodes the supply-chain posture (Principle XI) over time; it is important but not blocking day-to-day contribution.

**Independent Test**: Confirm that, after migration, a dependency-update proposal is generated on GitHub following the existing grouping policy (minor/patch grouped, majors isolated) without acting as a blocking merge gate.

**Acceptance Scenarios**:

1. **Given** the project on GitHub, **When** an upstream dependency has a new compatible version, **Then** an update proposal is opened automatically under the existing policy.
2. **Given** dependency automation is running, **When** it proposes an update, **Then** it is subject to the normal `ci-success` gate but is not itself a required quality gate.

---

### User Story 4 - Governance & security docs reflect the GitHub model (Priority: P3)

Governance and security documents describe how decisions and disclosures actually work on GitHub: the branch-protection ruleset, the solo-maintainer approval policy, the OIDC publish model, and the supported vulnerability-reporting channel.

**Why this priority**: These documents are read less often than the contribution guide but must be accurate for trust and for onboarding future maintainers.

**Independent Test**: Review `GOVERNANCE.md` and `SECURITY.md` and confirm every described mechanism maps to a real GitHub control or channel, with the private email disclosure channel preserved.

**Acceptance Scenarios**:

1. **Given** a reader of `GOVERNANCE.md`, **When** they read how changes are approved and released, **Then** it describes the GitHub branch ruleset and the OIDC trusted-publisher model rather than GitLab MR approval.
2. **Given** a reporter of a vulnerability, **When** they read `SECURITY.md`, **Then** they are routed to the supported GitHub channel (private vulnerability reporting / Security Advisories) and the existing private email, with no GitLab-only step.

---

### User Story 5 - Old GitLab home no longer misleads (Priority: P3)

Someone who finds the old GitLab project is clearly directed to the GitHub home, and the GitLab project no longer accepts new contributions, so source-of-truth is unambiguous.

**Why this priority**: Prevents fragmented contributions and stale-source confusion; lower urgency because the GitHub repo is already canonical.

**Independent Test**: Visit the old GitLab URL and confirm a visible pointer to GitHub and that the project is read-only/archived; confirm `CHANGELOG.md` records the host change.

**Acceptance Scenarios**:

1. **Given** a visitor to the old GitLab project, **When** they arrive, **Then** they see a clear pointer to `github.com/TallyRow/safesignal` and cannot open new contributions there.
2. **Given** the release history, **When** a reader scans `CHANGELOG.md`, **Then** the host change is recorded.

---

### Edge Cases

- **Historical references must not be rewritten.** `CHANGELOG.md` entries and past `specs/` artifacts that mention GitLab are point-in-time records and stay as-is; only living, forward-looking documents change.
- **Host-neutral CI scripts must keep working.** `scripts/ci/*.sh` read `CI_*` environment variables (a GitLab-origin naming) that the GitHub workflows deliberately supply; they must not be "fixed" in a way that breaks the green pipeline.
- **Existing GitLab clones.** A contributor who cloned from GitLab needs documented guidance to repoint their `origin` remote to GitHub.
- **Dead links after archive.** Any doc link pointing at GitLab issues/advisories/pipelines must resolve to a GitHub equivalent (or be removed) before the GitLab project is archived.
- **Solo-maintainer approval reality.** Docs must not promise "reviewer approval" that a single maintainer cannot self-provide; they must describe the actual 0-approval-plus-required-checks model and the CODEOWNERS path for when a second maintainer joins.

## Consumer Impact & Compatibility *(package context)*

- **Public API Surface**: No public API change. This feature touches documentation, repository metadata, issue/PR templates, and dependency automation only.
- **Compatibility Impact**: None for consumers of `@tallyrow/safesignal`. No `src/`, runtime, bundle, or `exports` change.
- **Security & Privacy Considerations**: No change to logging behavior or redaction. The vulnerability-disclosure channel must remain available throughout (no gap during the SECURITY.md change).
- **Supply-Chain / Distribution Impact**: Provenance and reproducible-verification guarantees (Principles XI and IX) MUST remain intact on GitHub — releases stay provenance-attested and every documented quality gate runs identically locally and in CI. Dependency automation must not lapse.
- **Verification & Enforcement**: Documentation accuracy is verified by walking the documented flows against the live GitHub repo; the existing automated gates (`ci-success`, the release pipeline) continue to enforce code/release invariants unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Living contributor-facing documentation (`CONTRIBUTING.md`, `README.md`) MUST describe GitHub mechanics (pull requests, GitHub issues, the `ci-success`/release workflows, `gh`/web flows) and MUST NOT instruct readers to use GitLab-only flows (`glab`, "merge request", GitLab pipeline badges/URLs), except where a reference is explicitly preserved as historical.
- **FR-002**: The repository MUST provide GitHub-native issue templates (Bug, Feature, Security) and a pull-request template under `.github/`, equivalent in intent and required fields to the prior `.gitlab/` templates (including the DCO sign-off and constitution-touchpoints prompts).
- **FR-003**: The "Cutting a release" runbook MUST accurately describe the GitHub Actions signed-tag → provenance-publish flow, matching `release.yml`: signed-tag verification, the quality gates, `npm publish --provenance` via the npm Trusted Publisher (OIDC, no long-lived token), and provenance verification — including realistic failure/recovery guidance.
- **FR-004**: `GOVERNANCE.md` MUST describe the GitHub branch-protection ruleset (PR required, required `ci-success` check, force-push/deletion blocked, the solo-maintainer 0-approval policy and the CODEOWNERS path for a future second maintainer) and the OIDC trusted-publisher release model, in place of the GitLab MR-approval description; maintainer/handle references MUST point to GitHub.
- **FR-005**: `SECURITY.md` MUST route vulnerability reports through a supported GitHub channel (private vulnerability reporting / Security Advisories) while preserving the existing private email channel, and MUST remove steps that depend on GitLab-only features.
- **FR-006**: Dependency-update automation MUST continue on GitHub via the **Renovate GitHub App** (Mend), reusing the existing `renovate.json` policy verbatim (grouped minor/patch, isolated majors); it MUST NOT act as a blocking quality gate. (Decision clarified 2026-06-01: GitHub App, not a scheduled workflow or a switch to Dependabot.)
- **FR-007**: The GitLab project MUST be placed in a read-only/archived state with a visible pointer to the GitHub home, and the host change MUST be recorded in `CHANGELOG.md`.
- **FR-008**: The migration MUST NOT alter package behavior, public API, `exports`, or `src/` runtime code, and MUST keep the host-neutral `scripts/ci/*.sh` helpers working unchanged (the workflows supply the `CI_*` variables they read).
- **FR-009**: Provenance (Principle XI) and reproducible-verification (Principle IX) guarantees MUST remain intact on GitHub: releases stay provenance-attested via OIDC, and every documented quality gate runs through a single documented entrypoint with identical local/CI outcomes.
- **FR-010**: Historical references in `CHANGELOG.md` and past `specs/` MUST be left intact; only living/forward-looking documentation is updated.
- **FR-011**: Documentation MUST include guidance for contributors with an existing GitLab clone to repoint their `origin` remote to GitHub.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A contributor can complete the entire documented contribution flow (clone → branch → open a change for review) using only GitHub tooling, with **zero** steps that reference GitLab.
- **SC-002**: **100%** of living contributor/governance/security documents contain no GitLab-only instruction, link, or badge, except references explicitly marked as historical.
- **SC-003**: Filing each of a Bug, Feature, and Security report, and opening a pull request, on GitHub presents the migrated templates with their required fields intact.
- **SC-004**: A maintainer following the release runbook reaches a successful provenance-attested publish with every step corresponding to a real pipeline stage, and **no** GitLab step.
- **SC-005**: At least one automatic dependency-update proposal is generated on GitHub after migration, following the existing grouping policy.
- **SC-006**: A visitor to the old GitLab URL is directed to the GitHub repository and cannot open new contributions there; the host change is recorded in `CHANGELOG.md`.
- **SC-007**: No regression — the `ci-success` gate and the release pipeline remain green, and npm releases remain provenance-verified, throughout and after the migration.

## Assumptions

- The solo-maintainer governance state continues; the ruleset keeps **0 required approvals** plus the required `ci-success` check, and `CODEOWNERS` / code-owner review is deferred until a second maintainer joins (documented as the trigger).
- GitHub **private vulnerability reporting** can be enabled for the repository; the `security@tallyrow.com` email channel remains the primary intake and is preserved without a disclosure gap.
- The **Renovate GitHub App** will be installed on the TallyRow org (maintainer has org-admin), reusing the existing `renovate.json` verbatim. No scheduled-workflow fallback (decided 2026-06-01).
- The maintainer has GitLab admin rights to **archive** the GitLab project and add a redirect notice; archive (read-only) is preferred over deletion so historical URLs and the provenance source link for any GitLab-era artifacts remain resolvable.
- This work sits within the project's documented "doc-only / repo-metadata / automation" scope (no production code); it is being run through Spec Kit deliberately for rigor and consistency with Principle I, not because `src/` is touched.
- Tracked in GitHub issue #7; companion governance change (constitution v1.4.0) is GitHub PR #4 and is independent of this feature.
