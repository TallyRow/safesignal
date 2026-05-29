# Feature Specification: Developer Ergonomics & Supply-Chain Hygiene

**Feature Branch**: `006-developer-ergonomics`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "Establish SafeSignal's developer-ergonomics and supply-chain-hygiene baseline (Feature 006), layered on top of the now-SHIPPED Feature 005 CI/CD pipeline. Five prioritized stories — GitLab Dependency Scanning + Secret Detection, a lint/format baseline, local pre-commit hooks, Renovate dependency automation, and coverage-threshold gating — under hard test-suite/bundle invariance and the OIDC-only no-long-lived-secrets posture. Supersedes the orphaned `master`-branch 006 draft; test-typecheck-debt and MR-tooling are already done in F005 and out of scope."

## Context

Feature 005 shipped SafeSignal's CI/CD foundation: `@tallyrow/safesignal@1.0.1`
is published to npm with OIDC trusted publishing + SLSA provenance, the default
branch is `main` with branch protection + MR gates, and `.gitlab-ci.yml` runs a
working quality-gate pipeline (build → typecheck → test on Node 20 + 22,
bundle-invariance, dependency-pins, DCO) plus a signed-tag release pipeline.
The `tallyrow` group and `safesignal` project are now **public**.

Feature 006 hardens that foundation: it adds the automated quality and
supply-chain guardrails the live pipeline does not yet enforce, fulfilling the
constitution v1.3.0 shift toward **mechanical enforcement** (Principle IX) and
**reproducible verification** (Principle VIII) over manual discipline. This
specification supersedes the earlier `006-developer-ergonomics` draft that
remains on the orphaned `master` branch; that draft's "prerequisite to
re-enable F005" framing is obsolete (F005 shipped), and two of its stories —
test-code typecheck debt and MR-creation tooling — are **already complete** in
F005 and are explicitly out of scope here.

## Clarifications

### Session 2026-05-29

- Q: Which linter + formatter should the project adopt (none exists today)? → A: Biome — a single tool providing both lint and format, one config, ~1 devDependency; chosen for minimalism + reproducibility, with strict `tsc` already covering deep type checks.
- Q: Scope of the initial lint/format cleanup on the never-linted codebase? → A: Full baseline now — auto-fix + format the entire codebase in one mechanical baseline commit; bundle-invariance + test suite prove behavior is unchanged.
- Q: How does the Renovate bot authenticate to open MRs given the OIDC-only / no-long-lived-publish-token posture? → A: A GitLab Project Access Token scoped to `safesignal` only (Developer role, `api` scope), stored as a masked/protected CI variable used solely by the Renovate scheduled pipeline; non-publish, repo-scoped — a bounded, documented exception. npm publish stays OIDC-only.
- Q: (implementation) Formatting `src/` shifts the non-minified bundle by a few bytes, so the spec's original "byte-identical" bundle requirement is unachievable. Re-baseline, or exclude `src/` from formatting? → A: Format everything incl. `src/` and re-baseline — the shift (~+4/+5/0 B gz) is within the bundle-invariance gate's ±1 KiB tolerance (behavior identical); FR-008/SC-007 reworded from "byte-identical" to "within ±1 KiB", new sizes recorded in `baselines.md`.
- Q: (implementation, US1) GitLab-native Dependency Scanning is Ultimate-only (unavailable on the free tier) and Secret Detection does not gate on free tier — so the spec's "GitLab Dependency Scanning + Secret Detection" is unachievable as a gate. What instead? → A: Use pinned **OSS scanners as gating CI jobs**: **gitleaks** for secret detection (with a `.gitleaks.toml` allowlist) and **osv-scanner** for dependency scanning (against `package-lock.json`). Both fail the job on findings — a real, free, deterministic gate. FR-001/FR-003 reworded from "GitLab Secret Detection/Dependency Scanning" to "a gating secret scanner / dependency scanner"; tool identities recorded here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Supply-chain scanning on every change (Priority: P1)

Now that the repository and its full git history are public, the maintainer
wants every merge request automatically scanned for leaked secrets and for
known vulnerabilities in dependencies, so that a credential or a vulnerable
package can never silently reach `main` or a published release.

**Why this priority**: Going public is the moment supply-chain exposure jumps —
forks, history mining, and external MRs all become possible. Automated Secret
Detection + Dependency Scanning are the highest-leverage protections and have no
prerequisite on the other stories. They directly serve secure-by-default
(Principle IV).

