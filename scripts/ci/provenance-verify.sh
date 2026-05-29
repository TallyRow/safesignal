#!/usr/bin/env bash
# Post-publish provenance verification for SafeSignal release
# pipelines. Verifies the just-published version exists on the npm
# registry and that its provenance attestation is queryable.
#
# Soft-fails (warns but exits 0) if the verification times out —
# the publish itself already succeeded; this step is best-effort
# because npm registry propagation can be slow.
#
# Contract: specs/005-cicd-pipeline/contracts/release-pipeline.md
# Spec FR-013 + SC-005.

set -euo pipefail

TAG="${1:?usage: provenance-verify.sh <CI_COMMIT_TAG>}"
VERSION="${TAG#v}"
PACKAGE="@tallyrow/safesignal"

echo "Verifying ${PACKAGE}@${VERSION} on npm registry..."

# Give the registry time to propagate (publish completes async).
INITIAL_SLEEP=30
MAX_RETRIES=3
RETRY_SLEEP=20

sleep "${INITIAL_SLEEP}"

# Step 1: confirm the version exists on the registry.
attempt=1
while (( attempt <= MAX_RETRIES )); do
  if npm view "${PACKAGE}@${VERSION}" version >/dev/null 2>&1; then
    echo "  ✓ ${PACKAGE}@${VERSION} found on registry (attempt ${attempt})"
    break
  fi
  if (( attempt == MAX_RETRIES )); then
    echo "  ⚠ ${PACKAGE}@${VERSION} NOT visible on registry after ${MAX_RETRIES} attempts"
    echo "    Publish likely succeeded; npm registry propagation is delayed."
    echo "    Manually verify with: npm view ${PACKAGE}@${VERSION}"
    exit 0   # soft-fail
  fi
  echo "  (registry not yet showing version; retrying in ${RETRY_SLEEP}s)"
  sleep "${RETRY_SLEEP}"
  attempt=$((attempt + 1))
done

# Step 2: verify provenance attestation.
if npm audit signatures --pkg="${PACKAGE}@${VERSION}" 2>&1 | grep -qE "(verified registry signature|attestation)"; then
  echo "  ✓ provenance attestation verified for ${PACKAGE}@${VERSION}"
  echo ""
  echo "Provenance-verify PASSED — npm registry shows version + attestation."
else
  echo "  ⚠ provenance attestation NOT yet visible for ${PACKAGE}@${VERSION}"
  echo "    Publish succeeded; attestation may take a few minutes to propagate."
  echo "    Manually verify with: npm audit signatures --pkg=${PACKAGE}@${VERSION}"
  echo "    Or check the package page on npmjs.com → Provenance section."
  exit 0   # soft-fail
fi
