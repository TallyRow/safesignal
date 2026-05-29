# Quickstart: CI/CD Pipeline & Release Workflow (Post-Feature 005)

**Phase**: 1 (Design & Contracts)
**Feature**: [005-cicd-pipeline/spec.md](./spec.md)
**Plan**: [005-cicd-pipeline/plan.md](./plan.md)

Walkthrough for two audiences:
1. A **contributor** wanting to verify their MR will pass CI
   locally before pushing.
2. The **maintainer** wanting to cut a release.

Both flows are designed so that what runs locally matches what
runs in CI exactly — no surprise CI failures from environment
drift.

---

## Contributor walkthrough — pre-push local CI rehearsal

After cloning the repo and making changes on a feature branch,
run these checks locally to mirror what CI will do. All commands
run from the repo root.

### Step 1 — Install dependencies (matches CI `before_script`)

```bash
npm ci --prefer-offline --no-audit --no-fund
```

Use `npm ci` (not `npm install`) — it's what CI uses and it gates
on `package-lock.json` exactly. If your local `package.json` and
`package-lock.json` are out of sync, `npm ci` fails with a clear
error.

### Step 2 — Typecheck

```bash
npm run typecheck
```

Runs `tsc --noEmit` for both `src/` and `tests/`. Fails on any
TypeScript error. CI runs this on both Node `20.x` and Node `22.x`
in parallel; locally you only run on your installed Node.

### Step 3 — Test suite

```bash
npm test
```

Runs vitest. Should print `Test Files 48 passed | 1088 passing |
10 todo | 0 failing | 0 unhandled` (or whatever the current
baseline is). CI fails if any test fails or any unhandled error
occurs.

### Step 4 — Build

```bash
npm run build
```

Runs tsup. Produces `dist/index.{mjs,cjs}`, `dist/testing.{mjs,cjs}`,
`dist/transport-beacon.{mjs,cjs}` (plus matching `.d.ts` files).
Fails on any build error.

### Step 5 — Bundle invariance check

```bash
./scripts/ci/bundle-invariance-check.sh
```

Compares the gzipped sizes of `dist/index.mjs` and
`dist/transport-beacon.mjs` against the same files built from the
current `main` branch's HEAD. Fails if either delta exceeds ±1 KiB.

If your change is intentional (e.g., a small feature addition),
the bundle WILL grow. The ±1 KiB tolerance is for "non-intent"
regressions; if you're shipping a feature whose binary size
naturally exceeds 1 KiB, document it in the MR description and
the reviewer accepts the override.

### Step 6 — Dependency pins regression

```bash
npm test -- tests/contract/dependency-pins.test.ts \
            tests/security/bundle-shape.security.test.ts \
            tests/security/transport-beacon-bundle-shape.security.test.ts
```

Runs the three contract tests that lock the `exports` map shape,
dependency pin set, and bundle-shape invariants from Features
001–003. Fails if any assertion drifts.

### Step 7 — DCO sign-off (every commit)

Verify every commit on your branch has a `Signed-off-by:` footer.
If you've been using `git commit -s` consistently, this is
automatic. To verify:

```bash
git log main..HEAD --no-merges --format=%B | grep -c 'Signed-off-by:'
# Expected: the count should equal the number of commits in your range
git rev-list --no-merges --count main..HEAD
# Compare the two numbers
```

If you forgot sign-offs on previous commits:

```bash
# For just the latest commit:
git commit --amend --signoff

# For a range of commits:
git rebase --signoff -i main

# Then push the rewritten history:
git push --force-with-lease
```

CI runs the same DCO check via `scripts/ci/dco-check.sh` and
fails the MR if any commit lacks the footer.

### Step 8 — Push and open the MR

```bash
git push -u origin <your-branch-name>
```

Open an MR in the GitLab UI. The pipeline runs automatically. If
all stages pass, the merge button enables (assuming you also have
the required approval and resolved threads).

---

## Maintainer walkthrough — cutting a release

This is the full procedure for shipping a new version of
`@tallyrow/safesignal` to npm.

### Step 1 — Decide the version number (SemVer)

| Change type | SemVer level | Example |
|---|---|---|
| Breaking consumer call-site change (import string changes, exported symbol renamed/removed, behavior change consumers will notice) | **Major** | `v1.0.1` → `v2.0.0` |
| Additive feature (new exported symbol, new optional config, new transport subpath) | **Minor** | `v1.0.1` → `v1.1.0` |
| Bug fix, security patch, doc-only change, build-only change | **Patch** | `v1.0.1` → `v1.0.2` |
| Pre-release of any of the above | suffix `-rc.N` / `-beta.N` / `-alpha.N` | `v1.1.0-rc.1`, `v2.0.0-beta.2` |

Per the constitution's Principle I, breaking changes require an
explicit justification, migration plan, and `## Migration history`
entry in the README. Don't ship a major bump silently.

### Step 2 — Write the CHANGELOG entry

Open `CHANGELOG.md`. Add a new section at the TOP:

