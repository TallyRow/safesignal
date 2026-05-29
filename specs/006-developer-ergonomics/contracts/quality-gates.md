# Contract: Quality Gates (F006)

The consumer-facing "interface" of this feature is the set of **gate behaviors** —
the deterministic pass/fail contract each new check honors, identically in CI and
locally. No package API is exposed.

## CI job contracts (added to `.gitlab-ci.yml`, under `.quality_gate_rules`)

### `lint`

- **Runs**: every MR + every `main` push. Image `node:22-alpine`; `npm ci`.
- **PASS**: `biome lint` reports zero errors over the configured file set.
- **FAIL**: ≥1 lint error; job exits non-zero and names file(s) + rule(s).
- **No `needs: build`** (operates on source).

### `format-check`

- **Runs**: every MR + `main` push.
- **PASS**: `biome format` (check mode) reports no formatting drift.
- **FAIL**: any file would be reformatted; job exits non-zero and lists files;
  message points at `npm run format`.

### `coverage`

- **Runs**: every MR + `main` push.
- **PASS**: `vitest run --coverage` meets all thresholds in `vitest.config.ts`
  (global ≥90%; the four pipeline-security files =100%).
- **FAIL**: any threshold unmet; job reports the package + measured-vs-required.
- **Invariant**: test counts stay 48/1,088/10/0/0 (coverage run is the same suite
  with instrumentation).

### `secret_detection` (GitLab template, pinned)

- **Runs**: every MR + `main` push.
- **PASS**: no secret findings outside the committed allowlist
  (`.gitlab/secret-detection-ruleset.toml`).
- **FAIL**: ≥1 new, non-allowlisted finding; surfaced to the reviewer; job fails.
- **Allowlist contract**: the known fakes (secret-fixtures, AWS doc key, synthetic
  IPs) MUST produce zero findings (SC-002).

### `dependency_scanning` (GitLab template, pinned)

- **Runs**: every MR + `main` push against `package-lock.json`.
- **PASS**: no known advisories at/above the configured severity.
- **FAIL**: ≥1 advisory at/above severity; reported with severity.

## Scheduled-pipeline contract (Renovate)

### `renovate`

- **Runs**: scheduled pipeline only (`$CI_PIPELINE_SOURCE == "schedule"`), weekly;
  NOT in the per-MR quality gate.
- **Behavior**: opens dependency-update MRs — minor/patch batched into one MR,
  each major isolated; targets `main`; auto-rebase.
- **Auth contract**: uses `RENOVATE_TOKEN` (masked `safesignal`-scoped PAT,
  Developer/`api`, non-publish). MUST NOT carry npm publish rights.
- **Downstream**: each MR it opens runs the full quality gate above.
- **Idempotent**: no outdated deps → no MR, clean run.

## Local hook contracts (`scripts/hooks/`, opt-in via `core.hooksPath`)

### `pre-commit`

- **PASS**: staged lintable files are Biome lint-clean and format-clean.
- **FAIL**: blocks the commit; names offending file(s); points at `npm run format`
  / the lint fix. Never auto-formats or re-stages.
- **Scope**: staged files only (`--cached --diff-filter=ACM`).

### `commit-msg`

- **PASS**: message contains a `Signed-off-by: Name <email>` trailer.
- **FAIL**: blocks the commit; prints the `git commit -s` remedy.

### Authority contract

- Hooks are **opt-in** and advisory; **CI is authoritative**. An un-hooked clone
  cannot bypass any gate — the same checks run in CI on every MR.

## Reproducibility contract (Principle VIII)

- `npm run lint`, `npm run format:check`, and `npm run test:coverage` produce the
  **same pass/fail** locally (fresh clone) as their CI jobs. No gate is CI-only.
- All tool/template/analyzer versions are pinned.

## Invariance contract

- Establishing the format baseline keeps `dist/*` gz bytes identical
  (bundle-invariance gate) and the suite at 48/1,088/10/0/0.
