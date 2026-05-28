# Contract: CI Pipeline Stages

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Maps to**: FR-001..FR-010, R-001..R-008, SC-001..SC-003

## Purpose

Specify the pass/fail behavior of every quality-gate stage in
the `.gitlab-ci.yml` pipeline. This contract is the authoritative
source for what each stage does and when it fails.

## Pipeline trigger rules

| Trigger | Pipeline type | Jobs run |
|---|---|---|
| `$CI_PIPELINE_SOURCE == "merge_request_event"` | MR pipeline | typecheck × 2, test × 2, build × 2, bundle-invariance, dependency-pins, dco-check |
| `$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` | Default-branch pipeline | typecheck × 2, test × 2, build × 2, bundle-invariance, dependency-pins (no dco-check — DCO was already enforced on the MR) |
| `$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+(-[\w.]+)?$/` | Release pipeline | See `release-pipeline.md` |
| anything else | no pipeline | — |

## Stages and pass/fail criteria

### `typecheck` stage

| Field | Value |
|---|---|
| Command | `npm run typecheck` (= `tsc --noEmit && tsc --noEmit -p tests/tsconfig.json`) |
| Matrix | `NODE_VERSION: ["20", "22"]` (2 parallel jobs) |
| Pass | exit 0 from both matrix arms |
| Fail | any TS error from any matrix arm |
| Failure output | the standard `tsc --noEmit` error output (file:line:col + message) |
| Expected runtime | < 30 sec per arm on shared runner |

### `test` stage

| Field | Value |
|---|---|
| Command | `npm test` (vitest run) |
| Matrix | `NODE_VERSION: ["20", "22"]` (2 parallel jobs) |
| Pass | exit 0 + non-regression vs. pre-merge baseline (pass count ≥ baseline, failing count ≤ baseline, unhandled count ≤ baseline) |
| Fail | any test failure, any unhandled error, OR pass count strictly less than baseline |
| Failure output | the standard vitest reporter output identifying failing test(s) by file:test |
| Expected runtime | < 30 sec per arm on shared runner |

**Non-regression check implementation**: the `test` stage runs
the suite and lets vitest report results. A non-zero exit code on
any failure auto-fails the stage. The "pass count cannot decrease"
check is implicit (failing tests cause non-zero exit). Explicit
baseline-counting is not implemented in v1 — the gate is "every
test that ran before still passes" rather than "the exact pass
count matches an arbitrary baseline number".

### `build` stage

| Field | Value |
|---|---|
| Command | `npm run build` (tsup) |
| Matrix | `NODE_VERSION: ["20", "22"]` (2 parallel jobs) |
| Pass | exit 0 + `dist/index.mjs`, `dist/index.cjs`, `dist/testing.mjs`, `dist/testing.cjs`, `dist/transport-beacon.mjs`, `dist/transport-beacon.cjs` all present |
| Fail | tsup build error, OR any expected dist file missing post-build |
| Artifact | `dist/` directory (1-day TTL); consumed by `bundle-invariance` stage |
| Expected runtime | < 30 sec per arm on shared runner |

### `bundle-invariance` stage

| Field | Value |
|---|---|
| Command | `scripts/ci/bundle-invariance-check.sh` |
| Matrix | none (single Node `22` job) |
| Needs | `build` job artifact (`dist/` from the Node `22` matrix arm) |
| Pass | `abs(gzipped_post - gzipped_pre) <= 1024` bytes for BOTH `dist/index.mjs` and `dist/transport-beacon.mjs` |
| Fail | either delta > 1024 bytes gzipped |
| Failure output | per-bundle pre/post/delta table + bold FAIL marker |
| Expected runtime | < 90 sec (includes worktree checkout + dual `npm ci` + dual `npm run build`) |
| Skip rules | This stage SKIPS (status = "manual") on the very first MR of a brand-new branch with no merge-base in `origin/main` (rare edge case; only happens on the very first MR ever) |

### `dependency-pins` stage

