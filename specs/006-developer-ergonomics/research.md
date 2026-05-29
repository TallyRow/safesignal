# Research: Developer Ergonomics & Supply-Chain Hygiene (F006)

Phase 0 decisions. All `/speckit-clarify` markers are resolved; this records the
implementation-shaping research behind each story.

## R1 — Lint + format tool: Biome

- **Decision**: Adopt **Biome** as the single lint + format tool (one binary,
  one `biome.json`, one pinned devDependency). Scripts: `lint` (`biome lint`),
  `format:check` (`biome format`), `format` (`biome format --write`); a combined
  `biome check` may back the staged-file hook.
- **Rationale**: Matches SafeSignal's minimalism (one dep vs. the ESLint+Prettier
  plugin graph) and reproducibility (single pinned version). Strict `tsc` already
  provides deep type checking, so Biome's non-type-aware lint is sufficient for
  the style + common-correctness floor this feature targets.
- **Alternatives**: ESLint + Prettier (deepest type-aware rules via
  typescript-eslint, but many devDeps + two configs + integration overhead);
  oxlint + dprint (fast but less mature, two tools). Rejected for dependency
  weight / maturity.

## R2 — Format baseline vs. bundle invariance

- **Decision**: Apply Biome formatting to the **entire codebase in one mechanical
  baseline commit** (`src/`, `tests/`, configs). Bundle invariance is preserved.
- **Rationale**: tsup/esbuild re-emits and normalizes output from the AST;
  source-level formatting (quotes, semicolons, whitespace, import ordering) does
  **not** survive into the emitted bundle, so `dist/*.mjs` gz bytes stay identical.
  The existing `bundle-invariance-check.sh` gate proves this empirically on the
  baseline MR; if it ever flagged a delta, the format baseline would be revisited.
- **Alternatives**: Changed-files-only ratchet (rejected per clarify — leaves an
  inconsistent tree + needs changed-file plumbing in CI and hooks). Configuring
  Biome to skip `src/` (rejected — would exempt the most important code).
- **Risk control**: The baseline commit runs `npm test` (48/1,088/10/0/0) +
  `npm run build` + bundle-size compare before landing.

## R3 — GitLab Secret Detection + allowlist

- **Decision**: Include GitLab's bundled **Secret Detection** template; run it on
  MR + `main` pipelines. Allowlist the repository's known-benign fakes via a
  committed ruleset (`.gitlab/secret-detection-ruleset.toml`) and/or path
  exclusions: `src/testing/secret-fixtures.ts`, the security/secret test files,
  the `AKIAIOSFODNN7EXAMPLE` doc key, and the synthetic private-range IPs in the
  URL-scrubber tests.
- **Rationale**: The public history is full of intentional fake secrets; without
  an allowlist the scanner is pure noise. A committed ruleset keeps the allowlist
  reviewable and version-controlled rather than dismissed-in-UI.
- **Open at plan→tasks**: confirm whether the free tier surfaces findings via the
  MR security widget or only the job log; gate behavior must be deterministic
  (fail the job on a *new, non-allowlisted* finding).
- **Alternatives**: Third-party scanners (gitleaks/trufflehog) as raw CI jobs —
  more control but more maintenance; deferred unless the bundled template proves
  insufficient.

## R4 — GitLab Dependency Scanning

- **Decision**: Include GitLab's bundled **Dependency Scanning** template against
  the committed `package-lock.json`; run on MR + `main`; pin the analyzer version.
- **Rationale**: Lockfile-based advisory detection with zero bespoke code; pinning
  keeps CI reproducible (Principle VIII).
- **Open at plan→tasks**: confirm free-tier availability of the current
  dependency-scanning analyzer for npm lockfiles and how severity gates the job.

## R5 — Renovate (dependency-update automation)