**Independent Test**: Open an MR that (a) introduces a string shaped like a real
credential and (b) adds a dependency with a known advisory; the pipeline
surfaces both findings and the merge is gated accordingly. A clean MR scans
green with no findings.

**Acceptance Scenarios**:

1. **Given** an MR whose diff contains a real-looking secret, **When** the
   pipeline runs, **Then** Secret Detection reports the finding and the MR
   surfaces it to the reviewer.
2. **Given** the repository's existing fake test fixtures (e.g.
   `makeSecretFixture` values, the AWS documentation example key), **When**
   Secret Detection runs, **Then** those known-benign patterns are allowlisted
   and do **not** produce findings (no false-positive noise).
3. **Given** an MR that adds or bumps a dependency with a known vulnerability,
   **When** the pipeline runs, **Then** Dependency Scanning reports the
   advisory with severity.
4. **Given** a clean MR, **When** the pipeline runs, **Then** both scanners
   complete with zero findings and do not block the merge.

---

### User Story 2 — Lint + format baseline enforced in CI (Priority: P1)

A contributor writes code and gets fast, consistent feedback on style and common
correctness issues from a single linter and a single formatter, both enforced in
CI on every MR. Today the repository has **no** lint or format tooling, so style
drift and lint-class bugs are caught only by human review.

**Why this priority**: A lint/format baseline is the substrate the pre-commit
hooks (US3) and most future contributions depend on, and it is the most visible
day-to-day ergonomics win. It is P1 alongside US1 because both are foundational;
US1 protects against external threats, US2 raises the internal quality floor.

**Independent Test**: From a fresh clone, `npm run lint` and `npm run
format:check` both exit 0 on the committed tree, and a deliberately
style-violating or lint-violating change makes the corresponding CI job fail.

**Acceptance Scenarios**:

1. **Given** the committed codebase, **When** a contributor runs `npm run lint`
   and `npm run format:check`, **Then** both exit 0 (the baseline is clean).
2. **Given** an MR introducing a lint violation, **When** the pipeline runs,
   **Then** the lint job fails and names the offending file + rule.
3. **Given** an MR introducing formatting drift, **When** the pipeline runs,
   **Then** the format-check job fails and points at the offending files.
4. **Given** the one-time format-baseline commit is applied to `src/`, **When**
   the build runs, **Then** the gzipped bundle artifacts are **byte-identical**
   to the pre-feature baselines (formatting changes source layout only, never
   built output).

---

### User Story 3 — Local pre-commit hooks catch issues before push (Priority: P2)

A contributor commits locally and the same lint, format, and DCO checks that
gate CI run automatically against their staged changes first — so violations are
caught in seconds at commit time rather than minutes later in a failed pipeline.

**Why this priority**: Hooks shorten the feedback loop and reduce wasted CI runs,
but they depend on US2 (the lint/format commands must exist) and are a
convenience layer over the authoritative CI gates — hence P2, not P1.

**Independent Test**: After running the one-time hook-enablement command, a
staged change with a lint/format violation is blocked at `git commit` with a
pointer to the offending file; a commit missing a `Signed-off-by:` trailer is
blocked by the commit-message hook; a clean, signed-off commit succeeds.

**Acceptance Scenarios**:

1. **Given** hooks are enabled, **When** a contributor commits a staged file
   with a formatting violation, **Then** the commit is **blocked** with a
   message naming the file and the command to fix it (no auto-format/re-stage).
2. **Given** hooks are enabled, **When** a contributor commits with a lint
   violation in a staged file, **Then** the commit is blocked similarly.
3. **Given** hooks are enabled, **When** a contributor writes a commit message
   without a `Signed-off-by:` trailer, **Then** the commit-message hook blocks
   the commit and explains how to add the DCO sign-off.
4. **Given** hooks are enabled, **When** a contributor makes a clean,
   signed-off commit, **Then** the commit succeeds with no friction.
5. **Given** a contributor has not run the one-time enablement command, **Then**
   CONTRIBUTING documents the single command to opt in, and CI remains the
   authoritative gate regardless.

---

### User Story 4 — Dependency updates arrive as reviewable MRs (Priority: P2)

The maintainer wants dependency updates proposed automatically on a regular
cadence as merge requests that already pass the full quality gate, so keeping
dependencies current is a review-and-merge task rather than manual tracking.

