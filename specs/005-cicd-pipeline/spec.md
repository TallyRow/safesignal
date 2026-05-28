# Feature Specification: CI/CD Pipeline & Release Workflow

**Feature Branch**: `005-cicd-pipeline`

**Created**: 2026-05-28

**Status**: Draft

## Clarifications

### Session 2026-05-28

- Q: Node.js version matrix for CI → A: Node `20.x` + `22.x` (current LTS and next LTS). Two parallel jobs. Drop `18.x` from CI matrix despite `package.json` `engines: ">=18.0.0"` — `18.x` is at end-of-active-LTS as of April 2025 and reaches end-of-life April 2026; testing against it is increasingly low-signal. Bumping `package.json` `engines` to `>=20.0.0` is NOT part of this feature (would be a breaking change for consumers still on `18.x`); decision deferred to a future release.
- Q: CHANGELOG.md release-entry automation → A: Manual entries. Matches Feature 003's v1.0.0 entry pattern. Maintainer writes the CHANGELOG entry by hand BEFORE creating the release tag. The release pipeline READS the existing CHANGELOG to validate that the tagged version matches a documented entry — if the tag is `v1.0.1` but CHANGELOG has no `## [1.0.1]` section, pipeline fails the validation step. No commit to Conventional Commits or other formal commit-message convention. Re-evaluatable if release cadence grows.

**Input**: User description: "Establish SafeSignal's CI/CD pipeline,
release workflow, and operational hardening — the work that Feature
004's community documents already promise but don't enforce. Add a
`.gitlab-ci.yml` running on every merge request and on default-
branch push with these stages: typecheck, full test suite,
production build, bundle-invariance audit, dependency-pins
regression, and a DCO sign-off check. Add a release workflow
triggered on signed git tags that publishes `@tallyrow/safesignal`
to npm with provenance via GitLab OIDC trusted-publisher.
Configure branch protections on the default branch. Rename the
default branch from `master` to `main`. Fix Feature 004's stale
'Feature 006' references. Add a CI pipeline status badge to the
README and document the release process in CONTRIBUTING.md. Out
of scope: lint/format config, dependency-update bots, pre-commit
hooks, coverage gating, security scanning, runtime code changes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Every merge request is gated by automated checks (Priority: P1)

A contributor (or the maintainer) opens a merge request against
the default branch. Before the MR can merge, GitLab automatically
runs the project's quality gates — typecheck, full test suite,
production build, bundle-invariance audit, dependency-pins
regression, and DCO sign-off verification. If any gate fails, the
merge is blocked and the contributor sees a clear failure summary
in the GitLab MR UI. If all gates pass, the merge is permitted
(subject to maintainer approval and resolved threads).

**Why this priority**: This is the operational backbone of the
project. Feature 004 shipped CONTRIBUTING.md describing a DCO
sign-off requirement and an MR template referencing a "Test plan"
checklist — none of which is mechanically enforced today. Without
CI gating, every contract from Features 001–003 (test-suite
invariance, bundle invariance, dependency pins) depends on the
maintainer remembering to run the checks locally, which is not
a sustainable trust model for an open-source package.

**Independent Test**: Open a no-op MR (any tiny doc change), watch
GitLab pipeline run, verify all gates pass and the merge button
becomes available. Then open a deliberately-broken MR (e.g.,
remove a dependency from `package.json`); the pipeline fails, the
merge button is disabled, and the failure reason is clear.

**Acceptance Scenarios**:

1. **Given** a contributor opens an MR with valid, signed-off
   commits, **When** the GitLab pipeline runs, **Then** every
   stage (typecheck, test, build, bundle-invariance,
   dependency-pins regression, DCO sign-off check) completes
   green and the pipeline status badge in the MR reads "passed".
2. **Given** a contributor opens an MR whose commits lack
   `Signed-off-by:` footers, **When** the pipeline runs, **Then**
   the DCO check stage fails with a message explicitly naming the
   offending commits and pointing the contributor at
   `CONTRIBUTING.md` § Developer Certificate of Origin for the
   sign-off command (`git commit --amend --signoff` or
   `git rebase --signoff -i <base>`).
3. **Given** a contributor opens an MR that breaks a test, **When**
   the pipeline runs, **Then** the test stage fails with the
   vitest output identifying the failing test, and the MR's
   merge button is disabled.
