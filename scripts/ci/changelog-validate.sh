#!/usr/bin/env bash
# CHANGELOG validation for SafeSignal release pipelines.
# Extracts the version from $CI_COMMIT_TAG (strip leading 'v'),
# greps CHANGELOG.md for a matching `## [VERSION]` or `## [vVERSION]`
# heading. Fails if no matching entry — preventing release tags
# from shipping without documented release notes.
#
# Contract: specs/005-cicd-pipeline/contracts/release-pipeline.md
# Spec FR-017a (per Clarification Q2: manual CHANGELOG-first workflow).

set -euo pipefail

TAG="${CI_COMMIT_TAG:?changelog-validate.sh requires release-pipeline context (CI_COMMIT_TAG env var)}"
VERSION="${TAG#v}"   # strip leading 'v' if present

# Escape regex metacharacters in the version (mainly '.')
ESCAPED_VERSION="${VERSION//./\\.}"

# Match either `## [1.0.1]` or `## [v1.0.1]` headings; trailing content allowed
PATTERN="^## \[v?${ESCAPED_VERSION}\]"

if ! grep -qE "${PATTERN}" CHANGELOG.md; then
  echo "CHANGELOG validation FAILED."
  echo ""
  echo "Tag: ${TAG}"
  echo "Expected CHANGELOG.md to contain a heading like:"
  echo "    ## [${VERSION}]"
  echo "  or:"
  echo "    ## [v${VERSION}]"
  echo ""
  echo "Per CONTRIBUTING.md § Cutting a release, write the CHANGELOG entry"
  echo "BEFORE creating the release tag. Recovery:"
  echo "  1. Add the missing entry to CHANGELOG.md."
  echo "  2. Commit + merge to the default branch via MR."
  echo "  3. Delete the tag locally (git tag -d ${TAG}) and on origin (git push origin :${TAG})."
  echo "  4. Re-create and push the tag after the CHANGELOG entry merges."
  exit 1
fi

echo "CHANGELOG validation PASSED — found entry for ${TAG}"
