# Data Model: Developer Ergonomics & Supply-Chain Hygiene (F006)

This feature has no runtime data model. The "entities" are configuration
artifacts and their authoritative shapes/relationships. No `src/**` runtime
types are added or changed.

## Configuration artifacts

### Biome config — `biome.json` (NEW)

- **Purpose**: single source of truth for lint + format rules.
- **Key fields**: pinned `$schema` for the installed Biome version; `formatter`
  (indent style/width, line width, quote style — chosen to minimize the format
  baseline diff against current code where reasonable); `linter` (recommended rule
  set, with explicit overrides only as justified); `files.includes`/ignore
  (cover `src/`, `tests/`, root configs; exclude `dist/`, `node_modules/`,
  `.specify/` vendored content, `*.d.ts`, lockfiles).
- **Relationships**: consumed by the `lint`/`format`/`format:check` package
  scripts, the `pre-commit` hook, and the CI `lint`/`format-check` jobs — one
  config drives local + hook + CI identically (Principle VIII reproducibility).

### Package scripts + devDependency — `package.json` (MODIFIED)

- **Added devDependency**: `@biomejs/biome` (exact pinned version).
- **Added scripts**: `lint` (check), `format` (write), `format:check`,
  `test:coverage` (`vitest run --coverage`). Existing scripts unchanged.
- **Invariant**: `version`, `exports`, `files`, runtime deps untouched; the
  bundle-invariance gate covers `dist/` regardless.

### Git hooks — `scripts/hooks/` (NEW, executable, tracked)

- **`pre-commit`**: pure-shell; computes staged lintable files
  (`git diff --cached --name-only --diff-filter=ACM`), runs Biome lint +
  format-check on them; **blocks** on any finding with a fix pointer; never
  re-stages.
- **`commit-msg`**: pure-shell; receives the commit-message file path ($1);
  fails if no `^Signed-off-by: .+ <.+@.+>$` trailer present, printing the
  `git commit -s` remedy.
- **Enablement**: one-time `git config core.hooksPath scripts/hooks` (documented;
  opt-in). Executable bit committed via `git update-index --chmod=+x`.
- **Relationship**: mirror the CI `lint`/`format-check` + `dco-check` gates at
  commit time; CI remains authoritative.

### Secret-detection allowlist — `.gitlab/secret-detection-ruleset.toml` (NEW)

- **Purpose**: exclude known-benign fakes so Secret Detection is signal-rich.
- **Entries**: path/pattern exclusions for `src/testing/secret-fixtures.ts`, the
  security/secret test files, `AKIAIOSFODNN7EXAMPLE`, and synthetic private-range
  IPs in URL-scrubber tests.
- **Relationship**: read by the Secret-Detection CI job.

### Renovate config — `renovate.json` (NEW)

- **Purpose**: dependency-update policy.
- **Key fields**: extends a base preset; `schedule` (weekly); grouping so
  minor/patch land in one MR and each major is isolated; `rebaseWhen`; labels;
  target branch `main`; `lockFileMaintenance` as appropriate.
- **Credential**: `RENOVATE_TOKEN` = `safesignal`-scoped Project Access Token
  (Developer, `api`), masked/protected CI variable — **not** in the repo.
- **Relationship**: consumed by the scheduled Renovate pipeline (separate
  `.gitlab-ci.yml` include gated on `$CI_PIPELINE_SOURCE == "schedule"`).

### Coverage thresholds — `vitest.config.ts` (EXISTING, enforced via CI)

- **Already defined**: global 90% (lines/branches/functions/statements);
  per-file 100% for `sanitizer.ts`, `redactor.ts`, `url-scrubber.ts`,
  `control-char-guard.ts`; documented exclusions (`src/testing/**`, `index.ts`,
  `api/types.ts`, `internal/telemetry/**`).
- **Measured baseline**: 95.16 / 95.28 / 98.47 / 95.16.
- **Change**: none to the config values; a new CI `coverage` job runs
  `vitest run --coverage` so the thresholds are actually enforced on every MR.
- **Relationship**: the threshold map is the authoritative per-package gate.

## State / lifecycle

- **Format baseline**: one-time transition from "unformatted" → "Biome-clean"
  across the tree (single commit), after which every commit/MR must stay clean.
- **Dependency-update MRs**: created (weekly) → run quality gate → reviewed →
  merged or closed; no persistent state beyond standard MR lifecycle.

## Invariants (cross-cutting)

- Test suite: 48 / 1,088 / 10 / 0 / 0 unchanged.
- Bundles: `index.mjs` 8,162 B · `transport-beacon.mjs` 3,101 B ·
  `testing.mjs` 2,724 B (gz) unchanged.
- No long-lived npm publish token anywhere; OIDC-only publish preserved.
- Every gate reproducible locally with the same result as CI.
