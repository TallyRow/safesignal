#!/usr/bin/env bash
# DCO sign-off check for SafeSignal MR pipelines.
# Verifies every non-bot, non-merge commit in the MR's commit
# range carries a `Signed-off-by: Name <email>` footer matching
# the commit author.
#
# Contract: specs/005-cicd-pipeline/contracts/dco-check.md
# Spec FR-007.
#
# Run by GitLab CI; not intended for local use (relies on
# CI_MERGE_REQUEST_DIFF_BASE_SHA + CI_COMMIT_SHA env vars).

set -euo pipefail

BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA:?dco-check.sh requires MR context (CI_MERGE_REQUEST_DIFF_BASE_SHA env var)}"
HEAD="${CI_COMMIT_SHA:?dco-check.sh requires CI context (CI_COMMIT_SHA env var)}"

# CI typically clones with --depth=20; ensure BASE is reachable.
# Best-effort fetch; failures here are caught by the rev-list step.
git fetch --depth=100 origin "$BASE" 2>/dev/null || true

FAILURES=()
INSPECTED=0
while IFS= read -r commit; do
  AUTHOR_EMAIL=$(git log -1 --format=%ae "$commit")
  AUTHOR_NAME=$(git log -1 --format=%an "$commit")

  # Filter out GitLab-bot-authored commits (merge commits, automated commits)
  if [[ "$AUTHOR_EMAIL" == "gitlab-bot@gitlab.com" ]] \
     || [[ "$AUTHOR_EMAIL" == *"@noreply.gitlab.com" ]]; then
    continue
  fi

  INSPECTED=$((INSPECTED + 1))
  MESSAGE=$(git log -1 --format=%B "$commit")
  EXPECTED="Signed-off-by: ${AUTHOR_NAME} <${AUTHOR_EMAIL}>"
  if ! grep -qF "$EXPECTED" <<< "$MESSAGE"; then
    SHORT_SHA=$(git rev-parse --short "$commit")
    FAILURES+=("${SHORT_SHA} (${AUTHOR_EMAIL}) - missing or mismatched Signed-off-by")
  fi
done < <(git rev-list --no-merges "$BASE..$HEAD")

if (( ${#FAILURES[@]} > 0 )); then
  echo "DCO sign-off check FAILED. Offending commits:"
  printf '  %s\n' "${FAILURES[@]}"
  echo ""
  echo "Fix with:"
  echo "  - For the latest commit:    git commit --amend --signoff"
  echo "  - For a range:              git rebase --signoff -i ${BASE}"
  echo "  - Then force-push:          git push --force-with-lease"
  echo ""
  echo "See CONTRIBUTING.md § Developer Certificate of Origin"
  exit 1
fi

echo "DCO sign-off check PASSED (${INSPECTED} commits verified)"
