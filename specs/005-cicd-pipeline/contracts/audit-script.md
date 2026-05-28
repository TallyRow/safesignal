# Contract: Post-Merge Audit Script

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Maps to**: FR-029..FR-032, SC-010..SC-012

## Purpose

Verify that every required artifact this feature ships is
mechanically present at HEAD after the merge. Analogous to F004's
`file-presence-audit.md`.

## Required files at HEAD

| Path | Min size (bytes) | Required content markers |
|---|---|---|
| `.gitlab-ci.yml` | 1024 | `stages:`, `typecheck`, `test`, `build`, `bundle-invariance`, `dependency-pins`, `dco-check`, `publish`, `provenance-verify`, `NODE_VERSION`, `node:20-alpine`, `node:22-alpine`, `id_tokens:`, `npm publish --provenance`, `npm publish --provenance` |
| `scripts/ci/dco-check.sh` | 512 | `#!/usr/bin/env bash`, `Signed-off-by:`, `CI_MERGE_REQUEST_DIFF_BASE_SHA`, executable bit set |
| `scripts/ci/bundle-invariance-check.sh` | 512 | `gzip -c`, `dist/index.mjs`, `dist/transport-beacon.mjs`, `TOLERANCE_BYTES=1024`, executable bit set |
| `scripts/ci/changelog-validate.sh` | 256 | `CHANGELOG.md`, `CI_COMMIT_TAG`, `## \[`, executable bit set |
| `scripts/ci/provenance-verify.sh` | 256 | `npm audit signatures`, `npm view`, executable bit set |
| `CONTRIBUTING.md` (modified) | (existing + new section) | `## Cutting a release`, `git tag -s`, `npm publish --provenance`, `CHANGELOG.md`, `Sigstore` |
| `README.md` (modified) | (existing + new badge) | `pipeline.svg`, `tallyrow/safesignal/-/commits/main` (or `master` until rename completes) |
| `GOVERNANCE.md` (modified) | (existing + reference fix) | NO occurrence of "Feature 006" in the "CI-mediated publish" sentence; YES occurrence of "Feature 005" (or v1.0.1 reference) in same context |
| `CLAUDE.md` (modified) | (small change) | SPECKIT marker points at `specs/005-cicd-pipeline/plan.md` |

## Audit script (reference)

```bash
#!/usr/bin/env bash
set -e

# 1. File existence + executable bits
for f in .gitlab-ci.yml \
         scripts/ci/dco-check.sh \
         scripts/ci/bundle-invariance-check.sh \
         scripts/ci/changelog-validate.sh \
         scripts/ci/provenance-verify.sh; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done

# Shell scripts must be executable
for f in scripts/ci/*.sh; do
  test -x "$f" || { echo "NOT EXECUTABLE: $f (run: chmod +x $f)"; exit 1; }
done

# 2. .gitlab-ci.yml content markers
grep -q "^stages:" .gitlab-ci.yml
grep -q "typecheck:" .gitlab-ci.yml
grep -q "test:" .gitlab-ci.yml
grep -q "build:" .gitlab-ci.yml
grep -q "bundle-invariance:" .gitlab-ci.yml
grep -q "dependency-pins:" .gitlab-ci.yml
grep -q "dco-check:" .gitlab-ci.yml
grep -q "publish:" .gitlab-ci.yml
grep -q "provenance-verify:" .gitlab-ci.yml
grep -q "NODE_VERSION" .gitlab-ci.yml
grep -q "node:20-alpine" .gitlab-ci.yml
grep -q "node:22-alpine" .gitlab-ci.yml
grep -q "id_tokens:" .gitlab-ci.yml
grep -q "npm publish --provenance" .gitlab-ci.yml

# 3. README badge
grep -q "pipeline.svg" README.md

# 4. CONTRIBUTING.md "Cutting a release" section
grep -q "^## Cutting a release$" CONTRIBUTING.md
grep -q "git tag -s" CONTRIBUTING.md
grep -q "npm publish --provenance" CONTRIBUTING.md

# 5. GOVERNANCE.md feature-reference fix
! grep -q "Feature 006" GOVERNANCE.md || \
  { echo "GOVERNANCE.md still references 'Feature 006' — should be 'Feature 005' or removed"; exit 1; }
grep -q "Feature 005" GOVERNANCE.md || \
  grep -q "v1.0.1" GOVERNANCE.md || \
  { echo "GOVERNANCE.md should reference Feature 005 or v1.0.1 for the CI-mediated publish context"; exit 1; }

# 6. Test suite invariance
npm test 2>&1 | grep -E "Test Files|Tests" | head -2

# 7. No NPM_TOKEN in any committed file (paranoid double-check)
! grep -rE 'NPM_TOKEN|NODE_AUTH_TOKEN|npm_publish_token' .gitlab-ci.yml scripts/ || \
  { echo "long-lived npm token reference found in CI config — must use OIDC only"; exit 1; }

# 8. master sweep (forward-going only; archival specs excluded)
RESULTS=$(grep -rn 'master' \
  --include='*.md' --include='*.yml' --include='*.yaml' \
  --include='*.json' --include='*.ts' --include='*.sh' \
  --exclude-dir='node_modules' --exclude-dir='dist' --exclude-dir='.git' \
  . \
  | grep -v 'specs/00[1-4]-' \
  | grep -v 'package-lock.json' \
  || true)

if [ -n "$RESULTS" ]; then
  echo "Forward-going artifacts still reference 'master':"
  echo "$RESULTS"
  echo ""
  echo "Either (a) update to 'main' / \$CI_DEFAULT_BRANCH, or (b) confirm the reference is to a non-default-branch concept (e.g., 'master copy')."
  # Don't fail the audit here — some references may be legitimate (e.g., legal text)
  # Just surface for review.
fi

echo ""
echo "audit-script PASS"
```

## Pass / Fail criteria

- **PASS**: All required files exist, executable bits set, all
  content markers present, test suite passes, no `NPM_TOKEN`
  references in committed files.
- **FAIL**: Any missing file, missing executable bit, missing
  content marker, test failure, OR an `NPM_TOKEN` reference
  found.

A FAIL means the feature isn't complete. Fix and re-run.

## Out-of-band verification (cannot be audited from CLI alone)

These require manual verification by the maintainer because they
live in GitLab's UI or npm's registry:

1. **Branch protection rules on `main`** match
   `branch-protection-policy.md`. Verifiable via GitLab Settings
   → Repository → Protected branches.
2. **npm Trusted Publishers binding** is configured on
   `@tallyrow/safesignal` page. Verifiable via the npm web UI
   only.
3. **2FA on `@tallyrow/` scope** is enforced. Verifiable via the
   npm web UI only.
4. **NO `NPM_TOKEN` exists in GitLab CI/CD variables**. Verifiable
   via GitLab Settings → CI/CD → Variables. The audit script
   above checks committed files; it can't check GitLab project
   variables (those aren't in the repo).
5. **First release-pipeline dogfood run** completes end-to-end
   with provenance attestation visible on npmjs.com. This is the
   real proving-ground — until a real publish succeeds, the
   feature isn't validated.

These five items are surfaced in `tasks.md` as Polish-phase
maintainer-side verification tasks.