```markdown
## [1.0.2] — 2026-06-15

### Fixed

- Bug X (issue #N)
- ...

### Changed

- ...

### Preserved

- (For any constitution-relevant invariants — bundle size, test
  suite count, API surface — that this release deliberately
  preserves. F003 and F004 used this pattern.)
```

Follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
convention (added / changed / deprecated / removed / fixed /
security). The release pipeline's `changelog-validate` stage will
verify the heading `## [1.0.2]` exists when you tag `v1.0.2`.

Commit the CHANGELOG entry on a release branch:

```bash
git checkout -b release/v1.0.2
git add CHANGELOG.md
git commit -s -m "$(cat <<'EOF'
[Release] v1.0.2 — CHANGELOG entry

Document v1.0.2 release notes per the SemVer + Keep-a-Changelog
conventions.

Co-Authored-By: ...
EOF
)"
```

Open an MR to merge the release branch into `main`. Wait for CI
to pass and self-merge (this is one of the rare cases where a
solo-maintainer project merges their own MR).

### Step 3 — Create and push the signed tag

After the CHANGELOG entry is on `main`:

```bash
git checkout main
git pull --ff-only

# Verify your GPG/SSH signing key is configured:
git config user.signingkey
# Should print your key ID. If empty, configure first via
# git config --global user.signingkey <key-id>

# Create the signed tag:
git tag -s v1.0.2 -m "Release v1.0.2 — bug fix for X"

# Verify the signature locally:
git tag -v v1.0.2
# Should print "Good signature from ..."

# Push the tag to trigger the release pipeline:
git push origin v1.0.2
```

### Step 4 — Watch the release pipeline

Open GitLab → CI/CD → Pipelines. Filter by your tag (`v1.0.2`).
The release pipeline runs in order:

1. `verify-tag-signed` (~10 sec) — fails fast if the tag isn't signed or isn't on main
2. `typecheck` × 2 Node versions (~30 sec each, parallel)
3. `test` × 2 Node versions (~30 sec each, parallel)
4. `build` × 2 Node versions (~30 sec each, parallel)
5. `bundle-invariance` (~90 sec — includes dual build)
6. `dependency-pins` (~5 sec)
7. `changelog-validate` (~1 sec) — fails if no `## [1.0.2]` heading in CHANGELOG.md
8. `publish` (~60 sec) — runs `npm publish --provenance` via OIDC
9. `provenance-verify` (~45 sec — includes 30s sleep for npm propagation)

Total wall-clock: ~8-12 minutes.

If any stage fails, the publish does NOT execute. Investigate the
failure (typically: CHANGELOG missing entry, or OIDC binding
misconfigured, or the tagged commit isn't on main).

### Step 5 — Verify the publish

After the pipeline reports green:

```bash
# Verify the version exists on npm:
npm view @tallyrow/safesignal versions --json | tail -5
# Should include "1.0.2"

# Verify provenance attestation:
npm audit signatures --pkg=@tallyrow/safesignal@1.0.2
# Should print something like:
#   audited 1 package in 1s
#   1 package has a verified registry signature

# Or visit the package page:
# https://www.npmjs.com/package/@tallyrow/safesignal
# Scroll to "Provenance" — should show "Published from ... GitLab pipeline"
```

If `provenance-verify` soft-failed in CI but `npm audit signatures`
works locally, the publish is fine — the verify step just hit a
propagation delay.

### Step 6 — Tag-driven side effects

After a successful publish:

- The `latest` (or `next` for pre-releases) dist-tag on npm now
  points to the new version.
- `npm install @tallyrow/safesignal` (no version specified) starts
  installing the new version.
- The GitLab project's pipeline status badge in the README now
  shows the latest pipeline's status.
- The tag is permanent on GitLab — don't delete it (would break
  provenance attestation's source link).

### Rollback procedure (if publish goes wrong)

npm **does not allow republishing the same version**. If `v1.0.2`
publishes but contains a bug:

1. **Do NOT delete the tag.** Removing it from GitLab doesn't
   un-publish from npm and breaks provenance.
2. **Do NOT `npm unpublish`** unless within 72 hours AND the
   package has very few downloads (npm's policy is strict).
3. **Cut `v1.0.3` with the fix.** Write a CHANGELOG entry that
   notes the fix and references the v1.0.2 bug. Follow Steps 1–5
   above.

For a serious security issue where v1.0.2 must be discouraged:

- Add a deprecation warning: `npm deprecate @tallyrow/safesignal@1.0.2
  "v1.0.2 has a known issue X; upgrade to v1.0.3"`. This shows the
  message during `npm install` for that version.
- Update `SECURITY.md` with the disclosure.

---

## Acceptance

Both walkthroughs are part of the feature's "validation": a
contributor's pre-push rehearsal mirrors CI exactly, and the
maintainer's release procedure documented above is what
`CONTRIBUTING.md`'s "Cutting a release" section will codify.

A successful Phase 7 Polish task includes the maintainer
performing Step 3 above with a pre-release tag (`v1.0.2-rc.1`)
and confirming the pipeline runs end-to-end, the publish succeeds,
and `provenance-verify` confirms attestation. That's the real
proving-ground.