| Field | Value |
|---|---|
| Command | `npm test -- tests/contract/dependency-pins.test.ts tests/security/bundle-shape.security.test.ts tests/security/transport-beacon-bundle-shape.security.test.ts` |
| Matrix | none (single Node `22` job) |
| Pass | exit 0 from vitest (all 191 assertions across 3 files pass) |
| Fail | any assertion failure |
| Failure output | the standard vitest reporter output, naming the failing assertion |
| Expected runtime | < 5 sec |

### `dco-check` stage (MR pipelines only)

| Field | Value |
|---|---|
| Command | `scripts/ci/dco-check.sh` |
| Matrix | none (single Node `22` job; could run on any image but Node is what's cached) |
| Rule | `$CI_PIPELINE_SOURCE == "merge_request_event"` |
| Pass | every non-merge, non-bot commit in `$CI_MERGE_REQUEST_DIFF_BASE_SHA..$CI_COMMIT_SHA` range carries a `Signed-off-by: Name <email>` footer matching the commit author |
| Fail | any commit in the range lacks the footer OR has a footer mismatching the author |
| Failure output | per-commit "MISSING" / "MISMATCH" lines + the recovery commands (`git commit --amend --signoff`, `git rebase --signoff -i <base>`, `git push --force-with-lease`) |
| Expected runtime | < 5 sec |
| See | [`dco-check.md`](./dco-check.md) for full script contract |

## Parallelism + needs graph

```text
typecheck (×2) ──┐
                 ├──> [success required for: merge button on MR]
test (×2) ───────┤
                 │
build (×2) ──────┴──> dist/ artifact ──> bundle-invariance ──┐
                                                              │
dependency-pins ──────────────────────────────────────────────┤
                                                              ├──> all green = merge unblocked
dco-check (MR only) ──────────────────────────────────────────┘
```

All `audit` stage jobs (`bundle-invariance`, `dependency-pins`,
`dco-check`) run in parallel after the build/test/typecheck
stages complete. Total wall-clock for an MR pipeline is roughly
`max(typecheck, test, build) + max(audit jobs)` ≈ 30s + 90s
+ image-pull overhead ≈ 5 minutes typical, 8 minutes worst-case
(cold cache).

## Concurrent job count

Free-tier shared-runner limit: **5 concurrent jobs per project**.

| Pipeline | Peak concurrent jobs | Within limit? |
|---|---|---|
| MR | 6 jobs in `audit` stage (after the 6-job typecheck+test+build matrix) but only 3 of those are in stage `audit` (the other 3 are in stage 4 of 5: `audit`); typecheck+test+build matrix peaks at 6 concurrent during stage 1 | **Exceeds limit during stage 1** (6 > 5); GitLab queues the 6th matrix job briefly. No correctness issue, ~10 sec delay |
| Default-branch | 6 during typecheck/test/build matrix stages (peak), 2 during audit | Exceeds 5 by 1 during matrix stages; same minor queueing |
| Release | 12 jobs total over the pipeline lifetime; peak concurrent is the same 6 during matrix stages | Same minor queueing |

**Decision**: Accept the minor queueing on free tier. To eliminate
it, drop the Node matrix to a single version (`22.x` only),
which Clarification Q1 explicitly rejected. The 10-second delay
is acceptable.

## Pass / Fail criteria (pipeline-level)

- **PASS**: All stages succeed; merge button enabled.
- **FAIL**: Any stage fails; merge button disabled with stage
  name + failure reason surfaced in GitLab MR UI.
- **MANUAL**: `bundle-invariance` may be MANUAL on first-ever MR
  (no merge-base available); maintainer manually advances after
  confirming no regression possible.

## Out-of-band considerations

- Stages run on every MR — no `paths:` filters skip them based on
  what changed. A README-only change still pays the full pipeline
  cost. Trade-off: simpler config + uniform signal. If CI minute
  consumption becomes a concern, add `changes:` rules in a
  follow-up.
- The `node:22-alpine` default image is small (~50 MB) and
  cached aggressively by GitLab. First-image-pull-on-fresh-runner
  is ~60 sec; subsequent jobs reuse the cached layer.
- `npm cache` is project-scoped (per `cache:` config); persists
  across runs on the same runner. Cache miss adds ~30 sec.