**Why this priority**: Automated updates keep the supply chain fresh and amplify
US1's scanning, but the project functions without them and they introduce an
external automation surface (a bot identity + credential) that must be scoped
carefully — hence P2.

**Independent Test**: On the scheduled cadence (or a manual trigger), the
automation opens one or more MRs that bump dependencies, batched per policy, and
each MR runs the standard quality gate.

**Acceptance Scenarios**:

1. **Given** an outdated minor/patch dependency, **When** the scheduled update
   run executes, **Then** a single batched MR is opened proposing the bumps.
2. **Given** an outdated major dependency, **When** the update run executes,
   **Then** a **separate** MR is opened for that major (isolated from the
   minor/patch batch).
3. **Given** an update MR, **When** it is created, **Then** it runs the same
   quality-gate pipeline (build/typecheck/test/scanning) as any human MR.
4. **Given** no dependencies are outdated, **When** the run executes, **Then**
   no MR is created and the run completes cleanly.

---

### User Story 5 — Coverage cannot silently regress (Priority: P3)

The maintainer wants test coverage measured on every MR and gated against a
per-package threshold, so a change that meaningfully drops coverage fails the
pipeline rather than eroding the suite over time.

**Why this priority**: Coverage gating is valuable ratchet-style protection but
is the least urgent of the five — the suite is already strong (1,088 passing),
and a poorly-calibrated threshold causes more friction than value, so it is P3
and depends on a measured baseline.

**Independent Test**: The coverage job runs in CI, reports per-package numbers,
and an MR that drops a package below its threshold fails the job; an MR that
holds or improves coverage passes.

**Acceptance Scenarios**:

1. **Given** the configured per-package thresholds, **When** an MR holds or
   improves coverage, **Then** the coverage job passes.
2. **Given** an MR that drops a package's coverage below its threshold, **When**
   the pipeline runs, **Then** the coverage job fails and reports the package +
   the measured vs. required numbers.
3. **Given** the thresholds are set, **Then** they are recorded as the measured
   `main` baseline minus a 2-percentage-point ratchet margin (per package), and
   the relaxation-review process for lowering them is documented.

### Edge Cases

- **Secret Detection false positives**: the public history contains intentional
  fake secrets (`src/testing/secret-fixtures.ts`, the `AKIAIOSFODNN7EXAMPLE`
  doc key, synthetic private-range IPs in URL-scrubber tests). These MUST be
  allowlisted so scanning stays signal-rich, without disabling detection wholesale.
- **Lint baseline shock**: code never previously linted may surface many
  violations at once; the initial-cleanup scope must be bounded and decided
  (see clarifications) so US2 does not balloon.
- **Hooks not installed**: `core.hooksPath` is opt-in per clone; CI MUST remain
  the authoritative gate so an un-hooked contributor cannot bypass quality.
- **Format vs. build output**: a formatter applied to `src/` changes source
  layout, and because tsup/esbuild emits **non-minified** output, that reaches
  `dist/` by a few bytes (~+4/+5 B gz). "Byte-identical" is NOT achievable; the
  bundles stay **within the ±1 KiB bundle-invariance gate** and a one-time
  re-baseline is recorded. (Empirically confirmed during implementation.)
- **Update-bot credential**: the dependency bot needs an identity to open MRs;
  this is a new credential surface that MUST be scoped to the minimum and MUST
  NOT be a long-lived publish-capable token.
- **Scanner availability/version drift**: pinned scanner/tool versions must keep
  CI reproducible (Principle VIII); an upstream scanner outage must fail loudly,
  not silently pass.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature touches only
  developer/CI tooling and configuration (`.gitlab-ci.yml`, lint/format config,
  `scripts/hooks/`, Renovate config, `package.json` dev scripts/devDependencies).
  No change to exported functions, types, config, events, or runtime behavior.
- **Compatibility Impact**: Backward compatible. No consumer-visible change.
- **Migration Notes**: None for consumers. Contributors get a one-time optional
  `git config core.hooksPath …` step documented in CONTRIBUTING.
- **Host/Module Usage Impact**: None — no runtime or bundle change.
- **Security & Privacy Considerations**: **Net improvement.** Secret Detection +
  Dependency Scanning add proactive supply-chain protection; the OIDC-only,
  no-long-lived-publish-token posture from F005 is preserved. The one new
  credential surface (the dependency-update bot) MUST be scoped to MR-creation
  only and never granted publish rights.