4. **Given** a contributor opens an MR that increases
   `dist/index.mjs` gzipped size by more than 1 KiB, **When** the
   pipeline runs, **Then** the bundle-invariance stage fails with
   a diff showing the old vs new gzipped size and the delta.
5. **Given** a contributor opens an MR that modifies
   `package.json` `dependencies` or the `exports` map, **When**
   the pipeline runs, **Then** the dependency-pins regression
   stage fails citing the contract test from
   `tests/contract/dependency-pins.test.ts`.
6. **Given** an MR pipeline has passed, **When** the maintainer
   approves the MR, **Then** the merge button is enabled and the
   maintainer can merge.

---

### User Story 2 — Releases publish to npm with provenance via signed tags (Priority: P1)

The maintainer cuts a release by creating a signed git tag of the
form `v1.0.1` (or `v1.1.0`, `v2.0.0`, etc.) and pushing it. A
dedicated release pipeline triggers on the tag push, runs the
full quality-gate stages once more, then publishes
`@tallyrow/safesignal` to npm with provenance. The publish uses
GitLab OIDC trusted-publisher — no long-lived `NPM_TOKEN` is
stored anywhere. After publish, the npm registry page shows
provenance attestation (a verified link from the published
artifact back to the specific GitLab CI workflow run that
produced it).

**Why this priority**: The maintainer currently has npm publish
rights but no automation — every release requires running `npm
publish` from a development machine with a long-lived token. That
is a supply-chain risk (token theft, accidental publish of
uncommitted work, no provenance attestation). The OIDC-mediated
release pipeline is best-practice for modern npm publishing as of
2024–2025 and is what the GOVERNANCE.md document already promises.

**Independent Test**: Maintainer creates and pushes a signed test
tag (e.g., `v1.0.1-rc.1`) against a release-candidate branch.
The release pipeline runs end-to-end, publishes a release-
candidate version to npm under the `next` dist-tag, and the npm
registry's "Provenance" section on the package page shows the
GitLab pipeline run as the source. The maintainer can verify the
attestation chain by clicking through to the GitLab pipeline.

**Acceptance Scenarios**:

1. **Given** the maintainer creates a signed annotated git tag
   matching `v[0-9]+.[0-9]+.[0-9]+` (or pre-release variants),
   **When** they push the tag to origin, **Then** the release
   pipeline triggers automatically.
2. **Given** the release pipeline is running, **When** any of the
   quality-gate stages (typecheck, test, build, bundle-invariance,
   dependency-pins) fails, **Then** the publish step does NOT
   execute and the maintainer is notified of the failure.
3. **Given** all quality gates pass on a release pipeline,
   **When** the publish step runs, **Then** the package is
   published to npm with `--provenance` enabled, the OIDC token
   exchange completes successfully, and the npm registry shows
   the new version + provenance attestation within ~2 minutes.
4. **Given** a release has been published, **When** a consumer
   runs `npm view @tallyrow/safesignal versions --json` or
   inspects the package page on npmjs.com, **Then** they see the
   new version listed with a verifiable provenance attestation
   linking back to the GitLab CI workflow run.
5. **Given** the maintainer attempts to push an unsigned tag
   (created with `git tag` rather than `git tag -s`), **When**
   the tag reaches origin, **Then** the release pipeline does
   NOT publish (signed-tag-only policy enforced at the pipeline
   level, not just by convention).
6. **Given** a maintainer-side ops prerequisite is not yet
   complete (npm scope `@tallyrow/` doesn't have 2FA enabled, or
   the GitLab–npm OIDC trusted-publisher relationship is not
   configured), **When** the publish step runs, **Then** it fails
   with a diagnostic message naming the missing prerequisite, and
   no partial publish occurs.

---

### User Story 3 — Default branch is `main` with full branch protections (Priority: P2)

The default branch is renamed from `master` to `main`. Every
contributor (including the maintainer) interacts with the project
through merge requests against `main` — no direct push, no
force-push, no merge without CI green + approval + resolved
threads. The in-repo documents (CLAUDE.md, GOVERNANCE.md,
contracts, scripts) all reference `main` consistently. External
references (GitLab project URL, README links) work via GitLab's
automatic branch redirects from `master` for the protection
window.

