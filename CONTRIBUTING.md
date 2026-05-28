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
The constitution defines seven non-negotiable principles:

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
   contributors can understand.
6. **Log Integrity & Monitoring Suitability** — events are
   structured, attributable, and downstream-monitorable. Any
   drop/sample/batch/transform behavior is documented.
7. **Lightweight Logger Instances & Federated Runtime Discipline** —
   creating a `Logger` is constant-cost; expensive runtime resources
   are configured once and shared.

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
```

The example projects under `examples/host-app/` and
`examples/federated-module/` have their own `npm install` and
`npm run typecheck` (run from each subdirectory). They link to the
top-level package via `file:../..`.

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
