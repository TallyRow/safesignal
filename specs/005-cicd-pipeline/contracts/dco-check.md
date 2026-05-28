# Contract: DCO Sign-off Check Script

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Maps to**: FR-007, R-007, SC-002

## Purpose

Specify the behavior of `scripts/ci/dco-check.sh` — the CI job
that verifies every commit in an MR's commit range carries a
`Signed-off-by:` footer per Feature 004's DCO requirement.

## Inputs

| Variable | Source | Required? |
|---|---|---|
| `CI_MERGE_REQUEST_DIFF_BASE_SHA` | GitLab CI environment (MR pipeline) | yes |
| `CI_COMMIT_SHA` | GitLab CI environment (always) | yes |

Both variables are populated automatically by GitLab in MR
pipelines. Outside of MR context (e.g., default-branch push,
release pipeline), the script does NOT run — the CI job's `rules:`
gate it to MR pipelines only.

## Behavior

For each commit in the range `<diff-base>..<head>`, EXCLUDING:
- Merge commits (`--no-merges`)
- Commits authored by GitLab's bot (`gitlab-bot@gitlab.com` or
  `*@noreply.gitlab.com`)

Verify the commit message contains a footer of the form:

```text
Signed-off-by: <author-name> <author-email>
```

where `<author-name>` and `<author-email>` exactly match the
commit author's name and email (`git log --format='%an %ae'`).

## Outputs

### On PASS

stdout, exit 0:
```text
DCO sign-off check PASSED (N commits verified)
```

where `N` is the count of inspected non-bot, non-merge commits.

### On FAIL

stdout, exit 1:
```text
DCO sign-off check FAILED. Offending commits:
  abc1234 (johngoure@gmail.com) - missing or mismatched Signed-off-by
  def5678 (johngoure@gmail.com) - missing or mismatched Signed-off-by

Fix with:
  - For the latest commit:    git commit --amend --signoff
  - For a range:              git rebase --signoff -i $BASE
  - Then force-push:          git push --force-with-lease

See CONTRIBUTING.md § Developer Certificate of Origin
```

## Implementation

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA:?dco-check.sh requires MR context}"
HEAD="${CI_COMMIT_SHA:?dco-check.sh requires CI context}"

# Ensure base is fetched (CI clones with --depth=20 by default; deeper for older bases)
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
    FAILURES+=("$SHORT_SHA ($AUTHOR_EMAIL) - missing or mismatched Signed-off-by")
  fi
done < <(git rev-list --no-merges "$BASE..$HEAD")

if (( ${#FAILURES[@]} > 0 )); then
  echo "DCO sign-off check FAILED. Offending commits:"
  printf '  %s\n' "${FAILURES[@]}"
  echo ""
  echo "Fix with:"
  echo "  - For the latest commit:    git commit --amend --signoff"
  echo "  - For a range:              git rebase --signoff -i $BASE"
  echo "  - Then force-push:          git push --force-with-lease"
  echo ""
  echo "See CONTRIBUTING.md § Developer Certificate of Origin"
  exit 1
fi

echo "DCO sign-off check PASSED ($INSPECTED commits verified)"
```

## Edge cases

| Case | Behavior |
|---|---|
| MR with 0 non-bot commits in range | PASS with "0 commits verified" (vacuous truth) |
| Commit with `Signed-off-by:` footer but mismatched author email | FAIL (footer must match author) |
| Commit with multiple `Signed-off-by:` lines, including one matching author | PASS (the check looks for ANY matching footer line) |
| Commit message footer in different casing (`signed-off-by:` lowercase) | FAIL (case-sensitive match per DCO convention) |
| Commit with extra whitespace in `Signed-off-by:` line | FAIL (exact-string match required) |
| Range crossing a force-pushed history | Whatever the current HEAD's range is; the check is HEAD-state-relative |
| Shallow clone insufficient depth to reach BASE | Script attempts `git fetch --depth=100 origin <base>`; if BASE is older than 100 commits ago, the fetch may fail and the script will error before checking — surface as job failure |

## Pass / Fail criteria

- **PASS**: All non-bot commits in the range carry a matching
  `Signed-off-by:` footer.
- **FAIL**: Any commit lacks the footer or has a mismatched author.

A FAIL means the MR cannot merge until the contributor adds the
missing sign-offs.
