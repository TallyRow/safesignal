# Data Model: CI/CD Pipeline & Release Workflow

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](./spec.md)
**Plan**: [005-cicd-pipeline/plan.md](./plan.md)
**Date**: 2026-05-28

For a CI/CD infrastructure feature, the "data model" is the
**operational surface inventory** — pipeline structure (stages,
jobs, rules), branch-protection policy, scripts, OIDC trust
binding, plus the in-repo file changes that ship it. This is the
authoritative checklist for `tasks.md`.

## Entities

### `.gitlab-ci.yml`

The single CI/CD configuration file at repo root. Defines two
logical pipelines via job rules:

| Pipeline | Trigger | Job set |
|---|---|---|
| Quality-gate pipeline | MR creation/push, default-branch push | typecheck, test, build, bundle-invariance, dependency-pins, dco-check (MRs only) |
| Release pipeline | Push of tag matching `v[0-9]+.[0-9]+.[0-9]+(-[\w.]+)?` | verify-tag-signed, the full quality-gate set, changelog-validate, publish, provenance-verify |

Both pipelines use the same `node:<VERSION>-alpine` image for
their jobs, the same `npm ci` install step, and the same `cache:`
configuration keyed on `package-lock.json`.

### Node version matrix

| Variable | Values | Used in |
|---|---|---|
| `NODE_VERSION` | `"20"`, `"22"` | typecheck, test, build jobs (parallel matrix arms) |

Audit / DCO / changelog / publish jobs run single-Node (Node `22`
default — latest LTS).

### Stages

Ordered by execution dependency:

| # | Stage | Jobs in this stage | Parallel? |
|---|---|---|---|
| 1 | `typecheck` | `typecheck` (× 2 Node matrix), `verify-tag-signed` (release only) | Yes within matrix |
| 2 | `test` | `test` (× 2 Node matrix) | Yes within matrix |
| 3 | `build` | `build` (× 2 Node matrix) | Yes within matrix |
| 4 | `audit` | `bundle-invariance`, `dependency-pins`, `dco-check` (MR only), `changelog-validate` (release only) | All audit jobs run in parallel |
| 5 | `publish` | `publish` (release only), `provenance-verify` (release only, after publish) | Serialized: publish before verify |

### Branch protection policy (on `main`, after rename)

| Rule | Value |
|---|---|
| Allow direct push | **No** (force all changes through MRs) |
| Allow force-push | **No** |
| Allow branch deletion | **No** |
| Require merge request approval | **Yes**, minimum 1 approver |
| Required approvers | Project maintainers (currently: `johng`) |
| Require successful pipeline | **Yes** (status must be `success`, not `passed-with-warnings`) |
| Require resolved threads | **Yes** |
| Allow contributors to push to source branch | Yes (so MRs can be updated) |
| Squash on merge | Maintainer's preference (recommend: optional, not required) |
| Delete source branch after merge | Yes (set as default via `merge_request.remove_source_branch` push option, also configurable as project default) |

### OIDC trusted-publisher binding (npm side)

Configured once via npm's web UI at
`https://www.npmjs.com/package/@tallyrow/safesignal/access`
under "Trusted Publishers":

| Field | Value |
|---|---|
| Issuer | `https://gitlab.com` |
| Subject claim pattern | `project_path:tallyrow/safesignal:ref_type:tag:ref:v*` |
| Workflow file | `.gitlab-ci.yml` |
| Environment | (none — no GitLab CI environment used) |

This binding means: only OIDC tokens issued by GitLab.com, for
the `tallyrow/safesignal` project, on a tag ref starting with
`v`, can publish to the `@tallyrow/safesignal` package on npm.

### Signed git tag

| Field | Value |
|---|---|
| Format | `v[MAJOR].[MINOR].[PATCH]` (stable) or `v[MAJOR].[MINOR].[PATCH]-[PRERELEASE]` (e.g., `v1.0.1-rc.1`, `v1.1.0-beta.2`) |
| Signature | Required (GPG or SSH, configured via `git config user.signingkey`); created via `git tag -s <tag> -m '<message>'`; verified via `git tag -v <tag>` |
| Tagged commit reachability | Must be an ancestor of `origin/main` HEAD at tag-push time |
| CHANGELOG entry | Must have a matching `## [<version>]` or `## [v<version>]` heading in `CHANGELOG.md` |

### npm provenance attestation

Sigstore-signed metadata attached automatically by
`npm publish --provenance` when the publish job runs inside a
recognized OIDC environment. Visible at:
- npmjs.com package page → "Provenance" section (per version)
- `npm audit signatures` CLI output
- Sigstore Rekor transparency log

### Maintainer-side ops checklist

Actions that happen outside the repo and outside CI but block
feature completion:

