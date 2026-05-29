# Research: CI/CD Pipeline & Release Workflow

**Phase**: 0 (Outline & Research)
**Feature**: [005-cicd-pipeline/spec.md](./spec.md)
**Plan**: [005-cicd-pipeline/plan.md](./plan.md)
**Date**: 2026-05-28

## GitLab.com free-tier CI/CD limits

**Decision**: Target GitLab.com SaaS free-tier shared runners as
the sole CI/CD environment. No self-hosted runners. No
paid-tier-only features (epics, advanced security scanning,
deployment freezes, multiple-environment dashboards) in the
pipeline.

**Rationale**: The user explicitly chose free-tier CI/CD via the
`/speckit-plan` command argument. SafeSignal's pipeline runs in
seconds locally; on shared runners the dominant cost is image
pull (~30-60 seconds) plus the matrix multiplier. At ~10 minutes
per MR pipeline × ~20 MRs/month = ~200 minutes used / 400 budget,
there's comfortable headroom.

**Free-tier constraints to design around**:

| Constraint | Value | Implication |
|---|---|---|
| CI/CD minutes per group per month | **400** (as of 2026-05) | Budget for ~20-40 MR pipelines/month before exhaustion; release pipelines consume ~12-15 min each |
| Shared runner instance class | **`saas-linux-small-amd64`** (1 vCPU, ~3.75 GB RAM, ~25 GB ephemeral disk) | Sufficient for SafeSignal's needs; matches `node:22-alpine` resource profile |
| Concurrent job count per project | 5 on free tier | Matrix arms × 6 stages can exceed this; use `needs:` to serialize within a matrix arm rather than fanning out 12+ concurrent jobs |
| Job timeout | 60 min default (raisable, but unnecessary) | All SafeSignal CI jobs complete in < 5 min individually |
| Build artifact size | 1 GB per job | `dist/` is ~50 KB; no concern |
| Image pull cache | shared across runs on the same runner | Use `node:22-alpine` (small, well-cached) over `node:22` (larger) |
| Docker-in-Docker support | yes, on shared runners with `tags: [saas-linux-small-amd64]` | Not needed by this feature — pure JS toolchain |
| `id_tokens:` (OIDC) support | yes, free tier | Required for the npm trusted-publisher publish flow |

**Source**: GitLab.com pricing & CI/CD docs (verify with
`https://docs.gitlab.com/ee/ci/runners/saas/linux_saas_runner.html`
and `https://about.gitlab.com/pricing/` before shipping; values
above match 2026-05 state).

**Alternatives considered**:

- *Self-hosted runners on a $5/month VPS*: more control + unlimited
  minutes, but adds an operational dependency (the VPS), a
  security boundary (the runner has access to OIDC tokens), and
  cost. Premature optimization for a single-maintainer project.
  Re-evaluatable if free-tier minutes become a bottleneck.
- *GitHub Actions instead of GitLab CI*: the project lives on
  GitLab; cross-host CI is operational complexity for no
  benefit.

## `.gitlab-ci.yml` shape for this pipeline

**Decision**: Single `.gitlab-ci.yml` at repo root with the
following structure:

```yaml
default:
  image: node:22-alpine
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/, node_modules/]
  before_script:
    - npm config set cache .npm --location=project
    - npm ci --prefer-offline --no-audit --no-fund

stages:
  - typecheck
  - test
  - build
  - audit
  - publish

# Reusable Node matrix definition
.node_matrix:
  parallel:
    matrix:
      - NODE_VERSION: ["20", "22"]
  image: node:$NODE_VERSION-alpine

# Quality-gate jobs (run on every MR + on default-branch push)
typecheck:
  stage: typecheck
  extends: .node_matrix
  script: [npm run typecheck]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

test:
  stage: test
  extends: .node_matrix
  script: [npm test]
  rules: [as above]

build:
  stage: build
  extends: .node_matrix
  script: [npm run build]
  artifacts:
    paths: [dist/]
    expire_in: 1 day
  rules: [as above]

bundle-invariance:
  stage: audit
  needs: [build]
  script: [scripts/ci/bundle-invariance-check.sh]
  rules: [as above]

dependency-pins:
  stage: audit
  script:
    - npm test -- tests/contract/dependency-pins.test.ts
                  tests/security/bundle-shape.security.test.ts
                  tests/security/transport-beacon-bundle-shape.security.test.ts
  rules: [as above]

dco-check:
  stage: audit
  script: [scripts/ci/dco-check.sh]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# Release pipeline (only on signed tags pointing at main)
.release_only:
  rules:
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+(-[\w.]+)?$/

verify-tag-signed:
  extends: .release_only
  stage: typecheck   # earliest stage; fail fast
  script:
    - git tag -v "$CI_COMMIT_TAG" || { echo "Tag not signed"; exit 1; }
    - git merge-base --is-ancestor "$CI_COMMIT_SHA" origin/main \
        || { echo "Tagged commit not on main"; exit 1; }

changelog-validate:
  extends: .release_only
  stage: audit
  script: [scripts/ci/changelog-validate.sh]

publish:
  extends: .release_only
  stage: publish
  id_tokens:
    NPM_ID_TOKEN:
      aud: https://registry.npmjs.org
  needs: [verify-tag-signed, typecheck, test, build,
          bundle-invariance, dependency-pins, changelog-validate]
  script:
    - DIST_TAG=$(if [[ "$CI_COMMIT_TAG" == *-* ]]; then echo "next"; else echo "latest"; fi)
    - npm publish --provenance --tag "$DIST_TAG"

provenance-verify:
  extends: .release_only
  stage: publish
  needs: [publish]
  script:
    - sleep 30   # let npm registry propagate provenance
    - scripts/ci/provenance-verify.sh "$CI_COMMIT_TAG"
```

