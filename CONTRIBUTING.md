# Contributing to SafeSignal

Thanks for considering a contribution. SafeSignal is a browser-first,
vendor-neutral structured logging facade and safety boundary for
browser applications and federated frontend modules. It is published
on npm as [`@tallyrow/safesignal`](https://www.npmjs.com/package/@tallyrow/safesignal)
under the MIT license.

This document covers how the project's development workflow runs, how
to file issues, how to open pull requests, and the contributor-side
expectations.

## Code of Conduct

By participating in this project you agree to abide by the
[Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). Treat other
contributors and users with respect. Report violations via the
private channel described in `CODE_OF_CONDUCT.md`.

## Where this project's rules live

The binding technical standard for **what** SafeSignal must do and
**how** its code must behave is the constitution at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).
The constitution defines eleven non-negotiable principles:

1. **Spec-Driven Development (NON-NEGOTIABLE)** — every feature
   flows through the Spec Kit lifecycle (specify → clarify → plan →
   tasks → implement); no production code before a spec and plan
   exist; each plan carries a Constitution Check.
2. **Stable Consumer API & Clear Boundaries** — public API stays
   small, stable, and isolated from internal details. Incompatible
   contract changes ship deprecated first, with a migration path,
   for at least one minor release before removal.
3. **Browser-First Runtime Resilience** — logging cannot break
   rendering, navigation, or state updates; failures degrade
   safely.
4. **Framework-Neutral Structured Observability** — vendor-neutral
   structured events with bounded depth and size; prefer conforming
   to open published standards over proprietary shapes.
5. **Secure & Privacy-Safe Logging by Default** — secrets,
   credentials, tokens, session identifiers, authorization headers,
   cookies, and known PII are stripped before any transport sees
   them. Fail-closed redaction.
6. **Testable, Minimal, Maintainable Package Design** — small public
   surface, deliberate dependencies, internals that future
   contributors can understand. Test code is held to the same
   typing, lint, build, and import-resolution standards as `src/`.
7. **Log Integrity & Monitoring Suitability** — events are
   structured, attributable, and downstream-monitorable. Any
   drop/sample/batch/transform behavior is documented.
8. **Lightweight Logger Instances & Federated Runtime Discipline** —
   creating a `Logger` is constant-cost; expensive runtime resources
   are configured once and shared.
9. **Reproducible Quality Verification** — every quality check
   produces the same pass/fail outcome locally and in CI for the
   same source state, through a single documented entrypoint.
10. **Mechanical Enforcement of Documented Contracts** — every
    documented quality gate has a machine-executable enforcement
    path (test, CI job, lint rule, or publish-time hook).
11. **Supply-Chain Integrity & Verifiable Provenance** — the
    installed artifact is verifiably what the project built:
    attested publish, signed tags, DCO attribution, pinned
    dependencies, and an honest distributed surface.

This document is the **human-facing process** layer; the constitution
is the **machine-evaluable standard** layer. The
[GOVERNANCE.md](./GOVERNANCE.md) file describes how decisions about
amending and applying the constitution get made.

## How features get scoped — the Spec Kit workflow