**Why this priority**: Without branch protections, the
"every change goes through MR + approval + CI" workflow described
in CONTRIBUTING.md and GOVERNANCE.md is unenforced — anyone with
push rights (currently the maintainer) can bypass it accidentally.
The rename to `main` is a small modernization that aligns with
ecosystem convention (npm, GitHub trending, most OSS projects).

**Independent Test**: After this story ships: `git branch -a`
locally shows `main` as the default; the maintainer attempts a
direct `git push origin main` and gets rejected by GitLab with
"branch is protected"; the maintainer attempts a `git push
--force origin main` and gets rejected; a fresh MR against `main`
with valid CI runs through the protection gates as expected.

**Acceptance Scenarios**:

1. **Given** the GitLab default branch has been renamed from
   `master` to `main`, **When** a contributor clones the repo
   fresh, **Then** the local `HEAD` tracks `origin/main` and
   `git branch --show-current` reads `main`.
2. **Given** branch protections are configured on `main`, **When**
   the maintainer attempts `git push origin main` from a local
   working copy, **Then** GitLab rejects the push with a clear
   message ("you cannot push directly to a protected branch; open
   an MR").
3. **Given** branch protections are configured on `main`, **When**
   anyone attempts `git push --force origin main` or any equivalent
   destructive push, **Then** GitLab rejects it.
4. **Given** an MR's CI pipeline has failed, **When** anyone
   attempts to merge the MR, **Then** GitLab disables the merge
   button with a "pipeline must succeed" message.
5. **Given** an MR has unresolved discussion threads, **When**
   anyone attempts to merge, **Then** GitLab disables the merge
   button with a "resolve all threads" message.
6. **Given** the repo has been swept for `master` references,
   **When** a reviewer runs `grep -rn 'master' --include='*.md'
   --include='*.yml' --include='*.json' --include='*.ts'` against
   the repo (excluding archival historical artifacts and
   third-party / generated files), **Then** every remaining
   occurrence either refers to (a) a different concept than the
   default branch (e.g., "master copy" in legal text), or (b) an
   archival historical artifact explicitly out of scope.

---

### User Story 4 — Release process is documented (Priority: P3)

The CONTRIBUTING.md file describes how to cut a release end-to-end:
how to choose a version number, how to write the CHANGELOG entry,
how to create and push a signed tag, what the pipeline does, how
to verify the release succeeded, and what to do if the publish
step fails partway. The README displays a CI pipeline status badge
linking to the pipeline page so contributors and consumers can see
build health at a glance.

**Why this priority**: A documented release process is what
distinguishes "the maintainer happens to publish releases" from
"the project has a release process". External contributors
proposing a release-relevant change (e.g., a security patch
needing immediate publish) shouldn't have to ask the maintainer
how to verify their patch shipped — the workflow should be
documented.

**Independent Test**: A simulated reader opens CONTRIBUTING.md
and reads the new "Cutting a release" section. After reading, they
can describe: how to choose a version number per the project's
SemVer policy; the exact `git tag -s` command syntax; what the
release pipeline does end-to-end; how to verify provenance on the
published artifact; the rollback procedure if a publish goes
wrong.

**Acceptance Scenarios**:

1. **Given** the README at HEAD, **When** a visitor scans the
   "Project resources" section, **Then** they see a CI pipeline
   status badge ("pipeline: passed" / "failed") that links to the
   GitLab pipelines page for the project.
2. **Given** CONTRIBUTING.md at HEAD, **When** a reader navigates
   to a "Cutting a release" section, **Then** they find:
   (a) the SemVer policy applied (major for breaking consumer
   call-site changes; minor for additive features; patch for
   fixes and security patches), (b) the `git tag -s vX.Y.Z -m
   "release notes summary"` command syntax, (c) a description
   of every pipeline stage in execution order, (d) the npm
   verification command (`npm view @tallyrow/safesignal versions
   --json` plus how to verify provenance attestation), (e) the
   rollback procedure if publish fails after partial state has
   been committed.
3. **Given** the maintainer cuts a release following the
   documented process, **When** they verify the published
   artifact, **Then** every documented verification step
   succeeds.

---

### Edge Cases

- **DCO sign-off check on the merge commit**: GitLab's merge
  commit (when an MR is merged) is created by GitLab's bot, not
  the contributor. The DCO check MUST exclude the GitLab-generated
  merge commit from the sign-off requirement (otherwise every
  merge would fail its own post-merge re-run on `main`). Practical
  shape: the check runs `git log <base>..<head> --no-merges` or
  filters out commits authored by `GitLab Bot <gitlab+...>`.
- **Bundle-invariance baseline drift across releases**: the ±1 KiB
  gzipped tolerance is measured against the merge-base with the
  default branch, not against a frozen baseline. If a previous
  release shipped a 200-byte size reduction, the next MR's
  baseline is the new (smaller) size — the tolerance doesn't drift
  cumulatively.
- **Test-suite baseline drift across releases**: the 48 files /
  1088 passing / 10 todo baseline holds today and is fine to
  enforce in CI as an exact match. However, future features
  legitimately add tests. The CI gate MUST be a "non-regression"
  check (fail if pass count decreases or failing count increases)
  rather than an exact-equality check, otherwise every new test
  becomes a CI failure.
- **First-publish vs subsequent-publish**: `npm publish --provenance`
  on the very first publish of `@tallyrow/safesignal` requires the
  scope to exist on npm with the maintainer as an owner. If the
  scope hasn't been claimed yet, the first publish will fail with
  a 404 or 403. This is a one-time ops prerequisite separate from
  the OIDC setup.
- **OIDC subject claim configuration**: GitLab's OIDC token issues
  claims (`sub`, `aud`, `project_path`, `ref_path`, etc.) that npm's
  trusted-publisher relationship binds to. If the subject claim
  template at GitLab doesn't match what npm expects (or vice
  versa), the publish fails with a cryptic JWT error. This is a
  one-time setup step where misconfiguration is easy.
