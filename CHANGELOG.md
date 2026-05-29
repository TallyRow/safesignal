# Changelog

All notable changes to **SafeSignal** (`@tallyrow/safesignal`) are
documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1-rc.1] — 2026-05-28

### Release candidate — dogfoods the F005 release pipeline

**First npm artifact published for `@tallyrow/safesignal`.** v1.0.0
was an in-repo milestone (see note on the v1.0.0 entry below) but
never shipped to npm. v1.0.1-rc.1 is the first installable
version on the npm registry, published under the `next` dist-tag
via the new release pipeline introduced in Feature 005 (CI/CD
pipeline + release workflow). Once the RC has soaked, a `v1.0.1`
stable release will publish under `latest`.

### Operational hardening (Feature 005)

- `.gitlab-ci.yml` quality-gate pipeline runs on every MR + every
  default-branch push: typecheck × 2 Node versions (20, 22), full
  test suite × 2, build × 2, bundle-invariance audit (±1 KiB
  gzipped delta vs merge-base), dependency-pins regression
  (`tests/contract/dependency-pins.test.ts` + the two
  `bundle-shape.security.test.ts` files), DCO sign-off check.
- Release pipeline triggered by signed `v*.*.*` git tags:
  verifies tag signature + ancestor-of-`main`; runs full
  quality-gate set; validates CHANGELOG entry; publishes to npm
  with provenance via GitLab OIDC trusted-publisher (NO
  long-lived `NPM_TOKEN` in CI variables).
- Default branch renamed from `master` to `main`. Branch
  protections on `main`: require MR + at least 1 approval + CI
  green + resolved threads; no direct push; no force-push.
- `README.md` Project resources section gains a CI pipeline
  status badge.
- `CONTRIBUTING.md` gains a "Cutting a release" section
  documenting the manual-CHANGELOG-first workflow,
  `git tag -s vX.Y.Z` syntax, pipeline-stage descriptions, npm
  provenance verification, and rollback procedure.
- `GOVERNANCE.md` updated to reference Feature 005 (this work)
  where it previously referenced "Feature 006" (a numbering
  drift from earlier planning).

### Preserved

- No `src/**` or `tests/**` modifications. No `package.json`
  `dependencies` / `devDependencies` changes. No `exports` map
  shape changes. The full test suite (48 files / 1,088 passing /
  10 todo / 0 failing / 0 unhandled) passes unchanged. Bundle
  sizes (`dist/index.mjs` ≈ 8,162 B gz, `dist/transport-beacon.mjs`
  ≈ 3,101 B gz) hold within ±1 KiB of the v1.0.0 milestone.
- All 7 constitutional principles preserved verbatim;
  Principles IV (Secure by Default) and V (Testable, Minimal,
  Maintainable) are operationally strengthened at the
  supply-chain + CI-enforcement layers without amendment.

## [1.0.0] — 2026-05-28

> **Note**: v1.0.0 was an in-repo version-bump and rename milestone
> documenting the project's transition from `@your-org/frontend-logging-sdk`
> to **SafeSignal** (`@tallyrow/safesignal`). No npm artifact was
> published for this version — the publish pipeline shipped in
> Feature 005 (CI/CD). The first installable version on npm is
> **v1.0.1-rc.1** (release candidate, `next` dist-tag) followed
> by **v1.0.1** (stable, `latest` dist-tag). The v1.0.0 entry
> below documents the project state at the rename milestone for
> historical reference.

### Renamed to SafeSignal

This release renames the project from its working identity
(`@your-org/frontend-logging-sdk`) to **SafeSignal**, published on
npm as `@tallyrow/safesignal`. TallyRow is the publishing
organization (npm scope); SafeSignal is the product.

**Migration** (from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`): see the [migration note in
`README.md`](./README.md#renamed-from-frontend-logging-sdk) for the
install command and the import-statement find-and-replace pattern.
The subpath suffixes (`/testing`, `/transport-beacon`) are
unchanged; only the package-name segment moves.

### Preserved (no behavior change in this release)

No runtime behavior, public API symbol name, type name,
function signature, redaction default, sanitizer limit, URL-scrubber
behavior, level-filter default, or transport security contract
changes in this release. The `exports` map shape — `.`, `./testing`,
`./transport-beacon` — is preserved verbatim. The dependency pin
set is unchanged. The full test suite passes unchanged
(48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled). Bundle
sizes remain within ±1 KiB of the pre-rename gzipped baseline:
`dist/index.mjs` ≈ 8,162 B (gz), `dist/transport-beacon.mjs` ≈ 3,101 B (gz).

### Why a major bump

Consumer `import` statements change (the package-name segment on
the left of the slash moves from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`), which is a consumer call-site change under
the constitution's Principle I (Stable Consumer API & Clear
Boundaries). Per semver, that requires a major version bump even
though the public API surface and behavior are otherwise unchanged.

### Repository

The GitLab project slug is renamed to `safesignal` under the
`tallyrow/` namespace:
`https://gitlab.com/tallyrow/safesignal`. GitLab issues HTTP
redirects from the old slug for the lifetime of the project, so
external links to the previous URL continue to resolve.
