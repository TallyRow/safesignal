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

(Populated by T017–T021 + T020a after all rename edits land.)

## Final-review record

(Populated by T022.)