- **Decision**: Run Renovate via GitLab's **renovate-runner** project template on
  a **weekly scheduled pipeline**, configured by a committed `renovate.json`:
  batch minor/patch into one MR, isolate each major into its own MR, enable
  auto-rebase. Authenticate with a **`safesignal`-scoped Project Access Token**
  (Developer role, `api` scope) stored as a **masked/protected CI variable**
  (`RENOVATE_TOKEN`), used only by the scheduled Renovate pipeline.
- **Rationale**: renovate-runner is the standard GitLab pattern; native grouping
  matches the spec; a repo-scoped non-publish token is least-privilege. npm
  publish remains OIDC-only — this token cannot publish.
- **Alternatives**: Dependabot (rejected — GitLab support needs the third-party
  `dependabot-gitlab` proxy); group-level token (rejected — over-scoped, spans
  `opsdeck`); dedicated bot account (more isolation, more setup; deferred).
- **Note**: scheduled pipelines + the PAT are maintainer-side ops (like F005's
  T002–T007); tasks.md will flag them as maintainer steps.

## R6 — Local hooks via native `core.hooksPath`

- **Decision**: Tracked `scripts/hooks/{pre-commit,commit-msg}` (pure shell, zero
  npm deps), enabled by a one-time `git config core.hooksPath scripts/hooks`.
  `pre-commit` runs Biome lint + format-check against **staged** files
  (`git diff --cached --name-only --diff-filter=ACM` filtered to lintable
  extensions); `commit-msg` greps the message for a `Signed-off-by:` trailer.
  Both **block** on failure with a fix pointer; neither auto-stages.
- **Rationale**: Mirrors F005's CI-script style (pure shell, no Husky/lint-staged
  dependency); splitting DCO into `commit-msg` is required because `pre-commit`
  fires before the message exists. CI stays authoritative for un-hooked clones.
- **Alternatives**: Husky + lint-staged (rejected — npm deps + indirection);
  auto-format-and-restage (rejected per clarify — never restage unreviewed edits).

## R7 — Coverage gating (already mostly present)

- **Decision**: Add a CI **coverage job** that runs `vitest run --coverage`,
  enforcing the thresholds **already defined** in `vitest.config.ts` (90% global
  lines/branches/functions/statements; 100% on `sanitizer.ts`, `redactor.ts`,
  `url-scrubber.ts`, `control-char-guard.ts`). Expose a `test:coverage` script.
- **Rationale**: The thresholds exist and the suite measures **95.16% / 95.28% /
  98.47% / 95.16%** — comfortably passing. The gap is purely that `npm test` runs
  without `--coverage`, so CI never enforces them. Adding the job closes the gap
  with near-zero risk.
- **Calibration**: Current margins (~5pp global; 100% on security-critical files)
  already implement a ratchet stricter than the spec's "baseline − 2pp" floor, so
  the existing thresholds are retained as-is rather than loosened to baseline−2pp.
  Document the relaxation-review process; future ratcheting upward is allowed.
- **Alternatives**: A separate coverage tool (rejected — v8 provider already
  wired); lowering to baseline−2pp (rejected — would weaken the existing stronger
  gate).

## R8 — CI integration shape

- **Decision**: In `.gitlab-ci.yml`, `include:` the Secret-Detection and
  Dependency-Scanning templates and add custom jobs `lint`, `format-check`, and
  `coverage` under the existing `.quality_gate_rules` (MR + default-branch).
  `lint`/`format-check`/`coverage` use `node:22-alpine` + `before_script: npm ci`;
  `coverage` does not need the build artifact (runs source via vitest), so no
  `needs: build`. Renovate runs in its own scheduled pipeline (separate `include`
  gated to `$CI_PIPELINE_SOURCE == "schedule"`), not in the MR quality gate.
  Pin all template + analyzer versions.
- **Rationale**: Reuses F005 conventions; keeps the scanning analyzers (which
  bring their own images) isolated from the Node jobs; keeps the scheduled
  Renovate pipeline off the per-MR critical path.
- **Risk control**: `glab ci lint` after each `.gitlab-ci.yml` edit; a no-op
  dogfood MR proves the new gates run green before relying on them (the F005
  lesson — never trust an un-run pipeline).
