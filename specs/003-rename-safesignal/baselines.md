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

Captured 2026-05-28 after T028 clean rebuild on branch
`003-rename-safesignal` at commit `25b223f` (US3 complete; version
bump in T035 follows).

### Bundle sizes (gzipped, bytes)

| Bundle                          | Pre-rename | Post-rename | Δ (bytes) | Tolerance | Status |
| ------------------------------- | ---------- | ----------- | --------- | --------- | ------ |
| `dist/index.mjs`                | 8,162      | 8,162       | **0**     | ±1,024    | ✅ PASS |
| `dist/transport-beacon.mjs`     | 3,101      | 3,101       | **0**     | ±1,024    | ✅ PASS |
| `dist/testing.mjs`              | 2,724      | 2,724       | **0**     | (info)    | ✅      |

Δ = 0 across the board confirms the package-name change does NOT
leak into the JS bundles (tsup outputs JS code only; `package.json`
metadata is not embedded).

### Test suite (T030)

| Metric           | Pre-rename | Post-rename | Status  |
| ---------------- | ---------- | ----------- | ------- |
| Test files       | 48         | 48          | ✅ PASS |
| Tests passing    | 1,088      | 1,088       | ✅ PASS |
| Tests todo       | 10         | 10          | ✅ PASS |
| Tests failing    | 0          | 0           | ✅ PASS |
| Unhandled errors | 0          | 0           | ✅ PASS |

### Dependency-pins + bundle-shape regression (T031)

| Test file                                                            | Assertions | Status  |
| -------------------------------------------------------------------- | ---------- | ------- |
| `tests/contract/dependency-pins.test.ts`                             | 87         | ✅ PASS |
| `tests/security/bundle-shape.security.test.ts`                       | 30         | ✅ PASS |
| `tests/security/transport-beacon-bundle-shape.security.test.ts`      | 74         | ✅ PASS |
| **Total**                                                            | **191**    | ✅ PASS |

### Legacy-name audit (T032)

- Total hits across the in-scope globs: **9**
- Hits in `README.md`: 5 (all inside the `## Renamed from frontend-logging-sdk` migration-note block from T014)
- Hits in `CHANGELOG.md`: 4 (all inside the v1.0.0 release entry from T016, which names SafeSignal in title + summary)
- Hits outside allowed migration-context callouts: **0**
- Outcome: ✅ **PASS** per `contracts/legacy-name-audit.md` allowed-exceptions criteria

### Version bump (T035)

- Pre-bump `package.json` `version`: `0.1.0`
- Post-bump `package.json` `version`: `1.0.0`
- README migration note + CHANGELOG entry both already referenced `v1.0.0` from US2 — no follow-up edits required
- Post-bump audit re-run (per T035): unchanged at 9 hits, all inside allowed callouts ✅

