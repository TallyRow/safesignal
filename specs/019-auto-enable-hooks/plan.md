# Implementation Plan: Auto-Enabled Local Quality Hooks + One-Command `verify` Gate

**Branch**: `019-auto-enable-hooks` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-auto-enable-hooks/spec.md`

## Summary

Make the repo's **existing** local git hooks activate automatically and make DCO sign-off frictionless,
so the class of failures that hit PR #45 (a formatting miss + a missing `Signed-off-by`, both caught by
hooks that were never wired on) can't reach CI again. Concretely: add an npm **`prepare`** lifecycle
script that points `core.hooksPath` at the committed `scripts/hooks/` via a tolerant cross-platform
Node wiring script; add a **`prepare-commit-msg`** hook that auto-appends `Signed-off-by` when absent
(keeping the existing blocking `commit-msg` as a backstop); add a single **`npm run verify`** command
(build → typecheck → lint → format:check → test → api:check) and a **`pre-push`** hook that runs it.
**No new dependency, no constitution change, no CI-workflow change, no published-surface change** — this
is contributor tooling. The existing `pre-commit` (Biome check on staged files) and `commit-msg` (DCO)
hooks are reused unchanged.

## Technical Context

**Language/Version**: POSIX `sh` hooks (executed by Git, incl. Git-for-Windows' bundled shell) + one
small **Node ESM** wiring script (`scripts/setup-hooks.mjs`); npm lifecycle (`prepare`) and npm scripts
in `package.json`. No TypeScript/runtime `src/` change.

**Primary Dependencies**: **None new.** Uses `git` (already required), Biome + the existing npm scripts,
and Node `node:child_process`. Not husky.

**Storage**: N/A.

**Testing**: Vitest. (1) A **structural contract test** (cross-platform, always runs): `package.json`
carries the `prepare` + `verify` scripts with the documented shape; the four hook files exist, are
executable, and have an `sh` shebang; `scripts/setup-hooks.mjs` is **tolerant** (running it in a
non-git temp dir exits 0, never throws). (2) A **wiring test** (pure Node, cross-platform): running the
setup script inside a temp git repo sets `core.hooksPath` to `scripts/hooks` and is idempotent.
(3) **Shell-hook behavior tests**: invoke `prepare-commit-msg` (appends when missing; no duplicate when
present) and `commit-msg` (blocks when missing) via a resolved POSIX shell — authoritative on CI
(ubuntu) and on any dev box with a shell on PATH; **skipped (never failed)** where no POSIX shell is
found, so the local/CI verdict never diverges (Principle IX).

**Target Platform**: Contributor machines (Windows + POSIX) and CI (ubuntu-latest).

**Project Type**: Repository developer-infrastructure / tooling (no consumer-facing package code).

**Performance Goals**: `pre-commit` stays fast (staged files only — unchanged). `pre-push` runs the full
`verify` gate (build + test, tens of seconds); acceptable for the lower-frequency push event and
bypassable with `--no-verify`.

**Constraints**: No new dependency (VI/XI); auto-wiring MUST be **idempotent + fail-safe** (no-op when
not a git repo / git absent; never break `npm install`/`npm ci`/`npm pack`); **cross-platform**; DCO
**retained** (Principle XI) but auto-satisfied; **no** change to the constitution, the CI workflow, or
the published surface; `verify` MUST give the **same verdict locally and in CI** for the same source
state (Principle IX).

**Scale/Scope**: `package.json` (+`prepare`, +`verify`), `scripts/setup-hooks.mjs` (new),
`scripts/hooks/pre-push` (new), `scripts/hooks/prepare-commit-msg` (new), `CONTRIBUTING.md` (docs), one
new test file. Reused unchanged: `scripts/hooks/pre-commit`, `scripts/hooks/commit-msg`, the CI quality
npm scripts.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0**. This feature makes **no** constitution change.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; the work was (correctly) re-routed through the
  full Spec Kit lifecycle rather than treated as an ad-hoc chore.
- **Stable Consumer API & Deprecation (II)** — ✅ **No** public API/config/type/behavior change; purely
  contributor tooling. Manual hook enabling still works (backward compatible). Nothing deprecated.
- **Browser Resilience & Failure Safety (III)** — ✅ N/A to runtime (no `src/` change). The *tooling*
  is itself fail-safe: wiring no-ops outside a git repo and never breaks install.
- **Framework-Neutral Structured Observability (IV)** — ✅ N/A (no logging/runtime code touched).
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ N/A to runtime. Auto-sign-off records only the
  committer's already-configured git identity; no secrets, no new data path.
- **Testable, Minimal, Maintainable (VI)** — ✅ **No new dependency**; small Node wiring script + two
  short `sh` hooks; reuses existing hooks/scripts. Test code held to repo standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ N/A (no event production).
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ N/A (no `Logger`/runtime change).
- **Reproducible Verification (IX)** — ✅ **Central.** `npm run verify` is the single documented
  entrypoint reproducing the high-frequency CI verdict locally; CI-only gates needing external state
  (bundle-invariance, secret-scan, coverage) stay CI-side and are documented as such. The shell-hook
  behavior tests **skip** (never fail) where no POSIX shell exists, so no verdict divergence; this skip
  is documented in the task list.
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ This feature **is** mechanical
  enforcement: each new gate (auto-activation, auto-sign-off, pre-push verify) is paired with a test or
  is itself the enforcing mechanism. It strengthens, removes nothing.
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ **No** change to the published surface,
  `exports`, packaged `files` (`["dist"]` — `scripts/` is not packaged), dependency set, attested
  publish, or signed tags. **DCO is retained** (the gate + Principle XI text are unchanged) — only made
  automatic. The `prepare` wiring is **inert for consumers** (it runs only in dev/CI git checkouts, not
  on a published-tarball install) and **harmless to the packaging/parity pack-dry-run**.

**Result: PASS** (constitution v1.5.0; no amendment). Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/019-auto-enable-hooks/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── hooks-and-verify.md   # behavioral contract: wiring, auto-sign-off, verify composition, pre-push
└── checklists/requirements.md
```