- **Tag-only-on-main vs tag-anywhere**: signed tags can technically
  be created on any branch. The release pipeline MUST only publish
  when the tag points at a commit that is an ancestor of `main`'s
  HEAD (or whatever the default branch is). Otherwise an attacker
  with branch access could create a malicious branch, tag it, and
  trigger a publish.
- **In-repo `master` references in archival specs**: feature
  001's, 002's, 003's, and 004's spec / plan / tasks documents
  reference `master..HEAD` and similar in contract scripts. These
  are archival; updating them retroactively risks invalidating the
  historical record. Sweep scope is forward-going artifacts only
  (CLAUDE.md, current docs, current `.gitlab-ci.yml` scripts);
  archival specs keep their `master` references with a note.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature
  adds CI/CD configuration files and operational policies. It
  does not add, remove, rename, or alter any exported symbol,
  type, function signature, behavior, or runtime contract.

- **Compatibility Impact**: **Backward compatible / additive.** No
  consumer code change required. Existing consumers continue
  using `@tallyrow/safesignal@1.0.0` exactly as before. Future
  releases (cut via the new pipeline) will publish under the same
  package name with the same `exports` shape; only the publish
  mechanism changes.

- **Migration Notes**: No consumer migration required. Internal
  changes:
    - The default branch rename from `master` to `main` may break
      hard-coded clone URLs or CI configs that pinned to the
      `master` branch name. GitLab's automatic branch alias mitigates
      this in most cases. Consumers cloning the repo for the first
      time after the rename will get `main` by default; existing
      local clones will still track `master` until the contributor
      runs `git branch --move master main` and updates the upstream.
    - Future releases will carry npm provenance attestation. This
      is purely additive metadata; existing consumers with older
      versions are unaffected.

- **Host/Module Usage Impact**: **No impact.** Host applications
  and federated modules are unaffected at runtime, install, or
  build time.

- **Security & Privacy Considerations**: **Positive impact.** The
  OIDC trusted-publisher approach eliminates a long-lived
  `NPM_TOKEN` from the publish path, which is a meaningful
  reduction in supply-chain attack surface (a stolen token can no
  longer be used to publish a malicious version). Provenance
  attestation gives consumers a verifiable link from any published
  artifact back to the specific GitLab CI workflow that produced
  it. Branch protections make accidental direct-push to `main`
  impossible, closing a residual operator-error vector. None of
  the constitution's secure-by-default guarantees change; this
  feature operationalizes the secure-publish posture that was
  already promised by GOVERNANCE.md.

- **Log Integrity Considerations**: **No impact.** Event
  production, ordering, dropping, batching, transformation, and
  attribution semantics are all unchanged.

