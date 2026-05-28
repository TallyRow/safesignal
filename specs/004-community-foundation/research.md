# Research: Repo Legal & Community Foundation

**Phase**: 0 (Outline & Research)
**Feature**: [004-community-foundation/spec.md](./spec.md)
**Plan**: [004-community-foundation/plan.md](./plan.md)
**Date**: 2026-05-28

## MIT License canonical text

**Decision**: Use the standard OSI-approved MIT license template
verbatim, with year `2026` and copyright holder `John Goure`.

**Rationale**: FR-001 and FR-003 require the verbatim OSI text. The
verbatim form is the only legally-defensible MIT license; any
modification (Commons Clause, "MIT-with-attribution-clause", etc.)
makes the file non-MIT and constitutes a different license. The
Clarifications session locked the copyright holder as `John Goure`
(individual legal name) rather than `TallyRow` (which is a brand
and npm scope but not a registered legal entity).

**Canonical template** (the text that will ship in `LICENSE`):

```text
MIT License

Copyright (c) 2026 John Goure

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Alternatives considered**:

- *Apache 2.0*: more contributor-protective (explicit patent
  grant) but more verbose and less common in the JS/TS ecosystem.
  MIT chosen for ecosystem alignment.
- *BSD 3-Clause*: equivalent permissive license but adds an
  attribution clause. MIT chosen for simplicity.
- *Dual-license MIT + Apache 2.0*: increasingly common (Rust
  ecosystem standard) but adds operational overhead for npm
  consumers who must reason about both. MIT alone chosen for v1.

**Source**: `https://opensource.org/license/mit/` (OSI canonical).

## Contributor Covenant 2.1 canonical text

**Decision**: Use the Contributor Covenant version 2.1 verbatim
markdown, with enforcement contact `conduct@tallyrow.com`.

**Rationale**: FR-016 mandates verbatim Contributor Covenant 2.1
adoption. The Clarifications session locked the enforcement
contact as `conduct@tallyrow.com` (distinct alias from
`security@tallyrow.com`, both routing to the same maintainer-
owned inbox on `tallyrow.com`).

**Source**: `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`
(canonical text + markdown). The shipped `CODE_OF_CONDUCT.md`
file will:
- Copy the canonical markdown verbatim.
- Fill the `[INSERT CONTACT METHOD]` placeholder with
  `conduct@tallyrow.com`.
- Include the version-identifier footer (Covenant 2.1 includes
  this in its template).

**Alternatives considered**:

- *Contributor Covenant 2.0*: older version, lacks the
  "Enforcement Guidelines" section that 2.1 standardized.
  Superseded.
- *Mozilla Community Participation Guidelines*: alternative
  community-standard CoC; longer, more prescriptive. Not chosen
  because Covenant has wider industry adoption and the spec
  explicitly named Covenant 2.1.
- *No formal CoC*: rejected per FR-016 (community-standard CoC
  required for a public OSS project).

## DCO (Developer Certificate of Origin) 1.1 text

**Decision**: Use DCO version 1.1 verbatim, with sign-off enforced
via `git commit -s` (which appends a standard `Signed-off-by:
Name <email>` footer to commit messages).

**Rationale**: The Clarifications session chose DCO over CLA for
contributor attestation. DCO is the Linux Foundation / Linux
kernel / Docker pattern: a short statement (about 200 words) that
contributors attest to by appending a `Signed-off-by:` line to
each commit. No separate document to sign, no contributor-tracking
infrastructure required, mechanically verifiable.

**Canonical text**: The DCO 1.1 text from
`https://developercertificate.org/`. The full text is small
enough to reproduce inline in `CONTRIBUTING.md` (under 30 lines).
The shipped `CONTRIBUTING.md` will:

- Include the DCO text verbatim, OR link to
  `https://developercertificate.org/` and require contributors to
  read it (per spec FR-009a, EITHER reproduce-or-link is
  acceptable; recommend inline reproduction for offline-readable
  CONTRIBUTING).
- Show the `git commit -s` command and the expected footer format
  (`Signed-off-by: Full Name <email@example.com>`).
- State that MRs whose commits lack the sign-off will not be
  merged.
- Document the case where an existing commit needs sign-off
  added retroactively: `git commit --amend --signoff` for the
  latest commit; `git rebase --signoff -i <base>` for an MR's
  commit range.

**Alternatives considered**:

- *CLA via CLA Assistant*: stronger legal protection (especially
  for future relicensing or dual-licensing) but adds operational
  overhead: contributor must sign a separate document via a
  GitHub/GitLab integration; the project must maintain a CLA
  database; the contributor experience degrades. Not worth it for
  a small permissive-licensed project.