### Source / repository files affected

```text
Wiring + scripts:
├── package.json                       # + "prepare": "node scripts/setup-hooks.mjs"
│                                       # + "verify": "build && typecheck && lint && format:check && test && api:check"
└── scripts/setup-hooks.mjs            # NEW: tolerant `git config core.hooksPath scripts/hooks`
                                        #      (try/catch; node:child_process; no-op if not a git repo)

Hooks (sh; reuse two, add two):
├── scripts/hooks/pre-commit           # REUSED unchanged (Biome check on staged files)
├── scripts/hooks/commit-msg           # REUSED unchanged (DCO blocking — backstop)
├── scripts/hooks/prepare-commit-msg   # NEW: append Signed-off-by if absent (auto-sign-off)
└── scripts/hooks/pre-push             # NEW: runs `npm run verify`

Docs + tests:
├── CONTRIBUTING.md                    # "Local commit hooks": auto-enabled note + verify + pre-push + bypass
└── tests/contract/dev-hooks.contract.test.ts  # NEW: structural + wiring + shell-behavior assertions

Unchanged (explicitly): the constitution, .github/workflows/ci.yml, the published surface, src/, dist/.
```

**Structure Decision**: Auto-wire the existing committed hooks via an npm `prepare` script (the
husky-free standard pattern, no dependency); add the two missing hooks (`prepare-commit-msg`,
`pre-push`) and the `verify` aggregate script; document in CONTRIBUTING. Hooks stay `sh` (Git executes
them cross-platform); only the wiring is Node for cross-platform robustness.

## Approach & sequencing

1. **`verify` script** — add `"verify": "npm run build && npm run typecheck && npm run lint && npm run format:check && npm test && npm run api:check"` (build first; dist-consuming contract tests + `api:check` need artifacts).
2. **`scripts/setup-hooks.mjs`** — `try { execSync('git config core.hooksPath scripts/hooks', {stdio:'ignore'}) } catch {}`; idempotent, silent, never throws. Add `"prepare": "node scripts/setup-hooks.mjs"`.
3. **`scripts/hooks/prepare-commit-msg`** (`sh`) — read `$1` (message file); if no `^Signed-off-by:` line, append `Signed-off-by: $(git config user.name) <$(git config user.email)>`. Skip when identity is unset (let the `commit-msg` backstop speak). Executable bit via `git update-index --chmod=+x`.
4. **`scripts/hooks/pre-push`** (`sh`) — print a one-line notice; run `npm run verify`; non-zero aborts. Executable bit set.
5. **Activate locally + dogfood** — run `node scripts/setup-hooks.mjs`; confirm `core.hooksPath`; let this feature's own commits exercise pre-commit/prepare-commit-msg/pre-push.
6. **Tests** — `tests/contract/dev-hooks.contract.test.ts`: structural (scripts present + shape; hook files exist/executable/shebang; setup-hooks tolerant in a non-git temp dir), wiring (temp git repo → hooksPath set, idempotent), shell behavior (prepare-commit-msg append/idempotent; commit-msg block) via a resolved shell, skipped-not-failed where no shell.
7. **Docs** — update `CONTRIBUTING.md` `### Local commit hooks`: hooks auto-enabled by `npm install`; `npm run verify` is the one-command gate; `pre-push` runs it; emergency `--no-verify`.

All edits land via one PR on `019-auto-enable-hooks`, gated by `ci-success` — now caught locally first.

## Complexity Tracking

> No Constitution Check violations. One accepted condition recorded for traceability: the **shell-hook
> behavior tests** are skipped (never failed) on a dev machine with no POSIX shell on PATH. CI
> (ubuntu) always runs them, so this is a local coverage reduction on one platform, not a pass/fail
> divergence — it does not weaken the gate (Principle IX intent preserved). No `src/`-style relaxation,
> no new dependency, no constitution change.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