**Rationale**: This shape achieves:
- **Matrix parallelism** on the version-dependent stages
  (typecheck/test/build) without fanning out to 12 concurrent
  jobs (audit/publish stages are single-Node).
- **Cache hits** on the npm cache directory across runs (npm `ci`
  with `--prefer-offline` is fast when the cache hits).
- **Fail-fast** with `verify-tag-signed` at the earliest stage of
  the release pipeline — if the tag isn't signed, no other jobs
  run.
- **Clean separation** of quality-gate rules (run on MRs and
  default-branch pushes) from release-gate rules (run only on
  signed tags). No cross-contamination of jobs into the wrong
  pipeline type.
- **OIDC token issuance** scoped to the publish job only — the
  token isn't available to other jobs that don't need it.

**Job count budget** (per pipeline type):

| Pipeline type | Jobs | Notes |
|---|---|---|
| MR pipeline | typecheck × 2 + test × 2 + build × 2 + bundle-invariance + dependency-pins + dco-check = **9 jobs** | Within 5-concurrent limit because stages serialize |
| Default-branch push | typecheck × 2 + test × 2 + build × 2 + bundle-invariance + dependency-pins = **8 jobs** | No DCO check (default-branch commits are post-merge; DCO already enforced on the MR) |
| Release pipeline | verify-tag-signed + typecheck × 2 + test × 2 + build × 2 + bundle-invariance + dependency-pins + changelog-validate + publish + provenance-verify = **12 jobs** | One per tag; rare; minute-budget impact is small |

**Alternatives considered**:

- *Single non-matrix pipeline targeting Node 22 only*: faster
  pipelines (~half the wall-clock), but loses Node 20 coverage.
  Q1 clarification picked 20+22 matrix; honoring that.
- *Splitting CI into multiple .yml files via `include:`*: more
  modular but adds indirection. Single-file is readable for a
  pipeline this small.
- *Using `parallel:` keyword without `matrix:`*: simpler but
  doesn't carry the `NODE_VERSION` variable forward into the
  image selection. Matrix is required.

**Source**: GitLab CI/CD reference docs
(`https://docs.gitlab.com/ee/ci/yaml/`), GitLab OIDC integration
docs (`https://docs.gitlab.com/ee/ci/cloud_services/`),
npm trusted-publisher docs
(`https://docs.npmjs.com/trusted-publishers`).

## GitLab OIDC trusted-publisher integration with npm

**Decision**: Use GitLab's `id_tokens:` block in `.gitlab-ci.yml`
to issue an OIDC token scoped to npm registry. Configure the trust
binding on the npm side via the "Trusted Publishers" UI on the
`@tallyrow/safesignal` package settings page (one-time
maintainer-side ops action).

**OIDC subject claim binding**: npm's trusted-publisher matches
against GitLab's `sub` claim, which has the shape:

```text
project_path:tallyrow/safesignal:ref_type:tag:ref:v1.0.1
```

The npm "Trusted Publishers" form requires:
- **Issuer**: `https://gitlab.com` (the GitLab OIDC issuer)
- **Subject claim pattern**: `project_path:tallyrow/safesignal:ref_type:tag:ref:v*`
  (or a tighter `:ref:v[0-9]+.[0-9]+.[0-9]+*` regex if npm
  supports it — verify which form npm accepts at config time)