- *No formal sign-off*: contributor's MR submission implies MIT
  consent. Common for very small projects but legally thinner
  if a dispute arises. Rejected.

**Enforcement note**: This feature documents the requirement in
`CONTRIBUTING.md` and adds a checklist item to the MR template.
**CI-level enforcement** (rejecting MRs with unsigned commits via
a `.gitlab-ci.yml` job) is OUT OF SCOPE for this feature and
explicitly deferred to Feature 006 (CI/CD pipeline).

## GitLab issue and MR template directory conventions

**Decision**: Use GitLab's standard template directory layout:

```text
.gitlab/
├── issue_templates/
│   ├── Bug.md
│   ├── Feature.md
│   └── Security.md
└── merge_request_templates/
    └── Default.md
```

**Rationale**: GitLab auto-discovers markdown files in
`.gitlab/issue_templates/` and `.gitlab/merge_request_templates/`.
The file basename (e.g., `Bug`) becomes the template's
display-name in the "New issue" / "New merge request" template
dropdown. Files must be markdown (`.md`). No registration step
required — files in the right path are picked up automatically.

**Source**: GitLab docs —
`https://docs.gitlab.com/ee/user/project/description_templates.html`.

**Behavior**:

- A user opening "New issue" sees a "Choose a template" dropdown
  containing `Bug`, `Feature`, `Security`.
- A user opening "New merge request" sees a similar dropdown with
  `Default` (and the default behavior remains: empty body if no
  template is chosen).
- `Default.md`'s name is conventional — `Default` is one of the
  reserved names GitLab treats as the default selection in the
  dropdown.

**Alternatives considered**:

- *GitHub-style `.github/ISSUE_TEMPLATE/`*: this is GitLab, not
  GitHub. GitLab uses a different layout. Rejected as not
  applicable.
- *Single `description.md` template at repo root*: GitLab supports
  this older pattern but it's a single template only, no
  per-issue-type discrimination. Inferior to the per-template
  pattern for this feature's needs (Bug vs Feature vs Security
  vary substantially).

## README front-matter best practices

**Decision**: Adopt the following first-30-lines structure (the
"value-proposition front matter"):

```text
Line 1:       # SafeSignal
Line 2:       (blank)
Lines 3–6:    one-sentence value proposition + 1-2 sentences of
              positioning (browser-first, vendor-neutral, secure-
              by-default, federated-aware)
Line 7:       (blank)
Lines 8–9:    ## Why SafeSignal  (or "What you get")
Line 10:      (blank)
Lines 11–18:  4–6 bullet points naming the differentiators
              (secure-by-default redaction, never-throw boundary,
              vendor-neutral transports, federated-runtime
              discipline, lightweight Logger instances, etc.)
Line 19:      (blank)
Lines 20–22:  ## Install + ```bash code fence with
              `npm install @tallyrow/safesignal`
Line 23:      (blank)
Lines 24–30:  Minimal "first event" code block (configureLogging
              + createLogger + log.info)
