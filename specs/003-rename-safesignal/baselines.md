# Baselines: SafeSignal Rename

Scratch file accumulating pre-rename and post-rename measurements for
the three invariance contracts
([bundle-invariance](./contracts/bundle-invariance.md),
[test-suite-invariance](./contracts/test-suite-invariance.md),
[legacy-name-audit](./contracts/legacy-name-audit.md)).

## Pre-rename baselines

Captured 2026-05-28 on branch `003-rename-safesignal` after rebasing
onto `master` at `529bcff` (feature 002 merged).

### Bundle sizes (gzipped, bytes)

| Bundle                          | Gzipped (B) |
| ------------------------------- | ----------- |
| `dist/index.mjs`                | 8,162       |
| `dist/transport-beacon.mjs`     | 3,101       |
| `dist/testing.mjs`              | 2,724       |

Recorded via `gzip -c <bundle> | wc -c` after a clean `npm run build`.

### Test suite

| Metric           | Value |
| ---------------- | ----- |
| Test files       | 48    |
| Tests passing    | 1,088 |
| Tests todo       | 10    |
| Tests failing    | 0     |
| Unhandled errors | 0     |

Captured via `npm test` (vitest run). Duration ~2.0s.

## Repository URL

GitLab project slug renamed to `safesignal` (no `-sdk` suffix) on 2026-05-28.

- Confirmed remote URL: `https://gitlab.com/tallyrow/safesignal.git`
- `package.json` `repository.url`: `git+https://gitlab.com/tallyrow/safesignal.git` (npm canonical form with `git+` protocol prefix)
- Local `origin` remote: updated to the new URL by the maintainer

## Post-rename measurements

(Populated by T028–T032 after all rename edits land.)