This tight binding ensures:
1. Only the `tallyrow/safesignal` GitLab project's CI can publish.
2. Only pipelines triggered by a `v*`-prefixed tag can publish.
3. MR pipelines (which don't have a `ref_type:tag` claim) cannot
   publish even if a malicious MR includes a `publish` job
   invocation.

**Rationale**: This is npm's documented best practice for OIDC
trusted publishers as of 2024-2025. Provenance attestation is
automatic when publishing from a recognized trusted-publisher
context (`npm publish --provenance` doesn't need explicit
configuration of attestation; it's emitted by the CLI when the
OIDC environment is detected).

**Alternatives considered**:

- *Long-lived `NPM_TOKEN` in GitLab CI/CD variables*: works
  today, dramatically lower setup overhead, but a token leak =
  malicious publish capability. The whole point of this feature
  is to avoid that. Rejected.
- *Manual publish from maintainer machine*: how things work today.
  No provenance attestation, no audit trail, requires local 2FA
  hardware key. Rejected as the long-term posture; documented as
  the fallback if CI publish fails.

**Source**: npm trusted-publisher documentation
(`https://docs.npmjs.com/trusted-publishers`), GitLab OIDC docs
(`https://docs.gitlab.com/ee/ci/cloud_services/`), Sigstore docs
for `npm publish --provenance` semantics.

## `npm publish --provenance` mechanics

**Decision**: Use `npm publish --provenance --tag <dist-tag>` in
the publish job. Requires `npm` ≥ 9.5 (Node 20+ ships compatible
versions).

**What provenance attaches**: Sigstore-signed metadata linking
the published package version to (a) the source-control commit
SHA it was built from, (b) the CI workflow file path, (c) the
CI run ID, (d) the build environment. Consumers verify via:
- `npm audit signatures` (CLI verification)
- the "Provenance" badge on the package's npmjs.com page
- programmatic Sigstore Rekor log inspection

**Rationale**: Industry-standard supply-chain attestation as of
2024-2025. The same mechanism Datadog, Sentry, OpenTelemetry, and
hundreds of other npm packages use. Free, automatic when the
OIDC context is detected, machine-verifiable.

**Prerequisites the publish job depends on**:

1. The `@tallyrow/` npm scope is owned by the maintainer (or
   organization). One-time setup via `npm org create tallyrow`
   or via the npm web UI.
2. 2FA is enabled on the npm account (required for trusted
   publishers to work).
3. The Trusted Publishers binding is configured on the
   `@tallyrow/safesignal` package page on npmjs.com (one-time
   maintainer-side ops action; cannot be done via CLI).
4. The first publish of `@tallyrow/safesignal` either claims the
   package name (no prior publish) OR was already published
   manually as v1.0.0 — verify state before the first
   CI-triggered publish.

**Source**: npm Provenance docs
(`https://docs.npmjs.com/generating-provenance-statements`),
Sigstore Node.js project.

## DCO sign-off check implementation patterns

**Decision**: A shell script (`scripts/ci/dco-check.sh`) invoked
from a CI job that runs on MR pipelines only. It inspects the
commit range from the MR's merge-base to its HEAD, filtering out
GitLab-bot-authored merge commits, and verifies every remaining
commit message contains a `Signed-off-by:` footer matching the
commit author's email.

**Script shape**:

```bash
#!/usr/bin/env bash
set -euo pipefail

# In a GitLab MR pipeline, CI provides these variables:
BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA:?}"
HEAD="${CI_COMMIT_SHA:?}"

FAILURES=()
while IFS= read -r commit; do
  AUTHOR_EMAIL=$(git log -1 --format=%ae "$commit")
  AUTHOR_NAME=$(git log -1 --format=%an "$commit")

  # Filter out GitLab-bot-authored merge commits
  if [[ "$AUTHOR_EMAIL" == "gitlab-bot@gitlab.com" ]] \
     || [[ "$AUTHOR_EMAIL" == *"@noreply.gitlab.com" ]]; then
    continue
  fi

  # Look for Signed-off-by: in the commit message
  MESSAGE=$(git log -1 --format=%B "$commit")
  EXPECTED="Signed-off-by: $AUTHOR_NAME <$AUTHOR_EMAIL>"
  if ! grep -qF "$EXPECTED" <<< "$MESSAGE"; then
    FAILURES+=("$commit ($AUTHOR_EMAIL) - missing or mismatched Signed-off-by")
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

echo "DCO sign-off check PASSED ($(git rev-list --no-merges --count "$BASE..$HEAD") commits verified)"
```

**Rationale**:
- Shell + git, no external dependencies. Runs in any Node image.
- Matches author identity AS WELL as footer presence (catches
  the "wrong email in `Signed-off-by:`" case).
- Filters out GitLab-bot merge commits (the edge case from
  spec.md).
- Failure output names every offending commit and provides the
  exact fix commands — actionable, not just "DCO failed".

**Alternatives considered**:

- *GitHub Action `dcoapp/app`*: GitHub-specific; not applicable.
- *`probot/dco` or similar*: third-party GitHub apps; same.
- *`gitlint`*: has DCO rules but adds a Python dependency and
  config file. Overkill for a single check.
- *Stricter check requiring SSH/GPG signature on each commit
  in addition to DCO footer*: stronger but adds setup friction
  for contributors who don't have signing configured. Deferred
  to a future hardening pass.

## Bundle-invariance comparison mechanics

**Decision**: A shell script (`scripts/ci/bundle-invariance-check.sh`)
that:

1. Fetches the merge-base commit's tree (`git fetch origin <base>`,
   `git worktree add /tmp/base <base>`).