| Action | Where | Who | Blocks |
|---|---|---|---|
| Rename default branch `master` → `main` | GitLab Settings → Repository | Maintainer | FR-018, FR-019, all in-repo `main` references |
| Configure branch protections on `main` | GitLab Settings → Repository → Protected branches | Maintainer | FR-019 |
| Enforce 2FA on `@tallyrow/` npm scope | npm web UI | Maintainer | publish step (npm requires 2FA for trusted-publisher to work) |
| Configure npm Trusted Publishers binding | npm package page → Access settings | Maintainer | publish step |
| Verify first-publish status of `@tallyrow/safesignal` on npm | `npm view @tallyrow/safesignal versions` | Maintainer (read-only check) | publish step (claim-vs-republish path) |
| Confirm NO `NPM_TOKEN` in GitLab CI/CD variables | GitLab Settings → CI/CD → Variables | Maintainer | SC-006 |

## Per-file content inventory

### `.gitlab-ci.yml` (NEW)

| Element | Content |
|---|---|
| `default:` block | `image: node:22-alpine`; `cache:` keyed on `package-lock.json`; `before_script:` runs `npm ci --prefer-offline --no-audit --no-fund` |
| `stages:` list | `typecheck`, `test`, `build`, `audit`, `publish` (in this order) |
| `.node_matrix` hidden job | `parallel:matrix:` with `NODE_VERSION: ["20", "22"]`; sets `image: node:$NODE_VERSION-alpine` |
| `typecheck` job | extends `.node_matrix`; runs `npm run typecheck`; MR + default-branch rules |
| `test` job | extends `.node_matrix`; runs `npm test`; MR + default-branch rules |
| `build` job | extends `.node_matrix`; runs `npm run build`; emits `dist/` artifact; MR + default-branch rules |
| `bundle-invariance` job | runs `scripts/ci/bundle-invariance-check.sh`; needs `build` artifact; MR + default-branch rules |
| `dependency-pins` job | runs `npm test -- tests/contract/dependency-pins.test.ts tests/security/bundle-shape.security.test.ts tests/security/transport-beacon-bundle-shape.security.test.ts`; MR + default-branch rules |
| `dco-check` job | runs `scripts/ci/dco-check.sh`; MR-only rule (`$CI_PIPELINE_SOURCE == "merge_request_event"`) |
| `.release_only` hidden job | rule: `$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+(-[\w.]+)?$/` |
| `verify-tag-signed` job | extends `.release_only`; runs `git tag -v` + ancestor check; stage `typecheck` (fail-fast) |
| `changelog-validate` job | extends `.release_only`; runs `scripts/ci/changelog-validate.sh`; stage `audit` |
| `publish` job | extends `.release_only`; `id_tokens: NPM_ID_TOKEN: { aud: https://registry.npmjs.org }`; computes dist-tag from tag string; runs `npm publish --provenance --tag $DIST_TAG`; needs all earlier release-pipeline jobs |
| `provenance-verify` job | extends `.release_only`; runs `scripts/ci/provenance-verify.sh "$CI_COMMIT_TAG"`; needs `publish` |

### `scripts/ci/dco-check.sh` (NEW)

Per `contracts/dco-check.md`. Verifies every non-bot commit in
the MR's commit range carries a `Signed-off-by:` footer matching
the commit author. Exits 0 on pass, 1 on fail with diagnostic
output naming offending commits + recovery commands.

### `scripts/ci/bundle-invariance-check.sh` (NEW)

Per `contracts/ci-pipeline-stages.md` and F003's
`bundle-invariance.md`. Builds the merge-base commit in a
worktree, gzips `dist/index.mjs` + `dist/transport-beacon.mjs`
from both pre- and post-builds, asserts `abs(post - pre) <= 1024`
bytes for each. Exits 0 on pass, 1 on fail.

### `scripts/ci/changelog-validate.sh` (NEW)

Per `contracts/release-pipeline.md`. Extracts the version from
`$CI_COMMIT_TAG`, greps `CHANGELOG.md` for a matching
`## [<version>]` heading, exits 0 on match / 1 on miss with
diagnostic naming the expected heading format.

### `scripts/ci/provenance-verify.sh` (NEW)

