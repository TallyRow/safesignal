# Implementation Plan: CI/CD Pipeline & Release Workflow

**Branch**: `005-cicd-pipeline` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-cicd-pipeline/spec.md`

## Summary

Establish SafeSignal's CI/CD pipeline, release workflow, and
operational hardening on **GitLab.com's free-tier shared runners**.
A new `.gitlab-ci.yml` runs 6 quality-gate stages (typecheck, test,
build, bundle-invariance, dependency-pins regression, DCO sign-off
check) on every MR and on default-branch push, with the test/build
stages parallelized across Node `20.x` + `22.x`. A separate
release pipeline triggers on signed `v*.*.*` git tags, validates
the tag against a documented `CHANGELOG.md` entry, then publishes
`@tallyrow/safesignal` to npm with provenance via GitLab OIDC
trusted-publisher — no long-lived `NPM_TOKEN` anywhere.

Alongside the pipeline, the default branch renames from `master`
to `main` with branch protections enforcing the MR + approval +
CI-green + resolved-threads workflow. F004's stale "Feature 006"
references are corrected. `README.md` gains a CI status badge;
`CONTRIBUTING.md` gains a "Cutting a release" section.

This is **operational hardening only**: no `src/**` or `tests/**`
changes, no dependency changes, no `exports` map shape changes,
no runtime/redaction/sanitizer behavior changes. Verification is
the full test suite passing unchanged + a small grep-based audit
of the new artifacts + (post-merge) the maintainer triggering a
test release-candidate tag to verify the OIDC publish path
end-to-end.

## Technical Context

**Language/Version**: YAML (`.gitlab-ci.yml`), shell (audit + CI
scripts). No TypeScript / runtime code authored by this feature.

**Primary Dependencies**: None added to `package.json`. CI-time
tooling provided by the GitLab runner image:
- `node:22-alpine` (or equivalent) as the default job image for
  the `22.x` matrix arm; `node:20-alpine` for the `20.x` arm.
- `npm` ≥ 9.5 (Node 20 ships npm 10; Node 22 ships npm 10+) —
  required for `npm publish --provenance` support.
- `git` ≥ 2.30 (for `git log`, `git tag -v`, `git merge-base`) —
  pre-installed in the alpine Node images.
- No additional language runtimes or external services beyond
  npm registry + GitLab OIDC token issuer.

**Storage**: N/A.

**Testing**: Vitest + happy-dom (existing; unchanged). The
pipeline's `test` stage runs `npm test`; this feature does not
add new test files (FR-026). Pipeline correctness is verified
post-merge by triggering deliberate failures (e.g., remove a
dependency from `package.json` in a scratch MR) and confirming
the pipeline blocks merge.

**Target Platform**: GitLab.com hosted SaaS + GitLab.com's
**shared CI/CD runners** on the free tier. Constraint set:
- **400 CI/CD minutes per month** per group across all projects
  (the headline free-tier limit; expect to consume ~5-15 minutes
  per MR pipeline including image pull + the 2-Node-version
  matrix, and ~10-20 minutes per release pipeline including
  publish wait). At 10 minutes per MR and ~20 MRs/month, monthly
  usage lands around 200 minutes — comfortable headroom on the
  400-minute budget.
- **Runner specs**: small instance class (1 vCPU, ~3.75 GB RAM,
  ~25 GB ephemeral disk), Linux x86_64. Sufficient for
  SafeSignal's ~2-second-local test suite + 1-second build.
- **No self-hosted runners** required for the v1 pipeline.
  Self-hosted is an upgrade path if CI minute consumption grows.

**Project Type**: Reusable browser-side TypeScript SDK with a
single-package monorepo layout. CI infrastructure is repo-level
metadata; no new directories added to `src/` or `tests/`.

**Performance Goals**:
- Per-MR pipeline target: < 8 minutes wall-clock on shared
  runners (image pull + npm install + 2-Node typecheck/test/build
  matrix + invariance + DCO + dependency-pins).
- Release pipeline target: < 12 minutes wall-clock (the above +
  publish + npm registry propagation observed for provenance).
- DCO check stage: < 5 seconds (it's just a `git log` + regex).

**Constraints**:
- All CI must run on **GitLab.com free-tier shared runners**.
  No self-hosted; no premium-tier features; no Docker-in-Docker
  unless GitLab provides it on free shared runners (it does,
  privileged mode on shared runners).
- **No long-lived `NPM_TOKEN`** in GitLab CI/CD variables.
  Publishing MUST use OIDC trusted-publisher exclusively
  (FR-014). Maintainer-side ops prerequisite: configure the
  trust binding via npm's "Trusted Publishers" UI before the
  first release runs.
- **Constitution preserved verbatim**. This feature operationalizes
  several principles (V Testable+Maintainable, IV Secure-by-Default
  at the supply-chain layer, the API Stability gating from
  Principle I) but amends none.
- **No `src/**` or `tests/**` modifications** (FR-025, FR-026).
- **Node 18.x dropped from CI matrix** (per Clarification Q1) even
  though `package.json` `engines: ">=18.0.0"` still claims support.
  Bumping `engines` is a breaking change deferred to a future
  release.

**Scale/Scope**:
- 1 new top-level file: `.gitlab-ci.yml`
- 4 supporting scripts in a new `scripts/ci/` directory:
  `dco-check.sh`, `bundle-invariance-check.sh`,
  `changelog-validate.sh`, `provenance-verify.sh`
- 4 modified files: `README.md` (badge + version refresh on the
  Roadmap section if needed), `CONTRIBUTING.md` (new "Cutting
  a release" section), `GOVERNANCE.md` (Feature 005/006 reference
  fix), `CLAUDE.md` (SPECKIT marker update)
- Maintainer-side ops (no in-repo changes): GitLab default-branch
  rename `master`→`main`; GitLab branch protection rules; npm
  Trusted Publishers configuration; npm scope 2FA enforcement.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature operationalizes several constitutional guarantees
without amending any principle. No runtime code, no public API
surface, no redaction/sanitizer/transport behavior changes. Each
principle stays intact by construction; several gain enforceable
operational backing.

- **API Stability (Principle I)**: No public API change. The
  feature adds CI enforcement for the API-stability claim — every
  MR's `dependency-pins` regression stage (FR-006) gates on the
  contract test from F001/F002 that locks the `exports` map shape
  and dependency set. The MR template's DCO sign-off check (FR-007)
  enforces F004's published contributor contract. **PASS** —
  principle strengthened at the enforcement layer.

- **Browser Resilience & Failure Safety (Principle II)**: No
  runtime code change. Fail-closed pipeline, bounded sanitizer,
  URL scrubber, transport security contract all preserved
  verbatim (FR-028). **PASS — no surface touched.**

- **Neutrality & Portability (Principle III)**: GitLab is the CI
  platform but the *consumer* contract stays portable across
  build platforms. The `.gitlab-ci.yml` is build-time
  infrastructure; consumers consuming `@tallyrow/safesignal` don't
  care whether the artifact was built on GitLab, GitHub, or
  Jenkins. No framework or vendor leak into the published
  artifact. **PASS.**

- **Structured Observability (Principle IV)**: Event model and
  level behavior unchanged. The release pipeline's npm provenance
  attestation extends Principle IV's "stable, documented,
  machine-parseable structure" claim to the *supply chain*: every
  published version carries a verifiable cryptographic link back
  to the specific CI workflow run that produced it. **PASS** —
  supply-chain observability newly added.

- **Secure Logging by Default & Sensitive Data Minimization
  (Principle V — non-negotiable)**: Redaction defaults,
  sanitizer limits, URL scrubber, fail-closed handling all
  preserved verbatim. **POSITIVE supply-chain impact**: the OIDC
  trusted-publisher approach removes the long-lived `NPM_TOKEN`
  attack surface entirely. A stolen-token scenario can no longer
  publish a malicious version of `@tallyrow/safesignal`. The
  2FA-on-`@tallyrow/`-scope requirement (FR's maintainer-side
  ops prerequisite) closes a residual maintainer-account-
  compromise vector. **PASS — strengthened.**

- **Log Integrity & Monitoring Suitability (Principle VI)**:
  Event production, ordering, dropping, batching, transformation,
  and attribution semantics all unchanged. No transport surface
  modified. **PASS.**

- **Lightweight Logger Instances & Federated Runtime (Principle
  VII)**: No per-`Logger` cost change. No global listener, no
  ambient state read, no network call introduced. Federated
  host/module ownership contract unchanged. **PASS.**

**Constitution check gate: PASS** — zero violations, several
principles operationalized. Re-evaluated post-Phase-1 at the
bottom of this file.

## Project Structure

### Documentation (this feature)

```text
specs/005-cicd-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 — GitLab free-tier limits, OIDC mechanics, npm provenance, DCO patterns
├── data-model.md        # Phase 1 — pipeline shape inventory + branch-protection policy
├── quickstart.md        # Phase 1 — contributor walkthrough + "how to cut a release" rehearsal
├── contracts/
│   ├── ci-pipeline-stages.md       # FR-001..FR-010 stage contracts + pass/fail criteria
│   ├── release-pipeline.md         # FR-011..FR-017a release-pipeline + provenance + CHANGELOG validation
│   ├── branch-protection-policy.md # FR-018..FR-021 GitLab protection rules + default-branch rename
│   ├── dco-check.md                # FR-007 sign-off verification script contract
│   └── audit-script.md             # FR-029..FR-032 post-merge verification contract
├── checklists/
│   └── requirements.md  # Already completed by /speckit-clarify
└── tasks.md             # Created by /speckit-tasks (not by this command)
```

### Source Code (repository root) — files touched by the feature

```text
.gitlab-ci.yml                         # NEW — the CI pipeline + release jobs
scripts/
└── ci/
    ├── dco-check.sh                   # NEW — verifies Signed-off-by: on MR commit range
    ├── bundle-invariance-check.sh     # NEW — dual-build + gzipped diff vs merge-base
    ├── changelog-validate.sh          # NEW — verifies pushed tag has matching ## [vX.Y.Z] in CHANGELOG.md
    └── provenance-verify.sh           # NEW — post-publish smoke test (npm audit signatures)
README.md                              # MODIFIED — add CI pipeline status badge in Project resources
CONTRIBUTING.md                        # MODIFIED — add "Cutting a release" section
GOVERNANCE.md                          # MODIFIED — fix "Feature 006" → "Feature 005" stale references
CLAUDE.md                              # MODIFIED — SPECKIT marker now points at this plan
```

**Files NOT touched (preserved boundaries)**:

```text
src/**                                 # FR-025 — no source-code changes
tests/**                               # FR-026 — no test logic changes
package.json                           # FR-027 — no dependency/exports changes
                                       #   (CI tooling lives in the runner image, not in devDependencies)
.specify/memory/constitution.md        # constitution preserved verbatim
dist/**                                # build output; regenerated identically by CI
docs/safe-logging.md                   # not in scope
examples/**                            # not in scope
specs/001-* through specs/004-*        # archival; per F004 FR-018; preserved
```

**Maintainer-side ops actions (no in-repo changes, but blocking for completion)**:

```text
GitLab project Settings → Repository → Default branch       # rename master → main (FR-018)
GitLab project Settings → Repository → Protected branches  # configure main protections (FR-019)
GitLab project Settings → CI/CD → Variables                # confirm NO NPM_TOKEN exists (SC-006)
npm "Trusted Publishers" UI on @tallyrow/safesignal page   # configure GitLab OIDC trust (FR-014)
npm scope @tallyrow/ Settings → require 2FA for publish    # enforce 2FA (Assumptions)
```

**Structure Decision**: Single-package layout preserved. The new
`scripts/ci/` directory holds shell scripts that are checked into
the repo (so contributors can run them locally before pushing)
but are invoked from `.gitlab-ci.yml` jobs. Keeping CI scripts
in-repo (not embedded as inline YAML) makes them testable,
reviewable, and reusable in a developer's local pre-push checks.

## Phase 0 — Research

See [`research.md`](./research.md). Phase 0 captures:

1. **GitLab.com free-tier CI/CD limits** — 400 minutes/month per
   group, shared-runner specs (1 vCPU / ~3.75 GB / Linux x86_64),
   Docker-in-Docker support, image cache behavior, the
   `tags: [saas-linux-small-amd64]` runner tag.
2. **`.gitlab-ci.yml` shape for this pipeline** — `stages:` ordering,
   `parallel: matrix:` for the Node version matrix, `rules:` for
   MR vs default-branch vs tag triggers, `cache:` for `node_modules`
   and the npm cache directory, `artifacts:` for passing `dist/`
   between build and downstream stages.
3. **GitLab OIDC trusted-publisher integration with npm** —
   token issuance flow, the OIDC subject claim shape
   (`project_path:tallyrow/safesignal:ref_type:tag:ref:v*`),
   trust-binding configuration on npm's "Trusted Publishers" UI,
   `id_tokens:` block syntax in `.gitlab-ci.yml`.
4. **`npm publish --provenance` mechanics** — required npm CLI
   version (≥ 9.5), Sigstore integration, what the attestation
   contains, how `npm audit signatures` verifies it post-publish.
5. **DCO sign-off check implementation patterns** — shell-based
   `git log --no-merges <base>..<head> --format=%B | grep` vs
   commit-by-commit verification; handling of GitLab-bot-authored
   merge commits; the failure-output format.
6. **Bundle-invariance comparison mechanics** — how the CI job
   builds at both the merge-base and HEAD, gzips both artifacts,
   computes the delta, fails if > 1 KiB.
7. **`master`→`main` rename mechanics** — GitLab UI flow, the
   automatic branch alias (FR-021), the in-repo grep+sweep
   strategy, gotchas with hard-coded `master..HEAD` references in
   archival spec contracts.
8. **CHANGELOG.md validation script** — regex for matching
   `^## \[vX\.Y\.Z\]` or `^## \[X\.Y\.Z\]` against the tagged
   version; failure path when missing; how to handle pre-release
   tags (`v1.0.1-rc.1`).

## Phase 1 — Design & Contracts

See [`data-model.md`](./data-model.md),
[`contracts/`](./contracts/), and [`quickstart.md`](./quickstart.md).
Phase 1 captures:

- **data-model.md**: Pipeline-shape inventory — stages, jobs,
  rules, OIDC config, branch-protection policy, maintainer-side
  ops checklist. Authoritative source for tasks.md's file-creation
  list.
- **contracts/ci-pipeline-stages.md**: Per-stage pass/fail
  criteria for each of the 6 quality gates (FR-002..FR-007),
  matrix-job behavior, parallelism rules, expected timings.
- **contracts/release-pipeline.md**: Tag-trigger rules, OIDC
  token claims, signed-tag verification, CHANGELOG-validation
  step (FR-017a), dist-tag derivation, post-publish
  provenance-verification step.
- **contracts/branch-protection-policy.md**: The exact GitLab
  branch-protection settings on `main` (FR-019) plus the rename
  procedure (FR-018, FR-020, FR-021).
- **contracts/dco-check.md**: The DCO check script's exact
  behavior — what commit range it inspects, how it filters bot
  authors, the failure-output format with line-by-line offending
  commit identification.
- **contracts/audit-script.md**: The grep-based post-merge audit
  that verifies all of FR-001..FR-032 are mechanically present
  (analogous to F004's file-presence-audit.md).
- **quickstart.md**: Contributor walkthrough — local pre-push
  rehearsal of the CI checks; maintainer's "how to cut a release"
  rehearsal.

After Phase 1 artifacts ship, this plan's CLAUDE.md SPECKIT
marker updates to point at `specs/005-cicd-pipeline/plan.md`.

## Phase 2 — Tasks (NOT created by /speckit-plan)

`/speckit-tasks` will produce a `tasks.md` that breaks the work
into roughly the following structure:

- **Phase 1 Setup**: Capture pre-feature CI minute usage + test
  baseline (small)
- **Phase 2 Foundational**: Maintainer-side ops — GitLab branch
  rename + protection rules + npm Trusted Publishers config + 2FA
  on `@tallyrow/`. These BLOCK the in-repo work that targets
  `main` and the publish pipeline. Same pattern as F003's T003
  (GitLab slug rename) and F004's tallyrow.com email setup.
- **US1**: `.gitlab-ci.yml` quality-gate stages + `scripts/ci/`
  helpers + first-pipeline smoke test on a no-op MR
- **US2**: Release pipeline + signed-tag handling + OIDC config +
  CHANGELOG-validation + provenance-verify + first release-
  candidate publish to verify end-to-end
- **US3**: `master`→`main` rename + in-repo sweep + GOVERNANCE
  doc fix
- **US4**: README badge + CONTRIBUTING "Cutting a release"
  section
- **Polish**: full audit + final-review writeup + announce-
  in-CHANGELOG entry (this becomes the v1.0.1 entry — F005 ships
  no consumer-visible API change so it's a patch bump)

US1 and US3 can be in flight in parallel (US3's branch-rename
needs to land BEFORE US1's pipeline targets `main`, but the
in-repo `master`→`main` sweep doc work can happen in parallel
with pipeline development).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Constitution check passes initial and is
re-confirmed at end-of-plan (see "Post-Phase-1 gate" below).

## Post-Phase-1 Constitution Re-check

The Phase 1 artifacts (data-model.md, contracts/, quickstart.md)
do not introduce any new code, runtime behavior, dependency, or
public interface. They are descriptive operational contracts +
shell scripts that run at CI time only + a contributor-onboarding
walkthrough. All 7 constitutional principles remain **PASS**
after Phase 1 design. No re-evaluation triggered any change to
plan.md.
