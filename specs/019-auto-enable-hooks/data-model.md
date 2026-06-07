# Phase 1 Data Model: Auto-Enabled Local Quality Hooks + `verify` Gate

No persisted/runtime data. The "entities" here are the tooling artifacts and their contracts.

## Artifacts

### `prepare` lifecycle script (package.json) → `scripts/setup-hooks.mjs`

- **What**: npm `prepare` runs the Node wiring script on `npm install`/`npm ci`/`npm pack`/publish in a
  working copy.
- **Behavior / rules**:
  - Executes `git config core.hooksPath scripts/hooks` via `node:child_process`, `stdio: 'ignore'`.
  - Wrapped in `try/catch` → **never throws**; exits 0 even if not a git repo / git absent (FR-002).
  - **Idempotent** (re-running just re-sets the same value).
  - Does **not** run for downstream consumers of the published package (FR-003).

### `verify` script (package.json)

- **What**: `npm run verify` — single aggregate gate.
- **Composition (ordered)**: `build → typecheck → lint → format:check → test → api:check`.
- **Rules**: build first (dist-consuming tests + `api:check` need artifacts); same pass/fail verdict
  locally and in CI for the same source state (FR-007). Excludes CI-only gates (bundle-invariance,
  secret-scan, coverage).

### `scripts/hooks/prepare-commit-msg` (NEW, `sh`)

- **What**: Auto-appends the DCO trailer.
- **Inputs**: `$1` = commit-message file path.
- **Rules**: if the file has no line matching `^Signed-off-by: `, append
  `Signed-off-by: <git config user.name> <<git config user.email>>`; if a trailer is already present,
  do nothing (no duplicate, FR-005). If `user.name`/`user.email` are unset, do nothing and let the
  `commit-msg` backstop block (FR-006). Executable; `#!/usr/bin/env sh`.

### `scripts/hooks/pre-push` (NEW, `sh`)

- **What**: Runs the `verify` gate before a push.
- **Rules**: invoke `npm run verify`; non-zero exit aborts the push (FR-008). Bypass:
  `git push --no-verify`. Executable; `#!/usr/bin/env sh`.

### Reused (unchanged)

- **`scripts/hooks/pre-commit`** — Biome `check` (lint + format + import-org) on staged files; blocks on
  any issue (FR-004).
- **`scripts/hooks/commit-msg`** — blocks a commit lacking a valid `Signed-off-by` trailer (FR-006
  backstop).

## Relationships

```text
npm install / ci / pack ──runs──▶ prepare ──▶ scripts/setup-hooks.mjs ──▶ git config core.hooksPath = scripts/hooks
                                                                                  │
git commit ──▶ pre-commit (biome on staged) ──▶ prepare-commit-msg (auto sign-off) ──▶ commit-msg (block if unsigned)
git push   ──▶ pre-push ──▶ npm run verify ──▶ build/typecheck/lint/format:check/test/api:check
```

## Invariants

- Wiring never breaks `npm install`/`npm ci`/`npm pack`; no-op outside a git repo.
- No unsigned commit can be created (auto-append + blocking backstop).
- `verify` verdict is reproducible (local == CI) for a given source state.
- No new dependency; `scripts/` is not in the published `files` (`["dist"]`) → no surface change.
