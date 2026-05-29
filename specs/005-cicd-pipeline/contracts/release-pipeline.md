# Contract: Release Pipeline

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Maps to**: FR-011..FR-017a, R-009, R-010, SC-004..SC-006

## Purpose

Specify the signed-tag-driven release pipeline that publishes
`@tallyrow/safesignal` to npm with provenance via GitLab OIDC
trusted-publisher.

## Trigger

Pipeline triggers on push of a git tag matching the regex:

```text
^v[0-9]+\.[0-9]+\.[0-9]+(-[\w.]+)?$
```

Examples that trigger:
- `v1.0.1` (stable)
- `v1.1.0-rc.1` (release candidate)
- `v2.0.0-beta.2` (beta)
- `v10.5.3-experimental.20260528` (custom pre-release)

Examples that do NOT trigger:
- `v1.0` (incomplete version)
- `release-1.0.1` (no `v` prefix)
- `1.0.1` (no `v` prefix)
- `v1.0.1+build.42` (build metadata after `+` not in the regex)

## Pipeline jobs (in execution order)

### `verify-tag-signed` (stage: `typecheck`, fail-fast)

| Field | Value |
|---|---|
| Command | `git tag -v "$CI_COMMIT_TAG"` AND `git merge-base --is-ancestor "$CI_COMMIT_SHA" origin/main` |
| Pass | tag signature verifies AND tagged commit is an ancestor of `origin/main` HEAD |
| Fail | unsigned tag, OR tag points at a commit not on `main` |
| Why fail-fast | Catches signing/ancestor errors before consuming any other CI minutes |

### Full quality-gate set (stages: `typecheck` through `audit`)

Same jobs as the MR pipeline: typecheck × 2, test × 2, build × 2,
bundle-invariance, dependency-pins. The `dco-check` job does NOT
run on release pipelines (default-branch commits are post-merge,
DCO was enforced on the MR that landed them).

### `changelog-validate` (stage: `audit`)

| Field | Value |
|---|---|
| Command | `scripts/ci/changelog-validate.sh` |
| Pass | `CHANGELOG.md` contains a `## [<version>]` or `## [v<version>]` heading matching the version extracted from `$CI_COMMIT_TAG` (with leading `v` stripped) |
| Fail | no matching heading |
| Failure output | exact expected heading format + recovery instructions |
| See | [Clarification Q2 — manual CHANGELOG-first workflow] |

### `publish` (stage: `publish`)

| Field | Value |
|---|---|
| Needs | All preceding release-pipeline jobs (verify-tag-signed, typecheck × 2, test × 2, build × 2, bundle-invariance, dependency-pins, changelog-validate) |
| Image | `node:22-alpine` (npm 10+ for provenance support) |
| `id_tokens:` | `NPM_ID_TOKEN: { aud: https://registry.npmjs.org }` |
| Command | `npm publish --provenance --tag $DIST_TAG` where `DIST_TAG` is `next` for pre-release tags (contains `-`), `latest` otherwise |
| Pass | npm registry accepts the publish, returns 200/201; provenance attestation generated |
| Fail | npm rejects (auth, scope ownership, version conflict, OIDC binding mismatch) |
| Expected runtime | ~30-60 sec (npm install + publish round-trip) |

### `provenance-verify` (stage: `publish`)

| Field | Value |
|---|---|
| Needs | `publish` |
| Command | `scripts/ci/provenance-verify.sh "$CI_COMMIT_TAG"` |
| Behavior | Sleeps 30 sec for npm propagation, then runs `npm view @tallyrow/safesignal@<version>` to confirm version exists; runs `npm audit signatures --pkg=@tallyrow/safesignal@<version>` to verify provenance attestation is queryable |
| Pass | both checks succeed within retry window (sleep 30, retry up to 3 times) |
| Soft-fail | warns but doesn't fail the pipeline if provenance lookup times out after retries — the publish succeeded; the verification is best-effort |

## Dist-tag derivation

```bash
if [[ "$CI_COMMIT_TAG" == *-* ]]; then
  DIST_TAG="next"      # pre-release: v1.0.1-rc.1 → 'next'
else
  DIST_TAG="latest"    # stable: v1.0.1 → 'latest'
fi
```

Consumers running `npm install @tallyrow/safesignal` (no version
specified) get the `latest` dist-tag. Consumers running `npm
install @tallyrow/safesignal@next` get pre-releases for testing.

## OIDC trust binding

| Component | Configuration |
|---|---|
| GitLab `id_tokens:` block | `NPM_ID_TOKEN: { aud: https://registry.npmjs.org }` in `.gitlab-ci.yml` |
| npm Trusted Publishers binding | Configured once on `https://www.npmjs.com/package/@tallyrow/safesignal/access` |
| Issuer | `https://gitlab.com` |
| Subject claim pattern | `project_path:tallyrow/safesignal:ref_type:tag:ref:v*` |
| Workflow file | `.gitlab-ci.yml` |

The binding rejects OIDC tokens that don't match the pattern. In
particular, MR pipelines (which don't have a `tag` ref) cannot
publish even if a malicious MR includes a `publish` job
invocation — the OIDC token from an MR pipeline has
`ref_type:branch`, not `ref_type:tag`.

## Pass / Fail criteria (pipeline-level)

- **PASS**: All jobs succeed; new version published to npm with
  provenance attestation; `provenance-verify` confirms registry
  state.
- **FAIL** (before publish): any quality gate fails OR
  `verify-tag-signed` fails OR `changelog-validate` fails. No
  publish occurs.
- **FAIL** (during publish): npm rejects (most common cause:
  Trusted Publishers binding misconfigured, scope ownership
  changed, or first-time version conflict if the version was
  somehow already published manually). Manual recovery: read
  npm error, fix root cause, re-cut tag.
- **SOFT-FAIL** (post-publish): `provenance-verify` fails to
  confirm propagation — publish itself succeeded; only the
  verification step is best-effort.

## Out-of-band considerations

- **First-ever publish**: If `@tallyrow/safesignal` was never
  manually published, the first CI-triggered publish CLAIMS the
  scope+package on npm. Subsequent publishes update the existing
  entry. The maintainer should run `npm view @tallyrow/safesignal`
  before cutting the first tag to confirm registry state.
- **Trusted Publishers binding cannot be configured via CLI** — it
  requires the npm web UI. This is a one-time maintainer-side ops
  action; document it as a prerequisite in tasks.md (analogous to
  F004's tallyrow.com email DNS setup).
- **Token rotation**: There's nothing to rotate. OIDC tokens are
  ephemeral (issued per-pipeline-run, valid for ~1 hour). Compromise
  of a single pipeline run's token doesn't grant future publish
  capability.
- **Tag deletion + re-tag**: If a release pipeline fails after
  publish (e.g., `provenance-verify` reports a real problem), the
  recovery is NOT to re-tag the same version (npm forbids
  re-publishing an existing version). The recovery is to bump to
  the next patch and re-tag.
- **Pre-release versions and CHANGELOG entries**: Pre-release
  tags (`v1.0.1-rc.1`) require their own `## [1.0.1-rc.1]` entry
  in `CHANGELOG.md` per Q2 — they don't auto-share with the
  stable entry. Maintainer can copy the stable entry forward when
  the RC becomes stable.