2. Builds the merge-base in the worktree (`cd /tmp/base && npm ci
   && npm run build`).
3. Compares `gzip -c <file> | wc -c` of `dist/index.mjs` and
   `dist/transport-beacon.mjs` from `/tmp/base` against the same
   from the current HEAD's build (which already happened in the
   `build` stage's artifact).
4. Fails the job if either delta exceeds 1024 bytes.

**Script shape**:

```bash
#!/usr/bin/env bash
set -euo pipefail

BASE="${CI_MERGE_REQUEST_DIFF_BASE_SHA:-$(git merge-base HEAD origin/main)}"
TOLERANCE_BYTES=1024

# Build the base in a worktree
git fetch --depth=1 origin "$BASE" 2>/dev/null || true
WORKTREE=$(mktemp -d)
git worktree add "$WORKTREE" "$BASE"
( cd "$WORKTREE" && npm ci --prefer-offline --no-audit --no-fund && npm run build )

# Compare
FAIL=0
for bundle in index transport-beacon; do
  POST=$(gzip -c "dist/${bundle}.mjs" | wc -c)
  PRE=$(gzip -c "$WORKTREE/dist/${bundle}.mjs" | wc -c)
  DELTA=$(( POST - PRE ))
  ABS_DELTA=${DELTA#-}
  STATUS="PASS"
  if (( ABS_DELTA > TOLERANCE_BYTES )); then
    STATUS="FAIL"
    FAIL=1
  fi
  printf "  %-25s pre=%6d  post=%6d  delta=%+5d  [%s]\n" \
    "dist/${bundle}.mjs" "$PRE" "$POST" "$DELTA" "$STATUS"
done

git worktree remove "$WORKTREE" --force

if (( FAIL )); then
  echo ""
  echo "Bundle-invariance check FAILED (delta exceeds ±${TOLERANCE_BYTES} bytes gzipped)"
  exit 1
fi
```

**Rationale**: Direct implementation of F003's
`bundle-invariance.md` contract. The merge-base build adds ~30-60
seconds to the pipeline (double `npm ci` + double `npm run build`)
but is the only way to compute a true delta — checking against a
stored baseline would require updating the baseline on every
intentional size change, which is operationally noisy.

**Optimization opportunity (deferred)**: cache the merge-base
build artifacts keyed on the base commit SHA, so repeated MR
pushes targeting the same base reuse the build. Adds complexity;
shipping the simple version first.

## `master`→`main` rename mechanics

**Decision**: Three-step rename — GitLab UI default-branch change,
local `git branch -m`, then in-repo sweep of forward-going
references.