- **Runtime Scale & Federated Deployment Impact**: **No impact.**
  Per-`Logger` creation cost, shared runtime resource ownership,
  host vs. module configuration responsibility, and duplicate-
  package-copy classification (**isolated**) are all unchanged.

## Requirements *(mandatory)*

### Functional Requirements

#### CI pipeline — quality gates on every MR and default-branch push

- **FR-001**: A `.gitlab-ci.yml` file MUST exist at the repository
  root that triggers a pipeline on (a) every merge request to the
  default branch and (b) every push to the default branch.
- **FR-002**: The CI pipeline MUST include a **typecheck** stage
  that runs `tsc --noEmit` for both `src/` and `tests/` and fails
  the pipeline on any TypeScript error.
- **FR-003**: The CI pipeline MUST include a **test** stage that
  runs `npm test` (the project's vitest configuration) and fails
  the pipeline if any test fails or if unhandled errors occur.
  The stage MUST report a non-regression check (pass count cannot
  decrease, failing/unhandled count cannot increase) rather than
  an exact-equality check against a frozen baseline.
- **FR-004**: The CI pipeline MUST include a **build** stage that
  runs `npm run build` (tsup) and fails the pipeline on any build
  error.
- **FR-005**: The CI pipeline MUST include a **bundle-invariance
  audit** stage that compares the gzipped sizes of `dist/index.mjs`
  and `dist/transport-beacon.mjs` produced by the build stage
  against the same files built from the merge-base with the
  default branch (or, on default-branch push, against the
  previous commit). The stage fails if either file's gzipped size
  delta exceeds ±1 KiB (the contract from Feature 003's
  `bundle-invariance.md`).
- **FR-006**: The CI pipeline MUST include a **dependency-pins
  regression** stage that runs the contract test at
  `tests/contract/dependency-pins.test.ts` plus the two
  `bundle-shape.security.test.ts` files in `tests/security/`.
  Failure of any of these tests fails the pipeline.
- **FR-007**: The CI pipeline MUST include a **DCO sign-off
  check** stage that verifies every commit in the MR's commit
  range (from merge-base to head, excluding merge commits authored
  by GitLab's bot account) carries a `Signed-off-by:` footer in
  its message. Failure produces a diagnostic message naming the
  offending commit(s) and referencing CONTRIBUTING.md §
  Developer Certificate of Origin.
- **FR-008**: The CI pipeline MUST run all stages on every MR (no
  stage gated only on default-branch push). Stages MAY run in
  parallel where dependencies permit (typecheck and DCO-check
  are independent of build; build precedes bundle-invariance and
  dependency-pins).
- **FR-009**: The CI pipeline MUST surface a per-stage pass/fail
  summary in the GitLab MR UI such that a reviewer can identify
  which stage failed without opening the raw job log.
- **FR-010**: The CI pipeline MUST run against Node `20.x` and
  Node `22.x` (the current LTS and next-current LTS as of
  2026-05-28). The two Node versions run as parallel jobs within
  each pipeline stage where Node version matters (typecheck,
  test, build). `package.json` `engines` remains `">=18.0.0"`
  for now — bumping it is a breaking change for consumers and
  is deferred to a future release. Node `18.x` is dropped from
  the CI matrix because it reaches end-of-active-LTS in
  April 2025 and end-of-life April 2026; CI signal against EOL'd
  runtimes is low-value.

#### Release pipeline — signed-tag-driven publish with provenance

- **FR-011**: A release pipeline (a separate set of `.gitlab-ci.yml`
  jobs or a separate file gated by tag rules) MUST trigger on
  push of a tag matching the pattern `v[0-9]+.[0-9]+.[0-9]+` (with
  optional pre-release suffix like `-rc.1`, `-beta.2`).
- **FR-012**: The release pipeline MUST run the full quality-gate
  set (typecheck, test, build, bundle-invariance, dependency-
  pins, DCO sign-off) before any publish step. Publish MUST NOT
  execute if any gate fails.
- **FR-013**: The release pipeline MUST publish
  `@tallyrow/safesignal` to npm using `npm publish --provenance`
  (or the equivalent OIDC-attested publish mechanism in the
  current npm CLI).
- **FR-014**: The release pipeline MUST use GitLab OIDC
  trusted-publisher authentication with npm — no long-lived
  `NPM_TOKEN` is stored in GitLab CI/CD variables. The OIDC
  subject claim configuration MUST be tight enough that only
  pipelines triggered by signed tags on the default branch can
  publish.
- **FR-015**: The release pipeline MUST verify that the pushed
  tag is **signed** (`git tag -v <tag>` succeeds) before
  publishing. Unsigned tags MUST trigger pipeline failure at the
  verification step.
- **FR-016**: The release pipeline MUST verify that the tagged
  commit is reachable from the default branch's HEAD (i.e., not
  a tag pointing at an arbitrary branch). If the tagged commit
  is not an ancestor of the default branch, publish MUST NOT
  execute.
- **FR-017**: Pre-release tags (e.g., `v1.0.1-rc.1`) MUST publish
  under the npm `next` dist-tag. Stable-version tags (e.g.,
  `v1.0.1`) MUST publish under the default `latest` dist-tag.
  The dist-tag derivation MUST be deterministic from the tag
  string.
- **FR-017a**: The release pipeline MUST validate that the
  pushed tag's version matches a documented entry in
  `CHANGELOG.md` before publishing. If the tag is `vX.Y.Z` and
  `CHANGELOG.md` does not contain a `## [X.Y.Z]` (or
  `## [vX.Y.Z]`) heading, the pipeline fails at the validation
  step and publish does NOT execute. This enforces the manual-
  CHANGELOG-first workflow (Clarification Q2) — the maintainer
  cannot accidentally tag a version that has no release notes.

#### Branch protections and default-branch rename

- **FR-018**: The GitLab project's default branch MUST be renamed
  from `master` to `main`. This is a maintainer-side ops action
  performed through the GitLab UI (Settings → Repository →
  Default branch).
- **FR-019**: After the rename, GitLab branch protection rules
  on `main` MUST require: (a) all changes go through a merge
  request (no direct push); (b) at least one approval; (c)
  pipeline succeeds; (d) all discussion threads resolved; (e)
  force-push disallowed; (f) direct branch deletion disallowed.
- **FR-020**: Every in-repo reference to `master` as the default
  branch MUST be updated to `main` in forward-going artifacts:
  `CLAUDE.md`, `GOVERNANCE.md`, `CONTRIBUTING.md`, the new
  `.gitlab-ci.yml`, and any contract scripts in
  `specs/005-cicd-pipeline/contracts/` that reference the default
  branch by name. References in archival artifacts
  (`specs/001-*/`, `specs/002-*/`, `specs/003-*/`,
  `specs/004-*/`) are preserved as-is (point-in-time records).
- **FR-021**: GitLab's automatic alias from `master` to `main`
  MUST remain enabled for at least 90 days post-rename to give
  external consumers with hard-coded `master` references time to
  update.

#### Feature 004 stale-reference fix

- **FR-022**: All references in Feature 004 documents to "Feature
  006" as the location of CI/CD work MUST be updated to reference
  this feature (005). Specifically: `GOVERNANCE.md`,
  `specs/004-community-foundation/spec.md`,
  `specs/004-community-foundation/plan.md`,
  `specs/004-community-foundation/research.md`, and
  `specs/004-community-foundation/checklists/final-review.md`.
  Per Feature 004's FR-018 (historical archival), the archival
  artifacts under `specs/004-community-foundation/` MAY be left
  with their original references and a note added; the
  forward-going `GOVERNANCE.md` MUST be updated.

#### Documentation

- **FR-023**: `README.md` MUST display a CI pipeline status badge
  in the "Project resources" section (or another prominent
  location near the top). The badge MUST link to the GitLab
  pipelines page for the project and reflect the current
  default-branch pipeline status.
- **FR-024**: `CONTRIBUTING.md` MUST include a new "Cutting a
  release" section documenting: (a) the SemVer policy, (b) the
  manual CHANGELOG-entry-first workflow (write the
  `## [vX.Y.Z]` entry in `CHANGELOG.md`, commit it on the release
  branch, THEN create the signed tag), (c) the `git tag -s`
  command syntax with an example, (d) the release pipeline's
  stages in execution order including the CHANGELOG-validation
  step that confirms the tag matches a documented entry, (e) how
  to verify a published release on npm (including provenance
  attestation), (f) the rollback procedure if publish fails
  partway.

#### Invariants preserved

- **FR-025**: No change to `src/**` source files.
- **FR-026**: No change to test logic, test count, or test
  assertions. The full test suite passes unchanged.
- **FR-027**: No change to `package.json` `dependencies` or
  `devDependencies`. (CI may install dev tooling at pipeline-run
  time without committing it to `devDependencies` — e.g., `npm
  publish --provenance` requires recent npm CLI versions but
  those come from the CI image, not from `devDependencies`.)
- **FR-028**: No change to the `exports` map shape, runtime
  behavior, redaction defaults, sanitizer limits, URL scrubber
  behavior, level-filter defaults, or transport security contracts.

#### Verification

- **FR-029**: An audit MUST verify that `.gitlab-ci.yml` exists
  at the repository root with all 6 required stages (FR-002
  through FR-007) defined and that the release pipeline rules
  (FR-011 through FR-017) are present.
- **FR-030**: An audit MUST verify that branch protection rules
  on `main` match FR-019 (verifiable via GitLab API or the UI
  settings page).
- **FR-031**: An audit MUST verify that every Feature 004 stale
  "Feature 006" reference in `GOVERNANCE.md` is updated to
  "Feature 005" (or the actual feature number that ships this
  work).
- **FR-032**: The full test suite MUST pass unchanged
  post-feature (same file count, same passing count, same
  skipped/todo counts).

### Key Entities

- **`.gitlab-ci.yml`**: The CI/CD pipeline configuration file at
  the repository root. Defines stages, jobs, triggers, OIDC
  configuration, and the release workflow. New file in this
  feature.

- **GitLab OIDC trusted-publisher relationship**: A pre-configured
  trust binding between the GitLab project (identified by URL +
  ref pattern) and the npm `@tallyrow/` scope. Established once
  via the npm UI's "Trusted Publishers" settings; subsequent
  pipeline runs use this trust to obtain short-lived publish
  tokens via the OIDC token exchange.

- **Signed git tag**: A tag created with `git tag -s vX.Y.Z` that
  carries a GPG/SSH signature attesting that the tagger is the
  authenticated maintainer. The release pipeline verifies the
  signature before publishing.

- **npm provenance attestation**: Sigstore-backed metadata
  attached to a published npm package version that cryptographically
  links the package to the specific CI workflow run that produced
  it. Visible on the package's npmjs.com page under "Provenance".

- **Default branch**: The branch GitLab uses as the merge target
  for MRs and as the source of truth for the repo. Currently
  `master`; renamed to `main` by this feature.

- **Branch protection rule**: GitLab project configuration that
  restricts how a branch can be modified (no direct push, no
  force-push, require approval, require CI green, etc.).

- **DCO sign-off check**: A CI job that verifies every commit in
  an MR's range (excluding GitLab-bot-authored merge commits)
  carries a `Signed-off-by:` footer per Feature 004's
  CONTRIBUTING.md § Developer Certificate of Origin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A merge request whose pipeline fails any gate has
  its merge button disabled in the GitLab UI within 60 seconds of
  the failure being reported.
- **SC-002**: A merge request whose commits lack `Signed-off-by:`
  footers cannot be merged. The DCO check stage fails on every
  such MR and the failure message clearly identifies the offending
  commits.
- **SC-003**: A push to the default branch that exceeds the
  bundle-invariance threshold (±1 KiB gzipped on `dist/index.mjs`
  or `dist/transport-beacon.mjs`) fails CI within 5 minutes of
  the push.
- **SC-004**: A signed git tag matching `v[0-9]+.[0-9]+.[0-9]+`
  triggers a release pipeline that completes (successfully or
  with a clear failure) within 10 minutes of the tag push.
- **SC-005**: A successful release publish attaches valid
  Sigstore-backed provenance attestation to the npm package
  version. The attestation is independently verifiable via
  `npm audit signatures` or by inspecting the package page on
  npmjs.com.
- **SC-006**: No `NPM_TOKEN`, `NPM_PUBLISH_TOKEN`, or equivalent
  long-lived npm credential exists in GitLab CI/CD variables
  after this feature ships. Verifiable via the GitLab project
  Settings → CI/CD → Variables page.
- **SC-007**: After the default-branch rename, attempting
  `git push origin main` from a maintainer workstation fails
  with GitLab's "branch is protected" error. Attempting
  `git push --force origin main` also fails.
- **SC-008**: A grep audit of forward-going artifacts (`CLAUDE.md`,
  `GOVERNANCE.md`, `CONTRIBUTING.md`, `.gitlab-ci.yml`,
  `specs/005-cicd-pipeline/**`) returns zero references to
  `master` as the default branch (terminology unrelated to the
  default branch, e.g., "master copy" in legal text, is exempt).
- **SC-009**: A reader of `CONTRIBUTING.md`'s "Cutting a release"
  section can correctly answer: what SemVer level applies to a
  given change; what command creates a signed tag; what the
  release pipeline does end-to-end; how to verify the published
  artifact's provenance.
- **SC-010**: The full test suite passes unchanged post-feature
  (same file count, passing count, todo count, failing count,
  unhandled errors count as pre-feature).
- **SC-011**: `README.md`'s Project resources section displays a
  CI pipeline status badge linking to the GitLab pipelines page.
- **SC-012**: `GOVERNANCE.md`'s reference to "Feature 006" is
  updated to "Feature 005" (or whatever number this feature
  actually ships as).

## Open Questions / Clarifications Needed

The following items have reasonable defaults baked in but the
maintainer MAY want to revise via `/speckit-clarify`:

1. **`npm install` vs `npm ci` in CI** — `npm ci` is more
   reproducible (locks to `package-lock.json` exactly, fails on
   drift); `npm install` is more flexible. Best practice for CI
   is `npm ci`; baked-in default.
3. **CI runner choice** — GitLab.com's shared runners (free,
   sufficient for SafeSignal's needs) vs. self-hosted runners
   (more control, more setup). Default: shared runners.
4. **GitLab project-level pipeline schedule** — should CI run on a
   nightly schedule against `main` to catch dependency-drift
   issues, or only on MR/push? Default: only MR/push (nightly
   scheduled runs are a Feature 006 ergonomics concern).

## Assumptions

- The maintainer (`johng` / TallyRow) owns the `@tallyrow/` npm
  scope and can reserve `@tallyrow/safesignal` if it hasn't been
  reserved yet. The first publish via the release pipeline will
  claim the scope and the package name. 2FA on the npm account
  is enforced as a prerequisite — this is a one-time ops action
  outside the CI/CD configuration itself.
- The maintainer can configure the GitLab–npm OIDC trusted-
  publisher relationship via npm's "Trusted Publishers" UI. This
  requires linking the npm account to GitLab and specifying the
  GitLab project path + workflow file pattern.
- GitLab.com's shared CI runners are sufficient for SafeSignal's
  test suite (currently runs in ~2 seconds on local machines;
  expected ~30–60 seconds on shared runners including image
  pull).
- The default branch rename from `master` to `main` is the
  maintainer's preferred ergonomic. Reverting the rename later
  would be a separate feature.
- The Feature 006 references in Feature 004 docs are stale
  (Feature 006 was previously projected to be the CI/CD work
  before the user reordered priorities). Updating those references
  to "Feature 005" is the right correction; "Feature 006" stays
  reserved for the Developer Ergonomics & Supply-Chain Hygiene
  feature (lint, format, dependency-update bots, security
  scanning).
- The DCO requirement and its CI enforcement are non-controversial
  given Feature 004's CONTRIBUTING.md already documents the
  requirement. The CI check is the operational mechanism that
  makes the documented requirement enforceable.
- The release pipeline does NOT automatically generate
  `CHANGELOG.md` entries (per Clarification Q2). The maintainer
  writes the `## [vX.Y.Z]` entry by hand on the release branch
  BEFORE creating the signed tag. The pipeline's validation step
  (FR-017a) reads the existing CHANGELOG and fails if the tagged
  version has no matching `## [X.Y.Z]` heading — preventing
  silent releases without notes.
- No new `devDependencies` are added to `package.json` by this
  feature. CI-time tooling (e.g., `npm publish --provenance`
  CLI flags) is provided by the CI runner's pre-installed npm
  version. If a future need arises for a specific Node/npm
  version constraint, that's a follow-up — not in scope here.
- Lint, format, dependency-update bots, pre-commit hooks,
  coverage gating, and GitLab Dependency Scanning + Secret
  Detection are explicitly OUT OF SCOPE for this feature. They
  ship in Feature 006 (Developer Ergonomics & Supply-Chain
  Hygiene).
