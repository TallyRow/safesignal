# Baselines: Repo Legal & Community Foundation

Scratch file accumulating pre-feature and post-feature
measurements for the four invariance contracts
([file-presence-audit](./contracts/file-presence-audit.md),
[readme-front-matter](./contracts/readme-front-matter.md),
[migration-note-preservation](./contracts/migration-note-preservation.md),
[test-suite-invariance](./contracts/test-suite-invariance.md)).

## Pre-feature baseline

Captured 2026-05-28 on branch `004-community-foundation` at commit
`f88b8fc` (analysis remediation complete; pre-implementation).

### Test suite

| Metric           | Value |
| ---------------- | ----- |
| Test files       | 48    |
| Tests passing    | 1,088 |
| Tests todo       | 10    |
| Tests failing    | 0     |
| Unhandled errors | 0     |

Same baseline as feature 003 (no source/test changes have shipped
between then and now). Captured via `npm test` (vitest run).
Duration ~2.0s.

## Post-feature measurements

Captured 2026-05-28 after Phase 3–6 implementation (US1 + US2 +
US3 + US4 all shipped).

### Test suite (T020)

| Metric | Pre | Post | Status |
|---|---|---|---|
| Test files | 48 | 48 | ✅ PASS |
| Tests passing | 1,088 | 1,088 | ✅ PASS |
| Tests todo | 10 | 10 | ✅ PASS |
| Tests failing | 0 | 0 | ✅ PASS |
| Unhandled errors | 0 | 0 | ✅ PASS |

### Invariant diff (T020a)

| Path | Diff | Status |
|---|---|---|
| `src/**` | 0 lines | ✅ EMPTY |
| `tests/**` | 0 lines | ✅ EMPTY |
| `package.json` | +1 line (`"license": "MIT"` field) | ✅ INTENDED |

### File presence audit (T017)

All 9 required files exist with required content markers:

| File | Status |
|---|---|
| LICENSE | ✅ PASS |
| CONTRIBUTING.md | ✅ PASS |
| SECURITY.md | ✅ PASS |
| CODE_OF_CONDUCT.md | ✅ PASS |
| GOVERNANCE.md | ✅ PASS |
| .gitlab/issue_templates/Bug.md | ✅ PASS |
| .gitlab/issue_templates/Feature.md | ✅ PASS |
| .gitlab/issue_templates/Security.md | ✅ PASS |
| .gitlab/merge_request_templates/Default.md | ✅ PASS |
| README.md (modified) | ✅ PASS |
| package.json (modified) | ✅ PASS |

### README front-matter contract (T018) — 9 checks

- (1) H1 on line 1 — ✅
- (2) SafeSignal in first 6 lines — ✅
- (3) "Why SafeSignal" header in first 12 lines — ✅
- (4) Install command in first 24 lines — ✅
- (5) Quickstart import in first 32 lines — ✅
- (6) No migration content above line 30 — ✅
- (7) Migration pointer in lines 30–60 — ✅
- (8) Project resources section present — ✅
- (9) "What this package does NOT do (in v1)" preserved — ✅

### Migration-note preservation (T019)

Source (from `003-rename-safesignal:README.md`'s `## Renamed from
\`frontend-logging-sdk\`` block, with the adjacent `> **Status**:`
blockquote stripped as not-migration content): 25 lines.

Destination (relocated `## Migration history` block body, with
the new intro paragraph stripped): 25 lines.

`diff -q` of source vs destination: **identical** (byte-for-byte
match across the 25 lines). All 8 marker elements present in the
destination.

### Quickstart walkthrough (T021)

All 10 steps verified — see
[`checklists/final-review.md`](./checklists/final-review.md) for
the full pass/fail breakdown.

## Final-review record

See [`checklists/final-review.md`](./checklists/final-review.md)
for the consolidated acceptance statement, contract-by-contract
outcomes, and the MR-merge blocker (tallyrow.com email
deliverability verification).