```

**Rationale**: Established pattern for popular npm packages and
GitHub-trending projects. Leads with WHAT (name) → WHY
(differentiators) → HOW (install + first call). A reader scanning
the front matter gets the value proposition in under 30 seconds
without scrolling.

**Source**: Survey of high-traffic npm packages with strong
landing pages — `pino`, `zod`, `vitest`, `radash`, `chalk`. Common
pattern across all five.

**Migration-note relocation**: Per FR-028, the feature 003
migration note moves from its current position (directly under
the H1) to a `## Migration history` section deeper in the README.
A front-matter pointer (a single sentence after the install
section, like "Previously known as `@your-org/frontend-logging-sdk`?
See [Migration history](#migration-history).") preserves
discoverability for consumers arriving via the legacy name.

**Alternatives considered**:

- *Keep migration note at top*: rejected because v1.0.0 has
  shipped and the README's primary job has switched from
  "migration discovery" to "first-time discovery." Migration
  content still ships but as a labeled subsection.
- *Drop migration note entirely*: rejected because it's still
  reachable from npm registry pages and external links that
  pre-date the rename. Information loss would be a regression on
  feature 003's FR-007.

## Migration-note content source

**Decision**: Use the verbatim text from `README.md` lines 11-40
on the `003-rename-safesignal` branch at HEAD as the source for
the relocated `## Migration history` section. Add only:

- A new `## Migration history` H2 (replacing the current
  `## Renamed from \`frontend-logging-sdk\`` H2; the H2 changes
  but the body stays identical).
- A short intro sentence (1-2 lines) explaining what the section
  contains.

**Rationale**: FR-028 mandates verbatim content preservation; only
the location moves. SC-007 verifies all 7 required elements
(legacy name, new name, install one-liner, import find-and-
replace, subpath continuity, rename version, behavior-preservation
statement) survive the relocation. The contract
`contracts/migration-note-preservation.md` formalizes this as a
byte-level diff invariant.

**Source path**: `/home/johng/Repos/frontend-logging-sdk/README.md`
lines 11-40 at branch HEAD (commit `4e0bb29` or later).

## Forward-looking Roadmap content

**Decision**: The README MAY include a `## Roadmap` section
referencing the following forward items by name and short
description, but MUST NOT imply they exist today or link to
non-existent URLs:

- **Trace-context propagation** (W3C Trace Context — `traceparent`,
  `tracestate`) — planned for Feature 005 or later.
- **`./transport-otlp` subpath** (OTel-formatted events; ships to
  any OTLP backend including future SafeSignal monitoring service)
  — planned alongside trace-context propagation.
- **RUM features** (Web Vitals, automatic error capture, view
  tracking, network instrumentation) — planned as separate
  features after the OTel foundation lands.
- **`safesignal-server` monitoring service backend** — planned as
  a separate sibling repo under TallyRow. NOT in this repo.

**Rationale**: Per FR-035 and the spec edge case "SafeSignal scope
split signal", the README must not promise RUM or backend features
that this repo will never house. The Roadmap section IS allowed
provided every item is clearly marked as future-state and no
non-existent URLs are linked.

**Source**: User's strategic direction (memory:
[[project-safesignal-scope-split]]).

**Alternatives considered**:

- *No Roadmap section*: keeps the README focused on present
  reality but undersells the project's direction. Rejected — a
  small, clearly-labeled Roadmap helps prospective adopters
  understand where the project is going without overcommitting.
- *Detailed Roadmap with feature dates*: rejected — date estimates
  would be promises this feature can't keep. Forward items get
  names only; no commitments.

## GOVERNANCE.md evolution-path thresholds

**Decision**: Adopt the spec's default thresholds verbatim — "2+
regular contributors → adopt CODEOWNERS; 5+ → formalize steering
group." These are documentation-only suggestions, not binding
governance rules.

**Rationale**: The Open Question in the spec called this item
low-impact. The defaults are reasonable, the language is hedged
("MAY evolve"), and the maintainer can revise the file at any time
without spec-level overhead. No clarification needed.

## File-creation ordering

**Decision**: Land US1 (LICENSE + package.json `license` field +
README rewrite) FIRST. Then US2/US3/US4 in parallel (different
files). Then Polish.

**Rationale**: US2's CONTRIBUTING.md, US3's SECURITY.md, and US4's
GOVERNANCE.md will all be linked from the README's "Project
resources" section. Writing the README rewrite first establishes
the link targets before they're referenced. Within US1, the
`package.json` license addition is unconditional; the README
rewrite touches the most-referenced file in the repo and benefits
from being committed early so reviewers can give feedback before
US2-US4 commit on top.

## Audit verification approach

**Decision**: Use small, deterministic shell-based file-existence
+ content-presence checks. No new test files. The Polish phase
runs:

1. `test -f LICENSE && test -f CONTRIBUTING.md && ...` for file
   presence (FR-041).
2. `grep "MIT" LICENSE && grep '"license": "MIT"' package.json`
   for license consistency (FR-002, SC-004).
3. `grep -q "SafeSignal" <(head -30 README.md)` and similar for
   README front-matter content (FR-043, SC-001).
4. `diff <relocated-section> <feature-003-source>` for migration-
   note preservation (FR-028, SC-007).
5. `npm test` for test-suite invariance (FR-044, SC-009).

**Rationale**: This feature has no runtime artifact to test
exhaustively. The verification surface is "files exist, contain
the required text, README is well-shaped." Shell + grep is the
right tool. The contracts/ directory specifies each check
formally.

**Alternatives considered**:

- *Add a vitest test for file content*: overkill for a doc-only
  feature. Rejected.
- *Use a markdown-lint tool*: would catch some shape issues but
  doesn't verify content semantics (e.g., "first 30 lines mention
  SafeSignal"). Useful adjacent tool but out of scope for this
  feature; could be added in Feature 007 (Developer ergonomics).