- **Log Integrity Considerations**: No impact — no event-production code changes.
- **Runtime Scale & Federated Deployment Impact**: No impact — `Logger` creation
  cost, shared-runtime ownership, and duplicate-copy behavior are unchanged
  (no `src/**` runtime change; formatting-only edits do not alter built output).

## Requirements *(mandatory)*

### Functional Requirements

**Supply-chain scanning (US1)**

- **FR-001**: CI MUST run a **gating secret scanner** (gitleaks) on every merge
  request and every `main` push; a non-allowlisted finding MUST fail the job.
  (GitLab-native Secret Detection does not fail the pipeline on the free tier,
  so an OSS scanner is used for a real gate.)
- **FR-002**: Secret Detection MUST allowlist the repository's known-benign fake
  patterns (test fixtures, the AWS doc example key, synthetic IPs) so it produces
  zero false positives on the committed tree.
- **FR-003**: CI MUST run a **gating dependency scanner** (osv-scanner against
  `package-lock.json`) on every merge request and `main` push; a known
  advisory MUST fail the job. (GitLab-native Dependency Scanning is Ultimate-only
  and unavailable on the free tier, so an OSS scanner is used.)
- **FR-004**: Scanner tool/image versions MUST be pinned for reproducibility, and
  a scanner failure or outage MUST fail the job (fail-loud, not silent-pass).

**Lint + format baseline (US2)**

- **FR-005**: The project MUST adopt **Biome** as the single lint + format tool,
  exposed via stable `package.json` scripts (a `lint` check, a `format:check`,
  and a `format` writer), runnable from a fresh clone with one config file and a
  single pinned devDependency.
- **FR-006**: CI MUST gate every merge request on the lint check and the
  format-check; violations MUST fail the pipeline and name the offending
  file(s)/rule(s).
- **FR-007**: The committed tree MUST pass lint + format-check with zero
  violations after the baseline is established. The baseline MUST be created by
  auto-fixing + formatting the **entire existing codebase in one mechanical
  baseline commit** (not a changed-files-only ratchet), verified behavior-neutral
  by the test suite + bundle-invariance gates.
- **FR-008**: Establishing the format baseline keeps the built bundles **within
  the existing bundle-invariance gate's ±1 KiB tolerance** (behavior identical).
  tsup/esbuild emits non-minified output, so source formatting reaches `dist/`
  by a few bytes — "byte-identical" is not achievable while formatting `src/`.
  The one-time post-baseline sizes are recorded in `baselines.md`; the gate keeps
  enforcing the ±1 KiB budget thereafter.

**Pre-commit hooks (US3)**

- **FR-009**: The project MUST provide tracked git hooks under a versioned
  directory enabled via native `core.hooksPath` (no Husky, no new npm runtime
  dependency): a `pre-commit` hook running lint + format-check against staged
  files, and a `commit-msg` hook enforcing the DCO `Signed-off-by:` trailer.
- **FR-010**: On any violation, the hooks MUST **block** the commit and point at
  the offending file(s)/cause; they MUST NOT auto-format or re-stage changes the
  contributor did not review.
- **FR-011**: Hook enablement MUST be a single documented opt-in command in
  CONTRIBUTING; CI MUST remain the authoritative gate so an un-hooked clone
  cannot bypass quality checks.

**Dependency-update automation (US4)**

- **FR-012**: The project MUST run an automated dependency-update bot on a
  scheduled cadence that opens merge requests, batching minor/patch updates into
  a single MR and isolating each major update into its own MR.
- **FR-013**: Each update MR MUST run the full standard quality-gate pipeline.
- **FR-014**: The bot MUST authenticate via a GitLab **Project Access Token
  scoped to `safesignal` only** (Developer role, `api` scope), stored as a
  masked/protected CI variable and used solely by the Renovate scheduled
  pipeline. The token MUST NOT carry npm publish rights and MUST NOT be a
  long-lived npm token; it is a bounded, documented exception for MR creation
  only (npm publish remains OIDC-only).

**Coverage gating (US5)**

- **FR-015**: CI MUST measure test coverage on every merge request and gate it
  against per-package thresholds, failing the job and reporting package +
  measured-vs-required numbers on a regression.
- **FR-016**: Thresholds MUST be set to the measured `main` baseline minus a
  2-percentage-point ratchet margin (per package), and the process for relaxing
  a threshold MUST be documented.

