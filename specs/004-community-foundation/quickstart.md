# Quickstart: Contributor Onboarding (Post-Feature 004)

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](./spec.md)
**Plan**: [004-community-foundation/plan.md](./plan.md)

Five-minute walkthrough for a new contributor to find their way
around the repo after feature 004 ships. This is the **first
contributor experience** validation script — the maintainer (or
reviewer) walks through it once before merge to confirm every
required surface is reachable from the README and that the path
from "I found this project" to "I'm ready to send an MR" is
unambiguous.

## Step 1 — Encounter SafeSignal

A new visitor opens the GitLab project page or the npm registry
page for `@tallyrow/safesignal`. They click into `README.md`.

**Verify**:

- The first heading reads `# SafeSignal`.
- The first paragraph (lines 3–6) names the project, describes
  what it does (browser-first structured logging facade and
  safety boundary for browser applications and federated frontend
  modules), and identifies it as secure-by-default and vendor-
  neutral.
- The "Why SafeSignal" (or "What you get") section appears
  within the first 12 lines.
- An `Install` section with `npm install @tallyrow/safesignal`
  appears within the first 24 lines.
- A `Quickstart` code block with the first usage example appears
  within the first 30 lines.
- **No migration content** appears within the first 30 lines.

## Step 2 — Find migration history if needed

Below the front matter, the visitor sees a single-sentence
pointer like:

> Previously known as `@your-org/frontend-logging-sdk`? See
> [Migration history](#migration-history) for the install +
> import upgrade path.

**Verify**:

- The pointer links to the `#migration-history` anchor.
- Clicking it scrolls to a `## Migration history` section that
  contains the verbatim feature-003 migration block — every
  legacy-to-SafeSignal mapping is intact.

## Step 3 — Discover project resources

Continuing to scroll, the visitor finds a `## Project resources`
section.

**Verify**: links to each of these files resolve from the README:

- `CONTRIBUTING.md` — how to file issues / send MRs / sign commits
- `SECURITY.md` — vulnerability disclosure policy
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- `GOVERNANCE.md` — how project decisions get made
- `LICENSE` — MIT license

## Step 4 — Read CONTRIBUTING.md end-to-end

The visitor opens `CONTRIBUTING.md`.

**Verify** (acceptance scenarios from spec US2):

- The document references `.specify/memory/constitution.md` and
  explains it as the binding technical standard.
- The Spec Kit workflow (specify → clarify → plan → tasks →
  analyze → implement) is described, with links to
  `specs/001-*/`, `specs/002-*/`, `specs/003-*/`, `specs/004-*/`
  as worked examples.
- Pointers to the GitLab issue templates (Bug, Feature) and the
  MR template (Default) are present.
- A "Code of Conduct" section links to `CODE_OF_CONDUCT.md` and
  states that contributors must abide.
- A **DCO** section: documents the Developer Certificate of
  Origin requirement, shows `git commit -s`, names the expected
  `Signed-off-by:` footer format, states that MRs without sign-off
  won't be merged, and explains how to retroactively sign-off
  (`git commit --amend --signoff` or `git rebase --signoff -i
  <base>`).
- A "Local development" section gives clone / install / build /
  test instructions at a high level (without duplicating README's
  quickstart).

## Step 5 — File a bug (simulated)

The visitor goes to the GitLab project's "New issue" page.

**Verify** (acceptance scenarios from spec US2):

- A template dropdown shows: `Bug`, `Feature`, `Security`.
- Selecting `Bug` pre-fills the issue body with sections for:
  steps to reproduce, expected behavior, actual behavior, package
  version, browser/runtime info, minimal reproduction.

## Step 6 — Propose a feature (simulated)

The visitor selects the `Feature` template.

**Verify**:

- The body has sections for: consumer use case, proposed change,
  constitution touchpoints (with reference to the constitution),
  existing API surface impact, alternatives considered.

## Step 7 — Report a security issue (simulated)

The visitor selects the `Security` template — but pauses when
they read the warning at the top.

**Verify**:

- A bold warning at the top says **"DO NOT file vulnerability
  details in this public issue."**
- The template redirects to `security@tallyrow.com` and
  references `SECURITY.md` for the full policy.
- **No** form fields collect vulnerability details.

The visitor closes the "New issue" page and instead navigates to
`SECURITY.md`.

**Verify** (acceptance scenarios from spec US3):

- A private contact (`security@tallyrow.com`) is named for
  vulnerability reports.
- An explicit response-time target is stated ("acknowledgement
  within 72 hours; initial assessment within 7 days").
- A coordinated-disclosure window is specified ("target 90 days
  from acknowledgement, extendable by mutual agreement").
- A supported-versions table lists `1.x`.
- An explicit "DO NOT file vulnerability details in a public
  GitLab issue" directive appears.

## Step 8 — Understand how decisions get made

The visitor opens `GOVERNANCE.md`.

**Verify** (acceptance scenarios from spec US4):

- The current maintainer (John Goure / GitLab handle `johng`,
  under TallyRow) is identified.
- The sole-maintainer status is acknowledged as a transitional
  default.
- Decision authority is documented for all four named domains:
  MR approval, constitution amendments, npm publish, security
  triage.
- The relationship to the constitution is explicit (constitution
  = binding technical standard; GOVERNANCE = how humans make and
  apply decisions).
- An "evolution path" section names thresholds (e.g., "2+
  regular contributors → CODEOWNERS; 5+ → steering group")
  hedged as suggestions.

## Step 9 — Open a sample MR (simulated)

The visitor clones the repo, makes a tiny change (e.g., fixes a
typo), commits with `git commit -s`, and pushes a branch to
GitLab. They open a new MR.

**Verify**:

- The MR description body is pre-filled with the `Default`
  template containing sections for: Summary, What changed,
  Verification, Test plan, Constitution touchpoints, DCO sign-off
  checklist.
- The DCO sign-off checklist item reminds the author to verify
  every commit carries a `Signed-off-by:` footer.

## Step 10 — Sanity-check the legal foundation

The visitor opens `LICENSE`.

**Verify**:

- The first line reads `MIT License`.
- The copyright line reads `Copyright (c) 2026 John Goure`.
- The OSI canonical text follows verbatim.

They run `npm view @tallyrow/safesignal license` (or inspect
`package.json` directly).

**Verify**:

- `license` field reads `"MIT"`.

## Acceptance

If every step above passes for a reviewer doing the walk-through
end-to-end, the feature's user-experience contract is satisfied.
The audit contracts (`file-presence-audit.md`,
`readme-front-matter.md`, `migration-note-preservation.md`,
`test-suite-invariance.md`) provide the mechanical verification
behind this human-level walkthrough.
