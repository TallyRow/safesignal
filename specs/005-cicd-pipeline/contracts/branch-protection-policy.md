# Contract: Branch Protection Policy

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Maps to**: FR-018..FR-021, R-011, R-012, SC-007, SC-008

## Purpose

Specify the GitLab default-branch rename procedure (master →
main) and the branch protection rules that go into effect on the
new `main` branch.

## Default-branch rename

Maintainer-side ops action via GitLab UI:

1. **Settings → Repository → Default branch** (top section, before
   the Protected branches section).
2. Use the dropdown to change from `master` to `main`. If `main`
   doesn't exist yet, GitLab creates it from the current `master`
   HEAD; if `main` already exists (it shouldn't, on this repo),
   GitLab promotes the existing branch.
3. GitLab automatically:
   - Creates an alias from `master` → `main` so old clone URLs
     and pull/push commands continue to work.
   - Updates the project's "Default branch" indicator across the
     UI (Merge Requests, Pipelines, Repository views).
   - Recomputes the pipeline status badge URL (the `master` badge
     URL stops working; the `main` URL becomes canonical).

The alias remains active indefinitely by default; the spec
requires it to remain for at least **90 days post-rename**
(FR-021).

## Branch protection rules on `main`

Configured via GitLab UI: **Settings → Repository → Protected
branches** (scroll past the Default branch section).

| Setting | Value |
|---|---|
| **Branch** | `main` |
| **Allowed to merge** | `Maintainers` (currently: just `johng`) |
| **Allowed to push** | `No one` (force all changes through MRs) |
| **Allowed to force push** | `No one` (off) |
| **Require approval from code owners** | Off (no CODEOWNERS file in v1; future Feature 006 may add this) |

Additionally, in **Settings → Merge requests** (separate section):

| Setting | Value |
|---|---|
| **Pipelines must succeed** | On (gates merge on CI green) |
| **All threads must be resolved** | On |
| **Required approvals** | `1` (minimum approvers per MR) |
| **Squash commits when merging** | `Allow` (not `Require`) — maintainer's preference per MR |
| **Auto-delete source branch** | On (cleans up merged feature branches automatically) |

## In-repo `master` reference sweep

After the GitLab UI rename and contributors have moved local
branches (`git branch -m master main`), sweep the repo for
remaining `master` references in forward-going artifacts.

**Sweep command** (run from repo root after rename):

```bash
grep -rn 'master' \
  --include='*.md' --include='*.yml' --include='*.yaml' \
  --include='*.json' --include='*.ts' --include='*.sh' \
  --exclude-dir='node_modules' --exclude-dir='dist' \
  --exclude-dir='.git' \
  . \
  | grep -v 'specs/001-' \
  | grep -v 'specs/002-' \
  | grep -v 'specs/003-' \
  | grep -v 'specs/004-' \
  | grep -v 'package-lock.json'
```

**Expected forward-going files needing update**:
- `CLAUDE.md`
- `GOVERNANCE.md`
- `CONTRIBUTING.md` (if any `master` references — unlikely, but check)
- `.gitlab-ci.yml` (use `$CI_DEFAULT_BRANCH` not literal `main` where possible, so future renames don't require another sweep)
- `scripts/ci/*.sh` (use `$CI_DEFAULT_BRANCH` where possible)
- Any `specs/005-cicd-pipeline/**` contract scripts that mention the default branch
- `README.md` (CI status badge URL — must use `main` per the badge URL template)

**Files explicitly NOT updated** (preserved verbatim per F004's
FR-018 historical-archival rule):
- `specs/001-structured-logging-core/**`
- `specs/002-beacon-transport/**`
- `specs/003-rename-safesignal/**`
- `specs/004-community-foundation/**`

These reference `master..HEAD` in contract scripts; updating them
would invalidate point-in-time records. The MR for this feature
will surface the audit results in the sweep verification (FR-029)
and exclude archival paths explicitly.

## Verification

### `dig` / clone checks

```bash
# After rename, fresh clone uses main as default:
git clone https://gitlab.com/tallyrow/safesignal.git /tmp/safesignal-check
cd /tmp/safesignal-check
git branch --show-current
# Expected: main
```

### Push protection checks

From a maintainer workstation with push rights:

```bash
# Direct push to main should fail:
git push origin main
# Expected: rejected with "you cannot push directly to a protected branch"

# Force-push to main should fail:
git push --force origin main
# Expected: rejected with similar protection message

# Push to a feature branch should succeed:
git checkout -b test-branch-protection
git push -u origin test-branch-protection
# Expected: succeeds
```

### MR merge gating checks

Create a no-op test MR. Without CI green, the merge button should
be disabled. Without an approval, the merge button should be
disabled. With both, the merge button should be enabled.

### `master` sweep audit

Run the sweep command above. Expected output: ZERO matches (after
all references are updated). Any remaining match must be either
in an archival spec dir (excluded) or refer to a non-default-
branch concept (e.g., "master copy" in legal text).

## Pass / Fail criteria

- **PASS**:
  - Default branch is `main` on GitLab.
  - Branch protections match the table above.
  - Direct push and force-push to `main` are rejected.
  - MR merge requires CI green + approval + resolved threads.
  - In-repo grep sweep returns zero non-archival `master`
    references.
- **FAIL**:
  - Any protection rule misconfigured (verifiable via the GitLab
    Settings UI).
  - Any forward-going artifact still references `master` as the
    default branch.

## Out-of-band considerations

- **Existing local clones**: contributors with local clones
  tracking `master` will continue to work via GitLab's alias, but
  should run `git branch -m master main && git fetch origin && git
  branch -u origin/main main && git remote set-head origin -a` to
  align local state. The maintainer should document this in
  CONTRIBUTING.md's "Local development setup" section (small
  addition, captured in tasks.md).
- **External references to the `master` branch**: documentation
  sites, blog posts, or stale Stack Overflow answers may have
  `gitlab.com/tallyrow/safesignal/-/blob/master/...` URLs. GitLab's
  90-day alias keeps these resolving; after 90 days they 404.
  Recommended communication: update the README's migration note
  if the project gets adopted broadly enough to have external
  references.
- **Default branch in `package.json` `repository.url`**: doesn't
  encode a branch name; remains `git+https://gitlab.com/tallyrow/safesignal.git`
  regardless of default branch.