**Step 1: GitLab UI** (maintainer-side ops):
1. Settings → Repository → **Default branch** → change `master` to
   `main` (creates `main` from current `master` HEAD if `main`
   doesn't exist, or just promotes existing `main`).
2. Settings → Repository → **Protected branches** — verify `main`
   inherits or gets the desired protections (FR-019).
3. GitLab automatically creates an alias from `master` → `main`
   for HTTP and Git clone URLs. Old `git clone
   https://gitlab.com/tallyrow/safesignal.git` will check out
   `main` as the default. FR-021 requires this alias to remain
   for at least 90 days post-rename.

**Step 2: Local clones** (every contributor, including maintainer):
```bash
git fetch origin
git branch -m master main
git branch -u origin/main main
git remote set-head origin -a
```

**Step 3: In-repo sweep** (this feature's tasks):

Run `grep -rn 'master' --include='*.md' --include='*.yml' \
  --include='*.yaml' --include='*.json' --include='*.ts' \
  --include='*.sh' . | grep -v 'specs/00[1234]-' | grep -v 'node_modules' | grep -v 'dist'`

Update every match that refers to the default branch. Leave
matches that refer to other concepts (legal text "master copy",
e.g.) alone.

**Archival reference handling**: `specs/001-*`, `specs/002-*`,
`specs/003-*`, `specs/004-*` directories contain contracts and
audit scripts that reference `master..HEAD`. Per F004's FR-018,
historical archives are preserved verbatim. The forward-going
scripts in `scripts/ci/` and `.gitlab-ci.yml` use `main` (or
`$CI_DEFAULT_BRANCH`).

**Edge case — refs hardcoded in CI scripts that look at the
default branch via name vs `$CI_DEFAULT_BRANCH`**: use
`$CI_DEFAULT_BRANCH` everywhere in `.gitlab-ci.yml` so a future
rename (if any) doesn't require another sweep.

**Source**: GitLab documentation on default-branch renames
(`https://docs.gitlab.com/ee/user/project/repository/branches/default.html`).

## CHANGELOG.md validation script

**Decision**: A shell script (`scripts/ci/changelog-validate.sh`)
invoked from the `changelog-validate` job in the release pipeline.
It extracts the version from `$CI_COMMIT_TAG` (e.g., `v1.0.1` →
`1.0.1`) and greps `CHANGELOG.md` for a matching `## [1.0.1]` or
`## [v1.0.1]` heading. Failure if absent.

**Script shape**:

```bash
#!/usr/bin/env bash
set -euo pipefail

TAG="${CI_COMMIT_TAG:?}"
VERSION="${TAG#v}"   # strip leading 'v' if present

# Look for either `## [1.0.1]` or `## [v1.0.1]` or `## [v1.0.1] —`
PATTERN="^## \[v?${VERSION//./\\.}\]"

if ! grep -qE "$PATTERN" CHANGELOG.md; then
  echo "CHANGELOG validation FAILED."
  echo ""
  echo "Tag: $TAG"
  echo "Expected CHANGELOG.md to contain a heading like:"
  echo "    ## [$VERSION]"
  echo "    ## [v$VERSION]"
  echo ""
  echo "Add the entry to CHANGELOG.md, amend or follow-up commit, then re-tag."
  exit 1
fi

echo "CHANGELOG validation PASSED — found entry for $TAG"
```

**Rationale**: Per Clarification Q2, CHANGELOG entries are manual.
The validation gate prevents the maintainer from accidentally
shipping a release with no documented notes. Failure mode is
clear: the script names the exact expected heading format and
the recovery path.

**Edge case — pre-release tags**: `v1.0.1-rc.1` → `VERSION` is
`1.0.1-rc.1`. The CHANGELOG MAY have a separate entry for the
RC (`## [1.0.1-rc.1]`) or MAY share the entry with the stable
release. Conservative default: require the RC to have its own
CHANGELOG entry; if the maintainer wants to reuse the stable
entry, they can manually duplicate it.

## Maintainer-side ops prerequisite checklist

These actions are blocking for the feature but happen outside
the repo:

1. **GitLab default-branch rename** (`master` → `main`) via UI.
2. **GitLab branch protection rules** on `main` per FR-019.
3. **npm scope `@tallyrow/` 2FA enforcement** via npm web UI.
4. **npm Trusted Publishers binding** on `@tallyrow/safesignal`
   page, configured to accept OIDC tokens from
   `gitlab.com/tallyrow/safesignal` with subject pattern
   matching `ref_type:tag:ref:v*`.
5. **First publish status verification**: confirm whether
   `@tallyrow/safesignal@1.0.0` was ever published manually. If
   not, the first CI publish (v1.0.1 ostensibly) will claim the
   scope and package name; if yes, subsequent publishes will
   require the maintainer's npm account to have publish rights
   to the existing package.

These will be surfaced as a maintainer-side ops task in
`tasks.md` (analogous to F003's T003 GitLab slug rename and
F004's tallyrow.com email setup).

## Versioning policy for this feature

**Decision**: F005 ships as `v1.0.1` — patch version bump.

**Rationale**: No consumer-visible API, behavior, or contract
change. The repo's CI/CD infrastructure changes are entirely
internal to the development workflow. The patch bump signals
"safe to update" to dependency-update bots while creating the
release artifact needed to dogfood the new release pipeline
itself (the first F005-pipeline-triggered publish will BE the
v1.0.1 release).

**Dogfooding observation**: F005's own first release tag will
exercise the very pipeline F005 ships. If the pipeline has
bugs, they surface at the first attempt. This is the right
proving-ground — better to find issues on a v1.0.1 release that
ships no API change than on a future v2.0 with real consumer
impact.
