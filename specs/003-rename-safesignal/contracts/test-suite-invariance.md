# Contract: Test Suite Invariance

**Phase**: 1 (Design & Contracts)
**Feature**: [003-rename-safesignal/spec.md](../spec.md)
**Maps to**: FR-021, FR-027, SC-008, R-012

## Purpose

Feature 003 (project rename) MUST NOT touch test logic, MUST NOT
change test counts, and MUST NOT change pass / skip / todo counts.
A passing test suite with identical headline numbers pre- and
post-rename is the objective signal that the rename did not
accidentally shift runtime or contract behavior.

## Pre-rename baseline

Captured from the most recent `npm test` run on `master` before the
first rename edit. The baseline values from the project status
snapshot at the start of feature 003:

| Metric              | Value           |
| ------------------- | --------------- |
| Test files          | 48              |
| Tests passing       | 1,088           |
| Tests todo          | 10              |
| Tests failing       | 0               |
| Unhandled errors    | 0               |

Source: `~/org/agents/projects/frontend-logging-sdk.org`, end-of-feature-002 snapshot.

Tasks.md's first task re-captures these from the current `master`
to confirm the working baseline before any identity edits.

## Invariance assertion

After all rename edits land, a fresh `npm test` invocation MUST
produce **identical** counts for all five metrics:

```text
post_files     == baseline_files       (48)
post_passing   == baseline_passing     (1,088)
post_todo      == baseline_todo        (10)
post_failing   == baseline_failing     (0)
post_unhandled == baseline_unhandled   (0)
```

No metric is permitted to drift, even by one. Any difference
(including a passing-count increase from accidentally enabling a
todo test, or a file-count change from accidentally adding a test
file) requires investigation.

## Rationale

The rename touches:

- `package.json` metadata fields (`name`, `description`, etc.)
- `README.md`, `docs/safe-logging.md`, examples, quickstart files
- `CHANGELOG.md` (new file)
- The constitution's identity reference (if any)

None of these are imported by any test file. Therefore, the entire
test suite must produce byte-identical assertion output pre- and
post-rename.

## Specific tests called out

Two tests are EXPLICITLY name-agnostic and must continue to pass:

1. **`tests/contract/dependency-pins.test.ts`** — locks the
   `exports` map shape and the dependency pin set. The `name` field
   is NOT asserted; the `exports` map's three entries (`.`,
   `./testing`, `./transport-beacon`) and their types/import/require
   triples are asserted. After the rename, the test MUST pass with
   the same assertion count as pre-rename.

2. **`tests/integration/duplicate-copy-isolation.integration.test.ts`** —
   uses the legacy package-name string at lines 217-219 and 284 as
   marker strings to verify isolation behavior is **name-agnostic**.
   The test itself is name-agnostic: it would pass with any package
   name substituted, because the contract under test is "module
   federation duplicate-copy classification produces isolated
   runtimes regardless of name." After feature 003, this test stays
   unchanged and continues to pass.

## Failure-mode reasoning

If `npm test` reports a different headline number post-rename:

- **Files count changed**: Investigate whether a test file was
  accidentally added or removed. Tasks.md does not authorize either.
- **Passing count changed**: Investigate whether a test
  unexpectedly skipped, was unexpectedly enabled, or whether a
  contract assertion now counts differently. A runtime-behavior
  shift is the most likely explanation — abort the rename PR.
- **Todo count changed**: Likely a test was un-todo'd by mistake.
  Re-todo it; the rename does not enable previously-deferred tests.
- **Failing count > 0** or **unhandled > 0**: Hard fail. Investigate
  before merge. A rename should not introduce a test failure.

## Verification workflow

1. From the rename branch, BEFORE any edits, run:
   ```bash
   npm test
   ```
   Record the headline numbers.

2. Apply all rename edits (per the tasks.md sequence).

3. Re-run:
   ```bash
   npm test
   ```
   Record the headline numbers again.

4. Assert each metric matches its baseline exactly.

## Pass / Fail criteria

- **PASS**: All five metrics match the baseline exactly.
- **FAIL**: Any metric drifts by even one.

A FAIL means the rename PR must be investigated and the offending
delta either reverted or explicitly justified before merge.