SafeSignal uses [Spec Kit](https://github.com/specifications/spec-kit)
for feature design. Every non-trivial change goes through six
phases, each producing a tracked artifact under `specs/<NNN>-<name>/`:

1. **`/speckit-specify`** — author a spec (`spec.md`) capturing user
   stories, functional requirements, success criteria, edge cases.
2. **`/speckit-clarify`** — surface ambiguities and pin them down in
   a Clarifications section.
3. **`/speckit-plan`** — write the implementation plan (`plan.md`),
   research findings (`research.md`), data model
   (`data-model.md`), verification contracts (`contracts/`), and
   post-feature quickstart.
4. **`/speckit-tasks`** — break the plan into checklist tasks
   (`tasks.md`) grouped by user story.
5. **`/speckit-analyze`** — cross-check spec ↔ plan ↔ tasks for
   inconsistencies before implementation.
6. **`/speckit-implement`** — execute the tasks; commit per task or
   per logical group.

Worked examples (from oldest to newest):

- [`specs/001-structured-logging-core/`](specs/001-structured-logging-core/) —
  the original SDK spec (public API, redactor, sanitizer, URL
  scrubber, transports, federated runtime).
- [`specs/002-beacon-transport/`](specs/002-beacon-transport/) —
  the first-party `./transport-beacon` subpath.
- [`specs/003-rename-safesignal/`](specs/003-rename-safesignal/) —
  v1.0.0 rename from the working name to SafeSignal.
- [`specs/004-community-foundation/`](specs/004-community-foundation/) —
  this feature (legal + community + governance).

Small fixes (typo, broken link, doc-only clarification) can skip
the full Spec Kit workflow and ship as a direct PR. Any change that
touches `src/`, public API surface, redaction defaults, sanitizer
limits, URL scrubber behavior, transport contracts, or the
federated-runtime model SHOULD go through Spec Kit. When in doubt,
open a Feature issue first to discuss scope before investing in
implementation.

## Filing a bug

Open a new issue on GitHub and choose the **Bug report** template. It
asks for:

- Steps to reproduce
- Expected behavior
- Actual behavior + any error messages
- Package version (`npm view @tallyrow/safesignal version` or your
  local `package.json`)
- Browser / runtime (browser + OS + Node version if relevant)
- Minimal reproduction (runnable snippet or repo link, if possible)

The smaller the reproduction, the faster a fix lands.

## Proposing a feature

Open a new issue on GitHub and choose the **Feature request** template.
It asks you to describe:

- The consumer use case (what are you trying to do that the current
  SDK can't?)
- The proposed change (rough sketch, API shape if applicable)
- Which constitutional principle(s) the feature touches
- Whether any existing exported symbol, type, or behavior would change
- Alternatives considered

For non-trivial features, expect the discussion to converge on a
Spec Kit feature spec (`/speckit-specify` → … → `/speckit-implement`).

## Reporting a security issue

**DO NOT file vulnerability details in a public GitHub issue.**
Report privately via the repository's **Security → Report a
vulnerability** (GitHub Private Vulnerability Reporting), or email
`security@tallyrow.com`. The full disclosure policy, response-time
targets, and embargo window live in [`SECURITY.md`](./SECURITY.md).

If you have a NON-sensitive question about the security policy
itself (e.g., "is this still current?"), the public **Security policy
question** issue template is fine — but no vulnerability details there.

## Opening a pull request

Push your branch to GitHub and open a new pull request against `main`.
The repository's `PULL_REQUEST_TEMPLATE.md` pre-fills the body with the
structure the project expects:

- **Summary** — what changed in one paragraph
- **What changed** — bulleted list of changes
- **Verification** — how you verified the change works (tests
  passed, manual check, etc.)
- **Test plan** — checklist for the reviewer to verify
- **Constitution touchpoints** — which principle(s) the change
  touches; link to the constitution
- **DCO sign-off checklist** — confirmation that every commit
  carries a `Signed-off-by:` footer (see the DCO section below)

Optional sections (Spec Kit linkage, migration notes) follow.

`main` is protected by a branch ruleset: every change lands through a
pull request, the **`ci-success`** check must pass, and force-pushes and
deletions are blocked. As a solo-maintainer project it requires **0
approvals** (a GitHub PR author cannot approve their own PR); a
`CODEOWNERS`-based review requirement is added when a second maintainer
joins. See [GOVERNANCE.md](./GOVERNANCE.md).

### Use `gh` so your description lands intact

Open the PR with the [GitHub CLI](https://cli.github.com/)
(`gh auth login` once per machine). Write your filled-in template to a
file, then pass it via `--body-file` so multi-line content is preserved:

```bash
gh pr create \
  --base main \
  --head "$(git branch --show-current)" \
  --title "Short, imperative summary" \
  --body-file pr-body.md
```

You can also open the PR from the web UI — the template pre-fills
automatically. Delete the branch after merge (GitHub's one-click button,
or `gh pr merge --delete-branch`).

## Developer Certificate of Origin (DCO)

SafeSignal requires every commit to be **signed off** under the
[Developer Certificate of Origin version 1.1](https://developercertificate.org/).
The DCO is a short attestation that you have the right to submit
the work under the project's license. The full text:

> Developer Certificate of Origin
> Version 1.1
>
> Copyright (C) 2004, 2006 The Linux Foundation and its contributors.
>
> Everyone is permitted to copy and distribute verbatim copies of
> this license document, but changing it is not allowed.
>
>
> Developer's Certificate of Origin 1.1
>
> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I
>     have the right to submit it under the open source license
>     indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the
>     best of my knowledge, is covered under an appropriate open
>     source license and I have the right under that license to
>     submit that work with modifications, whether created in whole
>     or in part by me, under the same open source license (unless
>     I am permitted to submit under a different license), as
>     indicated in the file; or
>
> (c) The contribution was provided directly to me by some other
>     person who certified (a), (b) or (c) and I have not modified
>     it.
>
> (d) I understand and agree that this project and the contribution
>     are public and that a record of the contribution (including
>     all personal information I submit with it, including my
>     sign-off) is maintained indefinitely and may be redistributed
>     consistent with this project or the open source license(s)
>     involved.

You attest by signing every commit with `git commit -s`. The
`-s` (or `--signoff`) flag appends a footer to your commit message:

```text
Signed-off-by: Your Full Name <your.email@example.com>
```

The name and email must match your `git config user.name` and
`git config user.email` values. PRs whose commits lack the
`Signed-off-by:` footer will not be merged (CI checks this).

If you forgot to sign-off earlier commits, fix them retroactively:

- **Latest commit only**: `git commit --amend --signoff`
- **A range of commits**: `git rebase --signoff -i <base>` (use the
  merge-base or the last signed commit as `<base>`)
- After amending or rebasing, force-push your branch:
  `git push --force-with-lease`

## Local development setup

```bash
git clone https://github.com/TallyRow/safesignal.git
cd safesignal
npm install
npm test          # vitest run; expect 48 files / 1088 passing / 10 todo / 0 failing
npm run build     # tsup; outputs dist/index.{mjs,cjs}, dist/testing.{mjs,cjs}, dist/transport-beacon.{mjs,cjs}
npm run typecheck # tsc --noEmit on src/ + tests/
npm run lint          # Biome lint — must be clean
npm run format:check  # Biome format check — must be clean (npm run format to fix)
npm run test:coverage # vitest --coverage; enforces the per-package thresholds
```

### Quality checks (lint, format, coverage)

The project uses **Biome** for linting and formatting. CI gates every pull
request on `npm run lint`, `npm run format:check`, and `npm run test:coverage`,
plus a gating **secret scan** (gitleaks). Run `npm run format` to auto-fix
formatting before committing.

**Coverage thresholds** are defined in `vitest.config.ts` (90% global; 100% on
the four pipeline-security files: sanitizer, redactor, url-scrubber,
control-char-guard) and enforced by the `coverage` CI job. They ratchet **up**
freely. **Lowering** a threshold requires a PR that states the reason in the
description and links the follow-up that will restore it — a relaxation is a
reviewed, time-bound exception, never a silent edit (constitution Principle X).

### Local quality hooks (auto-enabled)

The local git hooks are **wired automatically by `npm install`** (the `prepare`
script points `core.hooksPath` at `scripts/hooks/`), so a normal setup turns them
on with no manual step. To enable them by hand, or to verify the wiring:

```bash
git config core.hooksPath scripts/hooks   # manual fallback
git config core.hooksPath                  # should print: scripts/hooks
```

- `pre-commit` runs Biome (lint + format-check) on your **staged** files and
  **blocks** the commit on any issue (it never auto-formats — run `npm run format`
  and re-stage).
- `prepare-commit-msg` **auto-adds** the DCO `Signed-off-by:` trailer when it is
  missing, so a normal `git commit` (no `-s`) is signed for you.
- `commit-msg` still **blocks** any commit that ends up without a `Signed-off-by:`
  trailer (a backstop for commit paths that skip `prepare-commit-msg`).
- `pre-push` runs the full local gate — `npm run verify` (build, typecheck, lint,
  format:check, test, api:check) — and **blocks the push** on failure.

`npm run verify` is the one-command local gate; run it anytime to reproduce the
high-frequency CI verdict. (CI additionally runs a container secret-scan and
full coverage — those stay CI-side.) **Emergency bypass:**
`git commit --no-verify` / `git push --no-verify` — these are guardrails, not
locks. **CI remains the authoritative gate**, so an un-hooked clone still cannot
bypass these checks.

The example projects under `examples/host-app/` and
`examples/federated-module/` have their own `npm install` and
`npm run typecheck` (run from each subdirectory). They link to the
top-level package via `file:../..`.

**If you cloned from GitLab** (before the move to GitHub), repoint your
`origin` remote:

```bash
git remote set-url origin https://github.com/TallyRow/safesignal.git
git fetch origin
git branch -u origin/main main
git remote set-head origin -a
```

If you also cloned before the `master`→`main` default-branch rename,
add `git branch -m master main` before the `git branch -u` line.

## Changing the public API (deprecate-before-remove)

The public API surface — every value and type exported from the
`exports` entry points (`.`, `./testing`, `./transport-beacon`,
`./transport-otlp`) — is a contract. Per the constitution's
**Principle II**, an incompatible change to a published symbol must
ship **deprecated first**: keep the old symbol working with an
`@deprecated` JSDoc tag, a working replacement, and a documented
migration path, for at least one minor release, before removing it.

**This is mechanically enforced** (Principle X). The `api-surface` CI
job — part of the required `ci-success` gate — runs `npm run api:check`
([`scripts/api/check-surface.mjs`](scripts/api/check-surface.mjs)),
which compares the built surface against the committed baseline
([`api/surface.json`](api/surface.json)) and **fails closed** on an
undeprecated removal or incompatible change. The rule, inputs, and exit
codes are specified in
[`specs/011-deprecate-before-remove/contracts/api-surface-check.md`](specs/011-deprecate-before-remove/contracts/api-surface-check.md).
Run it locally before pushing — the verdict matches CI:

```bash
npm run build && npm run api:check
```

### Deprecating a symbol

1. Add an `@deprecated` JSDoc tag to the symbol in `src/`, naming the
   replacement and the migration path. Keep the symbol working.
2. Note the deprecation in `CHANGELOG.md`.
3. Ship it. At release, `npm run api:extract` records the symbol as
   `deprecated: true` in the baseline.
4. In a **later** minor (or major) release, remove the symbol — the gate
   now passes the removal because the baseline shows it was deprecated.

### Backward-compatible changes

A pure addition (new export) passes the gate automatically. A
backward-compatible **signature change** (e.g., a new optional
parameter) is held by the gate until a reviewer acknowledges it: add an
entry to [`api/surface-allow.json`](api/surface-allow.json) recording
the exact `from`/`to` signature, a `reason`, and `reviewedBy`. The entry
is cleared when the baseline is refreshed at the next release. A
compatible change is **never** forced through a deprecation cycle.

### Removing or disabling the gate

The `api-surface` gate is itself a documented, enforced invariant.
Disabling or removing it — or dropping it from `ci-success` — is a
**relaxation of a documented contract** and goes through the
constitution amendment process (Principle X), the same as relaxing the
underlying Principle II rule. It is not a routine change.

## Distributed-surface parity (what ships matches the docs)

The package's **distributed surface** — the `exports` subpaths, the
packaged `files`, and the bundle contents — is a contract. Per the
constitution's **Principle XI**, what ships MUST match what is
documented and contracted: nothing undocumented may ride along, no
`exports` entry may point at a file that isn't shipped, and the public
subpaths must be exactly the documented set.

**This is mechanically enforced** (Principle X). The
[`distributed-surface` contract test](tests/contract/distributed-surface.contract.test.ts)
runs `npm pack --dry-run --json` and **fails closed** on any drift:

- an `exports`/`main`/`module`/`types` target that isn't in the packed
  file set (a missing/unshipped target),
- a packaged file outside the documented surface — anything beyond
  `dist/**` plus npm's mandatory `package.json`/`README`/`LICENSE` (a
  stray inclusion),
- an `exports` key set that doesn't equal the four documented public
  subpaths (`.`, `./testing`, `./transport-beacon`, `./transport-otlp`).

The documented surface is specified in
[`specs/012-distributed-surface-parity/contracts/distributed-surface.md`](specs/012-distributed-surface-parity/contracts/distributed-surface.md).
The gate runs in the `dependency-pins` job (part of the required
`ci-success` aggregate **and** the release pipeline). Run it locally —
the verdict matches CI:

```bash
npm run build && npm run surface:check
```

When you intentionally change the public surface (a new subpath, a
changed `files`), update both `package.json` **and** the surface
contract doc; the gate fails until they agree.

### Removing or disabling the gate

Like the `api-surface` gate, the distributed-surface parity test is a
documented, enforced invariant. Disabling or removing it — or dropping
it from the `dependency-pins` job / `ci-success` — is a **relaxation of
a documented contract** and goes through the constitution amendment
process (Principle X), the same as relaxing the underlying Principle XI
rule. It is not a routine change.

## Cutting a release

Only maintainers cut releases. The release workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml))
publishes `@tallyrow/safesignal` to npm **with provenance** via npm's
GitHub Actions **Trusted Publisher (OIDC)** — no long-lived `NPM_TOKEN`
involved.

### 1. Decide the version number (SemVer)

| Change type | SemVer level | Example |
|---|---|---|
| Breaking consumer call-site change (import string change, exported symbol renamed or removed, behavior change consumers will notice) | **Major** | `v1.0.1` → `v2.0.0` |
| Additive feature (new exported symbol, new optional config, new transport subpath) | **Minor** | `v1.0.1` → `v1.1.0` |
| Bug fix, security patch, doc-only or build-only change | **Patch** | `v1.0.1` → `v1.0.2` |
| Pre-release of any of the above | suffix `-rc.N` / `-beta.N` / `-alpha.N` | `v1.1.0-rc.1`, `v2.0.0-beta.2` |

Per the constitution's Principle II, breaking changes require an
explicit justification, migration plan, and a `## Migration
history` entry in `README.md`. Don't ship a major bump silently.

### 2. Write the CHANGELOG entry FIRST

Open [`CHANGELOG.md`](CHANGELOG.md) and add a new section at the
top, above the previous release:

```markdown
## [1.0.2] — 2026-MM-DD

### Fixed

- Bug X (issue #N)

### Changed

- ...

### Preserved

- (Optional: constitution-relevant invariants — bundle size,
  test count, API surface — that this release deliberately
  preserves. See F003/F004 entries for the pattern.)
```

Follow the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
convention. The release pipeline's `changelog-validate` stage
will **fail the publish** if the tagged version has no matching
`## [vX.Y.Z]` (or `## [X.Y.Z]`) heading in `CHANGELOG.md`. This
is intentional — it prevents shipping a release with no
documented notes.

Commit the CHANGELOG entry on a release branch (e.g.,
`release/v1.0.2`), open a pull request, wait for `ci-success` green,
and merge into `main`.

### 2b. Refresh the public API surface baseline

On the same release branch, refresh the committed public-API baseline
so this version becomes the next deprecate-before-remove reference:

```bash
npm run build
npm run api:extract          # regenerates api/surface.json from the build
printf '[]\n' > api/surface-allow.json   # clear any compatible-change overrides
git add api/surface.json api/surface-allow.json
```

The release pipeline's `api-surface-freshness` stage **fails the
publish** if `api/surface.json` does not match the tagged build's
surface — the same "must be refreshed" discipline as the CHANGELOG.
Commit the refreshed baseline alongside the CHANGELOG entry.

### 3. Create and push the signed tag

After the CHANGELOG entry is on `main`:

```bash
git checkout main
git pull --ff-only

# SSH tag signing must be configured: `git config gpg.format` is `ssh`,
# `git config user.signingkey` points at your key, your PUBLIC key is in
# .github/allowed_signers, and your tagger email matches its principal.
git config gpg.format
git config user.signingkey

# Create the SIGNED, annotated tag:
git tag -s v1.0.2 -m "Release v1.0.2 — bug fix for X"

# Verify the signature locally before pushing:
git tag -v v1.0.2
# Expect: Good "git" signature for <email> ...

# Push the tag to trigger the release workflow:
git push origin v1.0.2
```

The tag **MUST** be a signed *annotated* tag (`git tag -s`) on a `main`
commit that contains `.github/workflows/release.yml`. A lightweight tag
fails `verify-tag-signed` with *"cannot verify a non-tag object of type
commit."*

### 4. Watch the release workflow

GitHub → **Actions** → the **Release** run for your tag. Stages:

1. **verify-tag-signed** — fail-fast: the SSH tag signature is verified
   against `.github/allowed_signers`, and the tagged commit must be on
   `main`.
2. **build / typecheck / test** — Node 20 + 22 matrix.
3. **dependency-pins**, **changelog-validate**.
4. **publish** — `npm publish --provenance` via the npm GitHub Actions
   Trusted Publisher (OIDC, no token).
5. **provenance-verify** — confirms the version + attestation on npm.

If any required stage fails, `publish` does NOT execute. Common failure
modes (each was hit during the v1.3.0 cutover):
- **Lightweight tag** → `verify-tag-signed` rejects it
  (*"cannot verify a non-tag object of type commit"*); re-cut with
  `git tag -s`.
- **`repository.url` mismatch** → npm rejects the publish with **E422**
  if `package.json` `repository.url` doesn't match the GitHub repo named
  in the signed provenance.
- **CHANGELOG missing entry** → add `## [X.Y.Z]`, merge, delete +
  re-create the tag.
- **OIDC publish rejected** → the npm **Trusted Publisher** binding
  (Organization `TallyRow`, Repository `safesignal`, Workflow
  `release.yml`, Environment blank) doesn't match; fix it on the npm
  package's Settings → Trusted Publisher page.

### 5. Verify the publish

After the pipeline reports green:

```bash
# Confirm the version exists on npm:
npm view @tallyrow/safesignal versions --json | tail -5

# Verify provenance attestation:
npm audit signatures --pkg=@tallyrow/safesignal@1.0.2
# Expect: "1 package has a verified registry signature"
```

Or visit `https://www.npmjs.com/package/@tallyrow/safesignal` and
look for the new version in the Versions list, with a Provenance
attestation linking back to the GitHub Actions run.

### 6. Prune the `next` dist-tag when an `-rc` line ships stable

The publish job derives the dist-tag from the version string
(`-rc.N`/`-beta.N`/`-alpha.N` → `next`, otherwise → `latest`) and
only ever **adds** tags — it never retires `next`. So when a
pre-release line graduates to a stable release, `next` is left
orphaned pointing at the old `-rc` (older than `latest`). After
shipping the stable version, retire (or advance) `next` manually —
this needs npm auth, not the OIDC pipeline:

```bash
npm dist-tag ls @tallyrow/safesignal        # check what next points at
npm dist-tag rm @tallyrow/safesignal next   # no active pre-release → remove it
# …or, if a newer pre-release is live, move next onto it:
# npm dist-tag add @tallyrow/safesignal@<next-rc> next
```

Never park `next` on a stable version, and never let it lag
`latest`.

### Rollback (if the publish goes wrong)

npm **does not allow republishing the same version**. If `v1.0.2`
publishes but contains a bug:

1. **Do NOT delete the tag** — that breaks provenance attestation's
   source link.
2. **Do NOT `npm unpublish`** unless within 72 hours AND the
   package has very few downloads.
3. **Cut `v1.0.3` with the fix** — write a CHANGELOG entry that
   notes the fix and references the v1.0.2 bug; follow Steps 1-5
   again.

For a security issue where v1.0.2 must be discouraged:

```bash
npm deprecate @tallyrow/safesignal@1.0.2 "v1.0.2 has known issue X; upgrade to v1.0.3"
```

This adds a deprecation warning shown during `npm install` for
that version. Also update `SECURITY.md` with the disclosure
details.

## Where to ask questions

- Bug or behavior question: GitHub issue with the **Bug report** template.
- Feature idea: GitHub issue with the **Feature request** template.
- Security question (non-sensitive): GitHub issue with the
  **Security policy question** template. (Vulnerability details: use
  **Security → Report a vulnerability** or email `security@tallyrow.com`.)
- Anything else: open a Feature issue and we'll figure out where it
  belongs.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](./LICENSE) that covers the project.
