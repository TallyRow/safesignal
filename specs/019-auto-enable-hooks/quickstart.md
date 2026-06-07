# Quickstart: auto-enabled hooks + `verify` gate (contributors)

> Developer-workflow tooling. Nothing here ships to consumers of `@tallyrow/safesignal`.

## You don't have to do anything

Hooks turn on automatically when you install dependencies:

```bash
npm install     # runs `prepare` → git config core.hooksPath scripts/hooks
```

After that, in this clone:

- **On commit** — staged files are lint/format-checked (commit blocked on issues), and a
  `Signed-off-by` trailer is added for you if missing (DCO satisfied, no `-s` needed).
- **On push** — the full local gate runs first.

To verify wiring (optional): `git config core.hooksPath` → prints `scripts/hooks`.

## The one-command gate

```bash
npm run verify   # build → typecheck → lint → format:check → test → api:check
```

Same verdict as the high-frequency CI jobs for the same source state. (CI also runs
bundle-invariance, a container secret-scan, and full coverage — those stay CI-side.)

## When something blocks you

- **Format/lint failed on commit** → `npm run format`, re-stage, commit again.
- **Need to commit/push past the hooks (emergency)** → `git commit --no-verify` /
  `git push --no-verify`. Guardrails, not locks.
- **No POSIX shell on your box** → the hooks need one (Git for Windows bundles it); the shell-behavior
  *tests* skip there, but CI always runs them.

## Verify (acceptance)

```bash
node scripts/setup-hooks.mjs && git config core.hooksPath   # → scripts/hooks
npm run verify                                              # → all green
npm test -- tests/contract/dev-hooks.contract.test.ts      # → wiring + hook behavior pass
```

Expected: a mis-formatted staged file is rejected at commit; a commit made without `-s` still carries
`Signed-off-by`; a failing gate blocks `git push`; `npm install`/`npm ci`/`npm pack --dry-run` all
succeed with the wiring present.
