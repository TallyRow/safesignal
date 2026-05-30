#!/usr/bin/env bash
# Bundle invariance check for SafeSignal CI pipelines.
# Compares gzipped sizes of dist/index.mjs + dist/transport-beacon.mjs
# from the current HEAD's build against the same files built from
# the merge-base commit. Fails if either delta exceeds ±1 KiB.
#
# Contract: specs/005-cicd-pipeline/contracts/ci-pipeline-stages.md
# Spec FR-005 (per Feature 003's bundle-invariance.md contract).
#
# Assumes: the current HEAD has already been built (`dist/` is present
# from a preceding `build` stage's artifact in the pipeline).

set -euo pipefail

TOLERANCE_BYTES=1024

# Determine the base commit to compare against.
# In MR context: CI_MERGE_REQUEST_DIFF_BASE_SHA points at the merge-base with the target branch.
# In default-branch push context: compare against the previous commit on main.
if [[ -n "${CI_MERGE_REQUEST_DIFF_BASE_SHA:-}" ]]; then
  BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA}"
elif [[ -n "${CI_DEFAULT_BRANCH:-}" ]]; then
  BASE=$(git merge-base "HEAD" "origin/${CI_DEFAULT_BRANCH}^" 2>/dev/null || git rev-parse "HEAD^")
else
  BASE=$(git rev-parse "HEAD^")
fi

echo "Bundle-invariance check: comparing HEAD against base ${BASE}"

# Verify current build artifacts exist.
for f in dist/index.mjs dist/transport-beacon.mjs dist/transport-otlp.mjs; do
  if [[ ! -f "${f}" ]]; then
    echo "FAIL: required artifact missing: ${f}"
    echo "      (the build stage should have produced it)"
    exit 1
  fi
done

# Fetch the base commit and build it in a worktree.
git fetch --depth=50 origin "${BASE}" 2>/dev/null || true

WORKTREE=$(mktemp -d -t safesignal-base-build.XXXXXX)
trap 'git worktree remove "${WORKTREE}" --force 2>/dev/null || rm -rf "${WORKTREE}"' EXIT

echo "Checking out base in worktree: ${WORKTREE}"
git worktree add "${WORKTREE}" "${BASE}"

echo "Building base commit..."
(
  cd "${WORKTREE}"
  npm ci --prefer-offline --no-audit --no-fund >/dev/null 2>&1
  npm run build >/dev/null 2>&1
)

# Compare gzipped sizes.
FAIL=0
printf "%-32s %8s %8s %8s   %s\n" "bundle" "pre (B)" "post (B)" "delta" "verdict"
printf "%-32s %8s %8s %8s   %s\n" "------" "-------" "--------" "-----" "-------"
for bundle in index transport-beacon transport-otlp; do
  # A bundle that does not exist in the base build is NEW on this branch
  # (e.g. a freshly-added subpath) — it has no prior size to compare, so
  # skip it here. Its absolute size budget is enforced by its own
  # bundle-shape security test instead.
  if [[ ! -f "${WORKTREE}/dist/${bundle}.mjs" ]]; then
    printf "%-32s %8s %8s %8s   %s\n" "dist/${bundle}.mjs" "-" "$(gzip -c "dist/${bundle}.mjs" | wc -c)" "-" "SKIP (new bundle, no base)"
    continue
  fi
  POST=$(gzip -c "dist/${bundle}.mjs" | wc -c)
  PRE=$(gzip -c "${WORKTREE}/dist/${bundle}.mjs" | wc -c)
  DELTA=$(( POST - PRE ))
  ABS_DELTA=${DELTA#-}
  STATUS="PASS"
  if (( ABS_DELTA > TOLERANCE_BYTES )); then
    STATUS="FAIL (delta ${DELTA} bytes exceeds ±${TOLERANCE_BYTES})"
    FAIL=1
  fi
  printf "%-32s %8d %8d %+8d   %s\n" "dist/${bundle}.mjs" "${PRE}" "${POST}" "${DELTA}" "${STATUS}"
done

if (( FAIL )); then
  echo ""
  echo "Bundle-invariance check FAILED — gzipped-size delta exceeds ±${TOLERANCE_BYTES} bytes"
  echo "for one or more bundles. Investigate the build output diff."
  exit 1
fi

echo ""
echo "Bundle-invariance check PASSED (all deltas within ±${TOLERANCE_BYTES} bytes gzipped)"
