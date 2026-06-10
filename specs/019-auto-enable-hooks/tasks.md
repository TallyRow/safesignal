# Tasks: Auto-Enabled Local Quality Hooks + One-Command `verify` Gate

**Input**: Design documents from `/specs/019-auto-enable-hooks/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/hooks-and-verify.md ✅, quickstart.md ✅

**Tests**: REQUIRED. Each behavioral guarantee (wiring, auto-sign-off, pre-push) is paired with a test
in one shared file (`tests/contract/dev-hooks.contract.test.ts`); shell-behavior assertions run via a
resolved POSIX shell and **skip (never fail)** where none is on PATH (CI/ubuntu always runs them).

**Organization**: Tasks grouped by user story (from spec.md), independently testable. Constitution:
**v1.5.0** — **no amendment** (DCO retained, made automatic). This is contributor tooling: no `src/`,
`dist/`, `exports`, CI-workflow, or constitution change.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

New: `scripts/setup-hooks.mjs`, `scripts/hooks/prepare-commit-msg`, `scripts/hooks/pre-push`,
`tests/contract/dev-hooks.contract.test.ts`. Edited: `package.json` (+`verify`, +`prepare`),
`CONTRIBUTING.md`. Reused unchanged: `scripts/hooks/pre-commit`, `scripts/hooks/commit-msg`. New hook
files need their executable bit recorded in git via `git update-index --chmod=+x` (Windows has no FS
exec bit; POSIX/CI relies on the tree mode). The single test file is shared, so the three test tasks
(T003/T006/T009) touch it sequentially — not mutually `[P]`.

---

## Phase 1: Setup

- [X] T001 [P] Add the `verify` aggregate script to `package.json` `scripts`: `"verify": "npm run build && npm run typecheck && npm run lint && npm run format:check && npm test && npm run api:check"` (build first — dist-consuming contract tests + `api:check` need artifacts). Shared infra; also the command the US3 `pre-push` hook runs.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None — the three stories are independent (US1 = install-time wiring, US2 = commit-msg
sign-off, US3 = verify/pre-push). The shared test file is created by US1's first test task (T003) and
extended by US2/US3. No blocking cross-cutting work.

**Checkpoint**: proceed directly to user stories.

---

## Phase 3: User Story 1 — Hooks activate automatically on install (Priority: P1) 🎯 MVP

**Goal**: After a standard dependency install in a clone, the committed hooks are active with zero
manual setup; wiring is idempotent and never breaks install (no-op outside a git repo).

**Independent Test**: In a temp git repo, run the wiring script → `core.hooksPath` = `scripts/hooks`;
run it in a non-git temp dir → exits 0, no throw; `package.json` declares the `prepare` script
(quickstart §"You don't have to do anything").

### Tests for User Story 1 ⚠️ (write first)

- [X] T002 [US1] Create `tests/contract/dev-hooks.contract.test.ts` with the **wiring + tolerance** suite (W1/W2/W3/W4): assert `package.json` `scripts.prepare === 'node scripts/setup-hooks.mjs'`; running `node scripts/setup-hooks.mjs` (cwd = a temp `git init` repo) sets `git config core.hooksPath` to `scripts/hooks` and is **idempotent** on a second run; running it with cwd = a **non-git** temp dir **exits 0 and prints nothing to stdout** (never throws / never breaks install). Pure Node (`node:child_process`, `node:fs`, `node:os`), cross-platform.

### Implementation for User Story 1

- [X] T003 [US1] Create `scripts/setup-hooks.mjs` (Node ESM): `import { execSync } from 'node:child_process'; try { execSync('git config core.hooksPath scripts/hooks', { stdio: 'ignore' }); } catch { /* not a git repo / git absent — no-op */ }`. Silent, idempotent, never throws.
- [X] T004 [US1] Add `"prepare": "node scripts/setup-hooks.mjs"` to `package.json` `scripts`, then activate locally: `node scripts/setup-hooks.mjs` and confirm `git config core.hooksPath` → `scripts/hooks`. Makes T002 pass.

**Checkpoint**: hooks auto-enable on install; the pre-existing `pre-commit`/`commit-msg` now actually run.

---

## Phase 4: User Story 2 — DCO sign-off kept but frictionless (Priority: P2)

**Goal**: Committing without a manual flag auto-adds a `Signed-off-by` trailer; the existing
`commit-msg` blocking hook remains a backstop.

**Independent Test**: Invoke `prepare-commit-msg` on a temp message file with no sign-off → trailer
appended; with a sign-off already present → not duplicated; invoke `commit-msg` on an unsigned message
→ non-zero exit (quickstart §"On commit").

### Tests for User Story 2 ⚠️ (write first)

- [X] T005 [US2] Extend `tests/contract/dev-hooks.contract.test.ts` with the **sign-off behavior** suite (C2/C3/C4), run via a resolved POSIX shell and **skipped (not failed)** when no shell is on PATH: (a) `sh scripts/hooks/prepare-commit-msg <tmpMsg>` on a message lacking `Signed-off-by` appends a well-formed trailer using a configured identity; (b) on a message already containing the trailer, it is **not duplicated**; (c) `sh scripts/hooks/commit-msg <tmpUnsigned>` exits **non-zero** (backstop blocks). **Structural (cross-platform, always runs — C1/FR-004):** assert that **all three commit-time hooks** (`pre-commit`, `commit-msg`, `prepare-commit-msg`) exist, are executable (tree mode), and have an `sh` shebang; and that `scripts/hooks/pre-commit`'s body invokes `biome check` on staged files (mechanically verifying the reused lint/format gate is present + wired, so SC-001 is automatically covered, not only dogfooded).

### Implementation for User Story 2

- [X] T006 [US2] Create `scripts/hooks/prepare-commit-msg` (`#!/usr/bin/env sh`): read `$1`; if it has no `^Signed-off-by: ` line, append `Signed-off-by: $(git config user.name) <$(git config user.email)>`; if a trailer is present, or `user.name`/`user.email` is unset, do nothing (let `commit-msg` backstop block). Record exec bit: `git update-index --chmod=+x scripts/hooks/prepare-commit-msg`. Makes T005 pass.

