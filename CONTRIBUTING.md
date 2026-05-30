# Contributing to SafeSignal

Thanks for considering a contribution. SafeSignal is a browser-first,
vendor-neutral structured logging facade and safety boundary for
browser applications and federated frontend modules. It is published
on npm as [`@tallyrow/safesignal`](https://www.npmjs.com/package/@tallyrow/safesignal)
under the MIT license.

This document covers how the project's development workflow runs, how
to file issues, how to open merge requests, and the contributor-side
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
The constitution defines nine non-negotiable principles:

1. **Stable Consumer API & Clear Boundaries** — public API stays
   small, stable, and isolated from internal details.
2. **Browser-First Runtime Resilience** — logging cannot break
   rendering, navigation, or state updates; failures degrade
   safely.
3. **Framework-Neutral Structured Observability** — vendor-neutral
   structured events with bounded depth and size.
4. **Secure & Privacy-Safe Logging by Default** — secrets,
   credentials, tokens, session identifiers, authorization headers,
   cookies, and known PII are stripped before any transport sees
   them. Fail-closed redaction.
5. **Testable, Minimal, Maintainable Package Design** — small public
   surface, deliberate dependencies, internals that future
   contributors can understand. Test code is held to the same
   typing, lint, build, and import-resolution standards as `src/`.
6. **Log Integrity & Monitoring Suitability** — events are
   structured, attributable, and downstream-monitorable. Any
   drop/sample/batch/transform behavior is documented.
7. **Lightweight Logger Instances & Federated Runtime Discipline** —
   creating a `Logger` is constant-cost; expensive runtime resources
   are configured once and shared.
8. **Reproducible Quality Verification** — every quality check
   produces the same pass/fail outcome locally and in CI for the
   same source state, through a single documented entrypoint.
9. **Mechanical Enforcement of Documented Contracts** — every
   documented quality gate has a machine-executable enforcement
   path (test, CI job, lint rule, or publish-time hook).

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
the full Spec Kit workflow and ship as a direct MR. Any change that
touches `src/`, public API surface, redaction defaults, sanitizer
limits, URL scrubber behavior, transport contracts, or the
federated-runtime model SHOULD go through Spec Kit. When in doubt,
open a Feature issue first to discuss scope before investing in
implementation.

## Filing a bug

Open a new issue on GitLab and select the **Bug** template. The
template asks for:

- Steps to reproduce
- Expected behavior
- Actual behavior + any error messages
- Package version (`npm view @tallyrow/safesignal version` or your
  local `package.json`)
- Browser / runtime (browser + OS + Node version if relevant)
- Minimal reproduction (runnable snippet or repo link, if possible)

The smaller the reproduction, the faster a fix lands.

## Proposing a feature

Open a new issue and select the **Feature** template. The template
asks you to describe:

- The consumer use case (what are you trying to do that the current
  SDK can't?)
- The proposed change (rough sketch, API shape if applicable)
- Which constitutional principle(s) the feature touches
- Whether any existing exported symbol, type, or behavior would change
- Alternatives considered

For non-trivial features, expect the discussion to converge on a
Spec Kit feature spec (`/speckit-specify` → … → `/speckit-implement`).

## Reporting a security issue

**DO NOT file vulnerability details in a public GitLab issue.**
Email `security@tallyrow.com` instead. The full disclosure policy,
response-time targets, and embargo window live in
[`SECURITY.md`](./SECURITY.md).

If you have a NON-sensitive question about the security policy
itself (e.g., "is this still current?"), the public **Security**
issue template is fine — but no vulnerability details there.

## Opening a merge request

Push your branch to GitLab and open a new merge request. The
**Default** MR template pre-fills the body with the structure the
project expects:

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

### Use `glab` so your description lands intact

Open the MR with the [GitLab CLI](https://gitlab.com/gitlab-org/cli)
(`glab auth login` once per machine). Write your filled-in template to a
file, then pass it via `--description` so multi-line content is
preserved:

```bash
glab mr create \
  --source-branch "$(git branch --show-current)" \
  --target-branch main \
  --title "Short, imperative summary" \
  --description "$(cat mr-body.md)" \
  --remove-source-branch
```

Do **not** open MRs via `git push -o merge_request.description=...`:
GitLab push options reject newlines, so multi-line descriptions are
silently dropped. The `glab` flow above is the supported path.

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
`git config user.email` values. MRs whose commits lack the
`Signed-off-by:` footer will not be merged.

If you forgot to sign-off earlier commits, fix them retroactively:

- **Latest commit only**: `git commit --amend --signoff`
- **A range of commits**: `git rebase --signoff -i <base>` (use the
  merge-base or the last signed commit as `<base>`)
- After amending or rebasing, force-push your branch:
  `git push --force-with-lease`

## Local development setup

```bash
git clone git@gitlab.com:tallyrow/safesignal.git
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

The project uses **Biome** for linting and formatting. CI gates every merge
request on `npm run lint`, `npm run format:check`, and `npm run test:coverage`,
plus a gating **secret scan** (gitleaks). Run `npm run format` to auto-fix
formatting before committing.

**Coverage thresholds** are defined in `vitest.config.ts` (90% global; 100% on
the four pipeline-security files: sanitizer, redactor, url-scrubber,
control-char-guard) and enforced by the `coverage` CI job. They ratchet **up**
freely. **Lowering** a threshold requires an MR that states the reason in the
description and links the follow-up that will restore it — a relaxation is a
reviewed, time-bound exception, never a silent edit (constitution Principle IX).

### Local commit hooks (recommended)

Opt in once per clone to run the same lint/format + DCO checks at commit time:

```bash
git config core.hooksPath scripts/hooks
```

- `pre-commit` runs Biome lint + format-check on your **staged** files and
  **blocks** the commit on any issue (it never auto-formats or re-stages —
  run `npm run format` and re-stage yourself).
- `commit-msg` blocks commits missing a `Signed-off-by:` trailer (use
  `git commit -s`).

Hooks are a faster local mirror; **CI remains the authoritative gate**, so an
un-hooked clone still cannot bypass these checks.

The example projects under `examples/host-app/` and
`examples/federated-module/` have their own `npm install` and
`npm run typecheck` (run from each subdirectory). They link to the
top-level package via `file:../..`.

If you cloned before the `master`→`main` default-branch rename
(Feature 005), update your local clone with:

```bash
git fetch origin
git branch -m master main
git branch -u origin/main main
git remote set-head origin -a
```

## Cutting a release

Only maintainers cut releases. The release pipeline (Feature 005)
publishes `@tallyrow/safesignal` to npm with provenance via GitLab
OIDC trusted-publisher — no long-lived `NPM_TOKEN` involved.

### 1. Decide the version number (SemVer)

| Change type | SemVer level | Example |
|---|---|---|
| Breaking consumer call-site change (import string change, exported symbol renamed or removed, behavior change consumers will notice) | **Major** | `v1.0.1` → `v2.0.0` |
| Additive feature (new exported symbol, new optional config, new transport subpath) | **Minor** | `v1.0.1` → `v1.1.0` |
| Bug fix, security patch, doc-only or build-only change | **Patch** | `v1.0.1` → `v1.0.2` |
| Pre-release of any of the above | suffix `-rc.N` / `-beta.N` / `-alpha.N` | `v1.1.0-rc.1`, `v2.0.0-beta.2` |

Per the constitution's Principle I, breaking changes require an
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
`release/v1.0.2`), open a merge request, wait for CI green, and
self-merge into `main`.

### 3. Create and push the signed tag

After the CHANGELOG entry is on `main`:

```bash
git checkout main
git pull --ff-only

# Verify your GPG/SSH signing key is configured:
git config user.signingkey
# If empty: git config --global user.signingkey <your-key-id>

# Create the signed annotated tag:
git tag -s v1.0.2 -m "Release v1.0.2 — bug fix for X"

# Verify the signature locally before pushing:
git tag -v v1.0.2
# Expect: "Good signature from ..."

# Push the tag to trigger the release pipeline:
git push origin v1.0.2
```

### 4. Watch the release pipeline

Open GitLab → CI/CD → Pipelines and filter by your tag. The
release pipeline runs:

1. **verify-tag-signed** (~10 sec) — fail-fast: rejects if the
   tag isn't signed or doesn't point at a commit on `main`.
2. **typecheck × 2 Node versions** (~30 sec each, parallel).
3. **test × 2 Node versions** (~30 sec each, parallel).
4. **build × 2 Node versions** (~30 sec each, parallel).
5. **bundle-invariance** (~90 sec — includes building the
   merge-base for comparison).
6. **dependency-pins** (~5 sec).
7. **changelog-validate** (~1 sec) — fails if no `## [X.Y.Z]`
   entry exists for the tagged version.
8. **publish** (~30-60 sec) — runs `npm publish --provenance`
   via GitLab OIDC trusted-publisher.
9. **provenance-verify** (~45 sec — includes a 30-second sleep
   for npm registry propagation).

Total wall-clock: ~8-12 minutes on shared runners.

If any stage fails, the publish does NOT execute. Common failure
modes:
- **CHANGELOG missing entry** → add the entry, merge, delete +
  re-create the tag.
- **OIDC publish rejected** → npm Trusted Publishers binding
  misconfigured; check the npm package's "Trusted Publishers"
  page and confirm the subject-claim pattern matches GitLab's
  `sub` claim.
- **Tag not signed** → `git tag -s` was forgotten; delete + re-tag
  with `-s`.

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
attestation linking back to the GitLab pipeline run.

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

- Bug or behavior question: GitLab issue with the **Bug** template.
- Feature idea: GitLab issue with the **Feature** template.
- Security question (non-sensitive): GitLab issue with the
  **Security** template. (Vulnerability details: email
  `security@tallyrow.com`.)
- Anything else: open a Feature issue and we'll figure out where it
  belongs.

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](./LICENSE) that covers the project.
