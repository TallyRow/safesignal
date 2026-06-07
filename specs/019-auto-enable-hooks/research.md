# Phase 0 Research: Auto-Enabled Local Quality Hooks + `verify` Gate

All Technical-Context unknowns resolved below. **Decision / Rationale / Alternatives.**

## R1 — How to auto-activate hooks without a dependency

- **Decision**: An npm **`prepare`** lifecycle script runs a tiny Node script that executes
  `git config core.hooksPath scripts/hooks`. `prepare` fires on `npm install`/`npm ci` in a working
  copy and during `npm pack`/publish — i.e., exactly the dev/CI contexts — and points Git at the
  committed hook dir.
- **Rationale**: This is the standard **husky-free** auto-wiring pattern: zero new dependency,
  committed hooks, one config line. `core.hooksPath` (Git ≥ 2.9) cleanly redirects all hooks to a
  tracked directory. Matches Principle VI (minimal) and XI (no dep).
- **Alternatives**: **husky** (rejected — adds a devDependency + lifecycle indirection, against the
  lean-dep posture; spec out-of-scope). Symlinking/copying into `.git/hooks` (rejected — not tracked,
  fragile, manual). Documentation-only "run this command" (rejected — that's the status quo that
  failed: opt-in and skipped).

## R2 — Keeping `prepare` from breaking installs / consumers / packaging

- **Decision**: The wiring runs inside `scripts/setup-hooks.mjs` wrapped in `try/catch` with
  `stdio: 'ignore'`, so it is **silent** and **never throws** (idempotent; a non-git context or absent
  git is a no-op). It uses only `node:child_process`.
- **Rationale**: `prepare` must not fail `npm install`/`npm ci` (CI) or the **packaging/parity
  pack-dry-run** (the distributed-surface test runs `npm pack --dry-run`, which triggers `prepare`).
  A swallowed failure + silent stdio guarantees no lifecycle breakage and no corruption of pack output
  (FR-002/FR-011, SC-005). Consumers installing the **published tarball** do **not** run a dependency's
  `prepare`, so there is zero consumer effect (FR-003).
- **Alternatives**: A raw `"prepare": "git config core.hooksPath scripts/hooks"` shell command
  (rejected — `|| true` / `2>/dev/null` are **not** cross-platform between cmd and sh; a bare failure
  would break install in a non-git context). A `postinstall` script (rejected — `prepare` is the
  conventional hook-wiring lifecycle and also covers the git-dependency case).

## R3 — Frictionless DCO without dropping or weakening it

- **Decision**: Add a **`prepare-commit-msg`** hook that appends `Signed-off-by: <name> <email>` (from
  `git config user.name`/`user.email`) when the message has no `Signed-off-by:` line. Keep the existing
  **`commit-msg`** blocking hook as a backstop for commit paths that bypass `prepare-commit-msg`.
- **Rationale**: The user views DCO as ceremonial for a solo-maintainer repo but chose to **keep** it
  (Principle XI provenance retained, no constitution change). Auto-appending removes the manual `-s`
  friction that caused the PR #45 failure while the blocking hook still guarantees no unsigned commit
  (FR-005/FR-006, SC-002). `prepare-commit-msg` is the correct lifecycle stage (it edits the message
  before it's finalized; `commit-msg` only validates).
- **Alternatives**: Drop DCO entirely (rejected by decision — would require a constitution amendment).
  Keep manual `git commit -s` only (rejected — leaves the friction that failed). Replace the blocking
  hook with auto-append only (rejected — keep the backstop for GUI/tool commit paths that skip
  `prepare-commit-msg`).

## R4 — Composition of the `verify` gate

- **Decision**: `"verify": "npm run build && npm run typecheck && npm run lint && npm run format:check && npm test && npm run api:check"` — **build first** so the dist-consuming contract tests (`dependency-pins`, `distributed-surface`, `*-bundle-shape`) and `api:check` have artifacts.
- **Rationale**: Mirrors the **high-frequency** CI jobs with one command and the **same verdict** for
  the same source state (Principle IX, FR-007). It includes the two gates that bit us (`format:check`,
  plus `lint`) and the packaging/test gates.
- **Alternatives**: Include `bundle-invariance` / `secret-scan` / `coverage` (rejected for `verify` —
  they need external state: a base-commit worktree + `git fetch`, a Docker/gitleaks image, and a slow
  full-coverage run; they remain CI-side and are documented as such, SC-003 scope). A single
  `biome check` instead of `lint`+`format:check` (rejected — out of scope; would diverge from the CI
  job names).

## R5 — `pre-push` scope and bypass

- **Decision**: `pre-push` runs `npm run verify` and aborts the push on non-zero exit; an explicit
  `git push --no-verify` bypass is documented for emergencies.
- **Rationale**: `pre-commit` only sees staged files for lint/format — it cannot catch a broken build,
  type error, or failing test. Running `verify` at push time (a lower-frequency event than commit)
  extends local prevention to those without slowing every commit (FR-008, SC-004). Guardrail, not a
  lock.
- **Alternatives**: Run `verify` in `pre-commit` (rejected — too slow per commit). No pre-push
  (rejected — leaves build/type/test regressions to round-trip through CI).

## R6 — Cross-platform hook execution + testing

- **Decision**: Hooks stay POSIX **`sh`** scripts with `#!/usr/bin/env sh` (Git runs them via its
  bundled shell on Windows too). The **wiring** is Node (cross-platform). Shell-hook *behavior* tests
  invoke a resolved POSIX shell and **skip (never fail)** where none is on PATH; structural + wiring
  tests are pure Node and always run.
- **Rationale**: Matches the existing `pre-commit`/`commit-msg` style (already `sh`). Node wiring avoids
  cmd-vs-sh portability traps. The skip-not-fail policy keeps the local/CI verdict identical
  (Principle IX) — CI (ubuntu) always exercises the shell behavior authoritatively.
- **Alternatives**: Rewrite hooks in Node (rejected — heavier, diverges from existing hooks, and Git
  still needs an executable hook). Make behavior tests hard-fail without a shell (rejected — would flip
  the verdict on a shell-less dev box, violating IX).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Auto-activate without a dep | npm `prepare` → `git config core.hooksPath scripts/hooks` (R1) |
| Don't break install/consumers/pack | tolerant silent Node wiring; consumers never run `prepare` (R2) |
| Frictionless DCO, kept | `prepare-commit-msg` auto-append + `commit-msg` backstop (R3) |
| `verify` composition | build→typecheck→lint→format:check→test→api:check; CI-only gates excluded (R4) |
| pre-push scope/bypass | runs `verify`; `--no-verify` documented (R5) |
| Cross-platform + tests | `sh` hooks + Node wiring; shell-behavior tests skip-not-fail w/o shell (R6) |
