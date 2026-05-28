# Contract: Test Suite Invariance

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](../spec.md)
**Maps to**: FR-037, FR-044, SC-009, R-013

## Purpose

Feature 004 ships **no source code, no test code, no dependency**
changes. The only `package.json` modification is the `license`
field addition (FR-002, FR-038). Therefore the full test suite
MUST pass with byte-identical headline counts pre- and post-
feature.

This is the same shape of contract feature 003 used
(`specs/003-rename-safesignal/contracts/test-suite-invariance.md`)
and feature 002 used (`specs/002-beacon-transport/`).

## Pre-feature baseline

Captured from `npm test` on `003-rename-safesignal` branch HEAD
(commit `4e0bb29`, the most recent commit before this feature's
work starts):

| Metric | Value |
|---|---|
| Test files | 48 |
| Tests passing | 1,088 |
| Tests todo | 10 |
| Tests failing | 0 |
| Unhandled errors | 0 |

These match the feature 003 final baseline because no code or
test files have changed between then and now.

## Invariance assertion

After all 004 file edits land, a fresh `npm test` invocation MUST
produce **identical** counts for all five metrics:

```text
post_files     == 48
post_passing   == 1,088
post_todo      == 10
post_failing   == 0
post_unhandled == 0
```

Any drift in any metric requires investigation.

## Rationale

The feature touches:

- New repo-root markdown files (`LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`)
- New `.gitlab/` template files
- Modified `README.md`
- `package.json` (single `license` field added)

None of these are imported by any test file. None affect any
runtime, build, or test dependency. The full test suite must
produce byte-identical assertion output pre- and post-feature.

If `npm test` produces different headline numbers, that signals
something unexpected was modified (e.g., a `package.json` change
that affected dependency resolution, or a stray `src/**` edit) —
abort and investigate.

## Verification workflow

```bash
# 1. Capture baseline (pre-feature)
git checkout 4e0bb29  # or the commit immediately before this feature's first task
npm test 2>&1 | grep -E "Test Files|Tests" | tee /tmp/baseline-counts.txt
git checkout 004-community-foundation

# 2. Apply all feature 004 file edits (per tasks.md sequence)
# ... edits land here ...

# 3. Re-run test suite
npm test 2>&1 | grep -E "Test Files|Tests" | tee /tmp/post-counts.txt

# 4. Compare
diff /tmp/baseline-counts.txt /tmp/post-counts.txt \
  && echo "test-suite-invariance PASS" \
  || { echo "DRIFT DETECTED — investigate"; exit 1; }
```

## Pass / Fail criteria

- **PASS**: All five metrics match the baseline exactly.
- **FAIL**: Any metric drifts by even one.

A FAIL means the feature accidentally touched runtime, test, or
dependency state. Revert the offending change before merge.