Post-publish smoke test. Runs `npm view <package>@<tag>` (with
~30 second sleep first for npm registry propagation) and confirms
the published version's provenance metadata is reachable via
`npm audit signatures --pkg=<package>@<tag>`. Soft-fail (warns
but doesn't fail the pipeline) if provenance lookup times out —
the publish succeeded; only the verification is unreliable.

### `README.md` (MODIFIED)

Add a CI pipeline status badge near the top of the "Project
resources" section. Markdown form:

```markdown
[![pipeline status](https://gitlab.com/tallyrow/safesignal/badges/main/pipeline.svg)](https://gitlab.com/tallyrow/safesignal/-/commits/main)
```

(GitLab auto-renders the SVG; clicking the badge takes the
reader to the pipeline runs for `main`.)

### `CONTRIBUTING.md` (MODIFIED)

Add a new `## Cutting a release` section between `## Local
development setup` and `## Where to ask questions` (or wherever
makes sense in the existing structure). Content per FR-024 and
the `quickstart.md` walkthrough.

### `GOVERNANCE.md` (MODIFIED)

Fix the stale "Feature 006" references to "Feature 005" or
analogous. Specifically: the `npm publish` decision-authority
domain mentions "CI-mediated publish via OIDC planned in
Feature 006" — change to "Feature 005" (or "as of v1.0.1, CI-
mediated publish is configured per Feature 005").

### `CLAUDE.md` (MODIFIED)

Update the SPECKIT marker to point at
`specs/005-cicd-pipeline/plan.md`.

## Validation rules

Each rule keys to one or more spec FRs.

- **R-001 (FR-001, FR-008)**: `.gitlab-ci.yml` exists; runs on
  MRs to the default branch; runs on default-branch pushes; all 6
  quality-gate stages execute on every MR (none skipped).
- **R-002 (FR-002)**: `typecheck` stage runs `npm run typecheck`
  on both Node `20.x` and Node `22.x`; fails on any TS error.
- **R-003 (FR-003)**: `test` stage runs `npm test`; non-regression
  gate (pass count doesn't decrease, failing/unhandled count
  doesn't increase).
- **R-004 (FR-004)**: `build` stage runs `npm run build`; emits
  `dist/` artifact for downstream stages.
- **R-005 (FR-005)**: `bundle-invariance` stage compares gzipped
  sizes of `dist/index.mjs` + `dist/transport-beacon.mjs` against
  merge-base build; fails if delta > 1024 bytes.
- **R-006 (FR-006)**: `dependency-pins` stage runs the 3 named
  test files; fails on any test failure.
- **R-007 (FR-007)**: `dco-check` stage verifies every non-bot
  commit on the MR commit range carries `Signed-off-by:`.
- **R-008 (FR-010, Clarification Q1)**: Node matrix is exactly
  `["20", "22"]`; not `["18", "20", "22"]` or just `["22"]`.
- **R-009 (FR-011..FR-017a, Clarification Q2)**: Release pipeline
  triggers on `v*.*.*` signed tags; verifies signature; verifies
  ancestor of default branch; runs all quality gates; validates
  CHANGELOG entry; publishes with provenance via OIDC; derives
  dist-tag from version string (pre-release → `next`, stable →
  `latest`).
- **R-010 (FR-014, SC-006)**: NO long-lived `NPM_TOKEN` in
  GitLab CI/CD variables; publish auth via OIDC exclusively.
- **R-011 (FR-018..FR-021)**: Default branch renamed to `main`;
  branch protections enforce MR-only, approval-required,
  CI-required, threads-resolved, no force-push, no direct push.
- **R-012 (FR-020)**: Forward-going artifacts reference `main`,
  not `master`. Archival specs preserved verbatim.
- **R-013 (FR-022, SC-012)**: F004's stale "Feature 006"
  reference in `GOVERNANCE.md` is updated to "Feature 005".
- **R-014 (FR-023, SC-011)**: README displays a CI pipeline
  status badge linking to GitLab pipelines page.
- **R-015 (FR-024, SC-009)**: CONTRIBUTING has a "Cutting a
  release" section with all 6 required content elements
  (SemVer, CHANGELOG-first workflow, signed-tag command,
  pipeline stage description, npm verification, rollback).
- **R-016 (FR-026, FR-032, SC-010)**: `npm test` produces the
  same test count, pass count, todo count, failing count, and
  unhandled count as the pre-feature baseline.
- **R-017 (FR-025, FR-027, FR-028)**: No `src/**` or `tests/**`
  modifications; no `package.json` `dependencies`/`devDependencies`
  changes; no `exports` map shape changes.

## State transitions

The feature ships in roughly three operational handoff phases:

1. **In-repo work merges first** (US1 + US3 + US4 in-repo
   portions): `.gitlab-ci.yml`, scripts, README, CONTRIBUTING,
   GOVERNANCE, CLAUDE.md updates. Tests pass; merge.
2. **Maintainer-side ops execute next** (Phase 2 Foundational
   from tasks.md, but with the in-repo work already merged): GitLab
   branch rename + protections, npm 2FA + Trusted Publishers
   configuration.
3. **Dogfood validation**: maintainer creates a signed `v1.0.1-rc.1`
   tag, watches the release pipeline run end-to-end, verifies
   the RC publish + provenance. If green, cuts the actual `v1.0.1`
   stable release tag — same pipeline runs again, ships under
   `latest`.

The dogfood phase is the real acceptance gate. Until a release
pipeline successfully publishes with provenance, the feature
isn't truly proven.