**Checkpoint**: US1 + US2 — commits are format-checked and auto-signed; no unsigned commit can be created.

---

## Phase 5: User Story 3 — One-command `verify` + pre-push safety net (Priority: P3)

**Goal**: A single `verify` command reproduces the high-frequency CI verdict; a `pre-push` hook runs it
and blocks a failing push (bypassable with `--no-verify`).

**Independent Test**: `package.json` `verify` equals the documented chain; `scripts/hooks/pre-push`
exists, is executable, has an `sh` shebang, and invokes `npm run verify` (quickstart §"On push").

### Tests for User Story 3 ⚠️ (write first)

- [X] T007 [US3] Extend `tests/contract/dev-hooks.contract.test.ts` with the **verify + pre-push** suite (P1/P2): assert `package.json` `scripts.verify` exactly equals `npm run build && npm run typecheck && npm run lint && npm run format:check && npm test && npm run api:check`; assert `scripts/hooks/pre-push` exists, is executable (tree mode), has an `sh` shebang, and its body invokes `npm run verify`.

### Implementation for User Story 3

- [X] T008 [US3] Create `scripts/hooks/pre-push` (`#!/usr/bin/env sh`): print a one-line notice, then run `npm run verify`; a non-zero exit aborts the push. Record exec bit: `git update-index --chmod=+x scripts/hooks/pre-push`. (`verify` script itself was added in T001.) Makes T007 pass.

**Checkpoint**: all three stories functional; format/DCO/build/type/test issues are caught locally before CI.

---

## Phase 6: Polish & Validation

- [X] T009 [P] Update `CONTRIBUTING.md` `### Local commit hooks` (~L287–302): state hooks are **auto-enabled by `npm install`** (via the `prepare` script); keep `git config core.hooksPath scripts/hooks` as a manual fallback; document `npm run verify` as the one-command gate, the `pre-push` behavior, the new auto-sign-off (`prepare-commit-msg`), and the emergency `git commit/push --no-verify` bypass (FR-012).
- [X] T010 Full gate + no-regression: `npm run verify` green; confirm `npm install`, `npm ci`-equivalent, and `npm pack --dry-run` all succeed with `prepare` present (SC-005); confirm `tests/contract/dependency-pins.test.ts` (deps stay `{}`, B1) and `tests/contract/distributed-surface.contract.test.ts` (surface unchanged, B2) still pass; confirm **no** change to `.specify/memory/constitution.md` or `.github/workflows/ci.yml`.
- [X] T011 Run `quickstart.md` acceptance and confirm SC-001..SC-006 and the contract guarantees (W1–W4, C1–C4, P1–P3, B1–B3); dogfood on this feature's own commits (mis-formatted staged file blocked; commit without `-s` still signed; failing gate blocks `git push`); record results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 (`verify` script) — independent; needed by US3's `pre-push` (T008) and by T010.
- **User Stories**: US1 (T002–T004), US2 (T005–T006), US3 (T007–T008) are mutually **independent** and could be done in any order; recommended priority order US1 → US2 → US3.
- **Polish (Phase 6)**: after the stories (T010/T011 validate the whole; T009 docs can run anytime after the relevant pieces exist).

### Within each story

- Tests precede implementation (T002→T003/T004; T005→T006; T007→T008).
- The three test tasks (T002, T005, T007) edit the **same** file (`dev-hooks.contract.test.ts`) → sequential, **not** mutually `[P]`.

### Parallel opportunities

- T001 (`verify` script) is `[P]`.
- Implementation files are distinct, so across stories T003 (`setup-hooks.mjs`), T006 (`prepare-commit-msg`), T008 (`pre-push`) could proceed in parallel **once their story's test exists** — but each waits on its own test (same shared test file serializes the test-writing).
- T009 (CONTRIBUTING) is `[P]` with story implementation.

---

## Implementation Strategy

### MVP first (User Story 1)

1. Setup (T001) → US1 (T002–T004): the hooks **auto-activate on install**. This alone prevents the
   recurrence of the PR #45 format/DCO misses (the existing `pre-commit`/`commit-msg` now run).
2. **STOP and VALIDATE**: in a fresh clone, install → confirm `core.hooksPath` set → a mis-formatted
   staged commit is blocked locally.

### Incremental delivery

1. Setup + US1 → hooks auto-enabled (MVP).
2. US2 → sign-off is automatic (DCO kept, frictionless).
3. US3 → `verify` one-command gate + `pre-push` catches build/type/test regressions too.
4. Polish → docs (T009), full-gate + no-regression (T010), quickstart acceptance (T011).

---

## Notes

- **No new dependency**, no constitution change, no CI-workflow change, no published-surface change —
  `scripts/` is not in the packaged `files` (`["dist"]`). Reconfirmed by T010.
- The `prepare` wiring must be **silent + tolerant** so the packaging/parity `npm pack --dry-run`
  (which triggers `prepare`) is unaffected (SC-005).
- Shell-behavior tests (T005) **skip, never fail**, where no POSIX shell exists — a documented local
  coverage condition (plan Complexity Tracking), not a verdict divergence; CI always runs them.
- Commit after each task/logical group; the whole feature lands via one PR gated by `ci-success` —
  now caught locally first by these very hooks.
