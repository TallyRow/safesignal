# Contract: Auto-Enabled Hooks + `verify` Gate

**Spec**: ../spec.md · **Plan**: ../plan.md · **Constitution**: v1.5.0 (IX, X, XI; no amendment)

Behavioral contract for the contributor-facing tooling. No consumer/runtime surface — these are
developer-workflow guarantees, each backed by a test or self-enforcing.

## Wiring (FR-001/002/003/011)

- **W1**: `package.json` MUST define `"prepare": "node scripts/setup-hooks.mjs"`.
- **W2**: `scripts/setup-hooks.mjs` MUST set `core.hooksPath` to `scripts/hooks` when run in a git
  working copy, and MUST be **idempotent**.
- **W3**: It MUST **never throw / never exit non-zero** — running it outside a git repo (or with git
  absent) is a silent no-op (so `npm install`/`npm ci`/`npm pack --dry-run` never break).
- **W4**: It MUST produce no stdout that could corrupt tooling parsing install/pack output.

## Commit-time (FR-004/005/006)

- **C1**: `scripts/hooks/pre-commit` (reused) MUST block a commit whose staged files have lint/format
  problems.
- **C2**: `scripts/hooks/prepare-commit-msg` MUST append a `Signed-off-by: Name <email>` trailer when
  the message has none, using the committer's configured git identity.
- **C3**: If a `Signed-off-by` trailer is already present, **C2** MUST NOT duplicate it.
- **C4**: `scripts/hooks/commit-msg` (reused) MUST block any commit still lacking a valid
  `Signed-off-by` trailer (backstop for paths that bypass **C2**).

## Push-time (FR-007/008)

- **P1**: `package.json` MUST define `"verify"` = `build && typecheck && lint && format:check && test && api:check` (build first).
- **P2**: `scripts/hooks/pre-push` MUST run `npm run verify` and abort the push on failure.
- **P3**: `git push --no-verify` MUST bypass **P2** (documented emergency escape).

## Boundaries (FR-009/010)

- **B1**: **No** new runtime or dev dependency is introduced.
- **B2**: **No** change to `.specify/memory/constitution.md`, `.github/workflows/ci.yml`, the published
  `exports`/`files` surface, or `src/`/`dist/`.
- **B3**: The DCO gate (`scripts/ci/dco-check.sh` + Principle XI) is **retained**, only auto-satisfied.

## Enforcement (Principle X — every guarantee has a check)

| Guarantee | Enforcing mechanism |
|-----------|---------------------|
| W1/P1 (scripts present + shape) | `tests/contract/dev-hooks.contract.test.ts` (structural) |
| W2 (wiring sets hooksPath, idempotent) | dev-hooks test — temp git repo |
| W3/W4 (tolerant, silent) | dev-hooks test — run setup in a non-git temp dir; assert exit 0 + no throw |
| C2/C3 (auto sign-off; no dup) | dev-hooks test — invoke `prepare-commit-msg` on temp message files (POSIX shell; skip-not-fail w/o shell) |
| C4 (backstop blocks unsigned) | dev-hooks test — invoke `commit-msg` on an unsigned message |
| C1 (pre-commit blocks) | reused hook; covered by its existing presence + shebang/exec assertions |
| P2 (pre-push runs verify) | dev-hooks test — assert hook exists/executable and invokes `npm run verify` |
| B1 (no new dep) | existing `tests/contract/dependency-pins.test.ts` (deps stay `{}`; peer set unchanged) |
| B2 (no surface change) | existing `distributed-surface.contract.test.ts` parity (unchanged); plan review |
| P3 / emergency bypass | git-native `--no-verify`; documented in CONTRIBUTING |