**Cross-cutting invariants**

- **FR-017**: The full test suite MUST remain 48 files / 1,088 passing / 10 todo
  / 0 failing / 0 unhandled after all changes (no semantic test changes; only
  formatting/lint-driven edits permitted, and only where behavior-neutral).
- **FR-018**: No `src/**` runtime behavior change; any `src/**` edits MUST be
  formatting/lint-only and provably behavior-neutral (suite + bundle invariance).
- **FR-019**: The OIDC-only, no-long-lived-publish-token posture from F005 MUST
  be preserved; no secret added for this feature may grant npm publish rights.
- **FR-020**: New CI jobs MUST follow existing `.gitlab-ci.yml` conventions
  (`node:22-alpine` base, the Node matrix where version sensitivity matters,
  `.quality_gate_rules`, and `needs: build` for anything consuming `dist/`),
  and MUST keep pipeline configuration reproducible with pinned versions.
- **FR-021**: All new tooling MUST be runnable locally from a fresh clone with
  the same result as CI (Principle VIII reproducibility) — no "works only in CI"
  gates.

### Key Entities *(include if feature involves data)*

- **Lint configuration**: rule set + ignore patterns governing the linter; the
  authoritative definition of "lint-clean."
- **Format configuration**: style definition + ignore patterns; the
  authoritative definition of "format-clean."
- **Hook scripts**: tracked `pre-commit` and `commit-msg` scripts under the
  `core.hooksPath` directory; mirror the CI checks at commit time.
- **Secret-detection allowlist**: the set of known-benign patterns/paths
  excluded from Secret Detection findings.
- **Dependency-update policy**: cadence, batching rules (minor/patch grouped,
  majors isolated), and the bot's scoped credential.
- **Coverage threshold map**: per-package required coverage numbers and the
  ratchet margin.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of merge requests are automatically scanned for secrets and
  dependency advisories before merge; a planted test secret and a planted
  vulnerable dependency are both caught in a verification MR.
- **SC-002**: Secret Detection produces **zero** false-positive findings on the
  committed tree (all known fake fixtures allowlisted).
- **SC-003**: `npm run lint` and `npm run format:check` exit 0 on the committed
  tree, and both are enforced as blocking CI jobs on every MR.
- **SC-004**: With hooks enabled, a lint/format/DCO violation is caught at
  `git commit` time (seconds), before any push or CI run.
- **SC-005**: Dependency-update MRs appear automatically on the defined cadence,
  correctly batched, each passing the full quality gate; the bot holds no
  publish-capable or long-lived npm credential.
- **SC-006**: A coverage regression below a package threshold fails CI with a
  clear per-package report; coverage cannot silently decline.
- **SC-007**: Test-suite headline counts (48 / 1,088 / 10 / 0 / 0) are identical
  before and after the feature; the gzipped bundles stay **within the ±1 KiB
  bundle-invariance gate** (the one-time format-baseline shift is ~+4/+5/0 B,
  recorded in `baselines.md`).
- **SC-008**: Every new check is reproducible locally from a fresh clone with the
  same pass/fail result as CI.

## Assumptions

- The feature is **CI/tooling/config only**: no runtime `src/**` behavior change,
  no public API change, no bundle-output change. `src/**` edits, if any, are
  formatting/lint-only and behavior-neutral.
- GitLab.com free-tier shared runners (`saas-linux-small-amd64`) remain the CI
  environment, and GitLab's bundled Secret Detection + Dependency Scanning
  templates are available on this tier.
- The dependency-update bot authenticates with a `safesignal`-scoped GitLab
  Project Access Token (Developer role, `api` scope, masked CI variable) — a
  narrowly-scoped, non-publish MR-creation credential. The no-long-lived-token
  posture refers specifically to **npm publish** tokens, which remain OIDC-only;
  this bot token is the one bounded, documented exception (FR-014).
- Coverage instrumentation is available through the existing test runner; exact
  per-package threshold values are calibrated at `/speckit-plan` time against the
  measured `main` baseline (not picked aspirationally).
- The orphaned `master`-branch 006 draft is superseded by this spec and is not a
  source of requirements; test-typecheck-debt and MR-creation tooling are done
  (F005) and out of scope.
- Constitution v1.3.0 is the governing version (Principles V, VIII, IX as cited).
