# Feature Specification: Repo Legal & Community Foundation

**Feature Branch**: `004-community-foundation`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Establish the repo's legal and community
foundation for SafeSignal: add an MIT LICENSE, a CONTRIBUTING guide
that references the constitution and Spec Kit workflow, a SECURITY.md
with a vulnerability disclosure policy, a CODE_OF_CONDUCT.md
(Contributor Covenant 2.1), a GOVERNANCE.md that describes how
decisions get made, GitLab issue + MR templates that encode the
test-plan / security-review structure already used in MRs, and a
README rewrite that leads with the value proposition for first-time
readers (moving the v1.0.0 migration note from its current position
directly under the H1 to a Migration history section further down,
since v1.0.0 has shipped). Out of scope: CI/CD pipeline, npm publish
workflow, branch protections, lint/format config, GitLab admin
settings — those go in separate features."

## Clarifications

### Session 2026-05-28

- Q: Copyright holder name in the `LICENSE` file → A: `John Goure` (the maintainer's individual legal name as it appears in git config; TallyRow remains the brand/publisher and npm-scope name but is not the legal copyright holder)
- Q: Contact addresses for SECURITY.md and CODE_OF_CONDUCT.md → A: same inbox, distinct aliases — `security@tallyrow.com` for SECURITY.md vulnerability reports, `conduct@tallyrow.com` for CODE_OF_CONDUCT.md enforcement reports, both routing to the same maintainer-owned destination on the `tallyrow.com` domain
- Q: Contributor sign-off requirement → A: DCO (Developer Certificate of Origin) via `git commit -s`. Contributors attest by adding a `Signed-off-by:` footer to every commit. No separate CLA document; no contributor-tracking infrastructure. Verified mechanically by reviewers (and later by CI in Feature 006).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First-time visitor orients to the project (Priority: P1)

A developer who has never seen SafeSignal lands on the repo
(GitLab project page) or the npm registry page. Within 30 seconds
of reading the README they understand: (a) what SafeSignal is, (b)
what problem it solves, (c) who it's for, (d) why it's worth picking
over alternatives, (e) how to install + emit a first event. The
legal status (MIT) is unambiguous from the registry page metadata
and a top-level `LICENSE` file. Migration context from earlier
working names is available but not the first thing a new reader
encounters.

**Why this priority**: This is the canonical discovery experience.
Every other community/contributor surface depends on this first
impression. A consumer who bounces off the README within 30 seconds
because the front-matter is dense or migration-focused doesn't
encounter CONTRIBUTING, SECURITY, GOVERNANCE, or anything else. A
well-shaped README is what makes the rest of the foundation
reachable.

**Independent Test**: Open `README.md` at HEAD and scan the first
scrollable screen. The first heading, the first paragraph, the
first call-to-action (Install / Quickstart), and the "Why
SafeSignal" framing all appear before any migration note. The
migration note still exists but is in a clearly-labeled later
section (e.g., `## Migration history`). The npm registry view
(simulated via `npm view @tallyrow/safesignal`) shows `license:
"MIT"`.

**Acceptance Scenarios**:

1. **Given** a developer opens `README.md` at HEAD, **When** they
   read the first scrollable screen (~30 lines), **Then** they see
   (a) project name SafeSignal, (b) a one-sentence value
   proposition that names the secure-by-default + vendor-neutral
   posture, (c) a "Why SafeSignal" or "What you get" section
   summarising the package's differentiators in 4–6 bullets, (d) a
   one-line install command, and (e) a minimal quickstart code
   block — all BEFORE any migration note or in-development status
   block.
2. **Given** a developer scans the repo file list, **When** they
   look at the root, **Then** they find a top-level `LICENSE` file
   identifying the package as MIT-licensed.
3. **Given** a consumer runs `npm view @tallyrow/safesignal` (or
   inspects `package.json` directly), **When** they read the
   `license` field, **Then** it reads `"MIT"`.
4. **Given** an existing consumer arriving via the legacy package
   name, **When** they scroll past the new value-proposition front
   matter, **Then** they find a clearly-labeled `## Migration
   history` section containing the same
   legacy-to-SafeSignal mapping currently shipped in feature 003's
   migration block — no information is lost.

---

### User Story 2 — Prospective contributor finds a clear path to contribute (Priority: P2)

A developer who likes the project enough to want to contribute (file
a bug, propose a feature, send an MR) reaches a `CONTRIBUTING.md`
that tells them exactly how the project's development workflow runs.
They understand: where the governing principles live (constitution),
how features get scoped (Spec Kit), how to file a bug, how to
propose a feature, what an MR is expected to contain, what review
criteria are used, and the contributor-side expectations
(Code of Conduct, sign-off, etc.). They never have to guess.

**Why this priority**: The constitution and the Spec Kit workflow
already exist — they're the most distinctive thing about this
project's development process. Without a CONTRIBUTING guide, that
context is invisible to outside contributors; their first MR will
likely miss the spec-first workflow and get bounced. A clear
CONTRIBUTING guide makes the rigor accessible instead of mysterious.

**Independent Test**: A simulated new contributor reads only
`CONTRIBUTING.md`. After reading, they can: (a) locate the
constitution and explain its role, (b) describe the Spec Kit
workflow at a high level (specify → clarify → plan → tasks →
analyze → implement), (c) know which GitLab issue template to use
for a bug vs a feature vs a security report, (d) know the MR
template's required sections (Summary, What changed, Verification,
Test plan), (e) know the Code of Conduct exists and applies.

**Acceptance Scenarios**:

1. **Given** a `CONTRIBUTING.md` file at repo root, **When** a
   contributor reads it, **Then** the document references the
   constitution at `.specify/memory/constitution.md` and explains
   its authority as the binding standard for package decisions.
2. **Given** the same `CONTRIBUTING.md`, **When** the contributor
   reads the workflow section, **Then** it describes the Spec Kit
   flow (specify, clarify, plan, tasks, analyze, implement) with
   links to the existing `specs/` directory as worked examples.
3. **Given** a contributor wants to file a bug, **When** they open
   a new issue on GitLab, **Then** an issue template named "Bug
   report" appears with structured prompts (steps to reproduce,
   expected vs actual, package version, browser version,
   reproduction case).
4. **Given** a contributor wants to propose a feature, **When**
   they open a new issue, **Then** a "Feature request" template
   appears that asks for the consumer use case, the constitutional
   principle(s) involved, and which existing API surface (if any)
   would change.
5. **Given** a contributor opens an MR, **When** GitLab pre-fills
   the description, **Then** the MR template includes sections:
   Summary, What changed, Verification, Test plan, Constitution
   touchpoints.
6. **Given** the project has an explicit Code of Conduct, **When**
   `CONTRIBUTING.md` references it, **Then** the link resolves to
   a `CODE_OF_CONDUCT.md` file at the repo root containing the
   Contributor Covenant 2.1 (verbatim) with the maintainer contact
   filled in.

---

### User Story 3 — Security researcher knows how to report a vulnerability (Priority: P2)

A security researcher discovers a vulnerability in SafeSignal (a
redaction bypass, a transport security regression, a leakage of
sensitive data via an unexpected code path). They open the
project's `SECURITY.md` and find: (a) a clear contact channel
(private, not public-issue), (b) an expected response time, (c) the
disclosure policy (coordinated disclosure with a defined timeline),
(d) the project's supported versions, and (e) what NOT to do (don't
file a public GitLab issue with the vulnerability details).

**Why this priority**: Principle IV (Secure Logging by Default) is
NON-NEGOTIABLE per the constitution. Operationally, that means
SafeSignal must accept security reports through a non-public
channel. Without a `SECURITY.md`, researchers either don't report
or report publicly — both bad outcomes. This unlocks Principle IV
at the inbound-report layer.

**Independent Test**: A simulated researcher opens `SECURITY.md`.
After reading, they know exactly how to reach the maintainer
privately, what response time to expect, what the embargo window
is before public disclosure, and which versions are in scope for
reports.

**Acceptance Scenarios**:

1. **Given** a `SECURITY.md` file at repo root, **When** a
   researcher reads it, **Then** the file names a private contact
   method (email address or GitLab security-advisory URL) for
   vulnerability reports.
2. **Given** the same file, **When** the researcher reads the
   response-time policy, **Then** the document states an explicit
   target (e.g., "acknowledgement within 72 hours; initial
   assessment within 7 days").
3. **Given** the same file, **When** the researcher reads the
   disclosure policy, **Then** the document specifies a
   coordinated-disclosure window (e.g., "fix landed and published
   before public disclosure, target 90 days from initial
   acknowledgement, extendable by mutual agreement").
4. **Given** the same file, **When** the researcher reads the
   supported-versions table, **Then** it lists which package
   versions are in scope for security fixes (initially: `1.x`
   only).
5. **Given** the researcher tries to file the vulnerability via a
   public GitLab issue, **When** they open the new-issue form,
   **Then** the issue templates include a "Security report" option
   that redirects to the private channel instead of allowing the
   public submission.

---

### User Story 4 — Maintainer / outside reader understands how decisions are made (Priority: P3)

A reader (existing contributor, prospective contributor, or
auditor) wants to understand: who can approve an MR? Who decides
when a constitution amendment is needed? Who can publish to npm?
Who triages security reports? They open `GOVERNANCE.md` and find
explicit answers. The document acknowledges that the project is
small (currently solo maintainer under TallyRow) and explains the
expected governance evolution as contributors join.

**Why this priority**: A solo-maintained project doesn't strictly
need GOVERNANCE.md from a process standpoint — the maintainer
makes all decisions. But governance documentation is a
**legitimacy signal** to potential contributors and downstream
consumers. It says "this project has thought about how it scales,"
even when the answer today is "one person." It also pre-emptively
documents the decision authority for security reports + npm
publishes, which matters for trust.

**Independent Test**: A reader opens `GOVERNANCE.md`. After
reading, they can answer: who approves MRs? Who decides on
constitution amendments? Who has npm publish authority? Who
triages security reports? What changes when contributor count
grows past 1?

**Acceptance Scenarios**:

1. **Given** a `GOVERNANCE.md` file at repo root, **When** a reader
   reads it, **Then** the file identifies the current sole
   maintainer (by GitLab handle / name) and acknowledges the
   single-maintainer status as a transitional state.
2. **Given** the same file, **When** the reader reads the decision
   authority section, **Then** it explains: MR approval (who can
   approve), constitution amendments (process + threshold), npm
   publish rights (who, with what 2FA / OIDC arrangement),
   security triage (who).
3. **Given** the same file, **When** the reader reads the
   evolution-as-contributors-grow section, **Then** the document
   describes the intended path (e.g., "at 2+ regular contributors,
   adopt CODEOWNERS; at 5+, formalize a steering group").
4. **Given** the constitution at `.specify/memory/constitution.md`,
   **When** `GOVERNANCE.md` references it, **Then** the
   relationship is explicit: the constitution is the binding
   technical standard; GOVERNANCE.md is the human-decision-making
   process for amending it and applying it.

---

### Edge Cases

- **CONTRIBUTING.md vs constitution.md overlap.** The constitution
  is binding technical standard; CONTRIBUTING is human-facing
  process. CONTRIBUTING must REFERENCE the constitution, not
  REPLICATE its content. A contributor reads CONTRIBUTING for
  "how do I work here?" and reads the constitution for "what are
  the rules my work must satisfy?" Drift between the two is a
  documentation bug.
- **GitLab MR template clash with auto-generated bot footers.** The
  feature 003 MR was created with a `🤖 Generated with Claude
  Code` footer. The new MR template is for HUMAN contributors and
  must not assume an AI co-author. The template lives in
  `.gitlab/merge_request_templates/Default.md`; the footer is
  added by the agent's commit/MR composition, not the template.
- **README size budget.** The current README is 286 lines —
  comprehensive but dense. A rewrite that "leads with value
  proposition" will likely grow the README further (adding a "Why
  SafeSignal" front matter, a comparison section, links to
  supporting docs). The README should stay under a reasonable
  cap (≤ 600 lines) and push detail to `docs/safe-logging.md` or
  feature-specific quickstart files.
- **Migration note discoverability after relocation.** Feature 003
  placed the migration note on the first scrollable screen
  intentionally to maximize discoverability during the rename
  window. Moving it to a `## Migration history` section deeper in
  the README MUST keep it linked from a clear front-matter
  pointer (e.g., "Previously known as `@your-org/frontend-logging-sdk`?
  See [Migration history](#migration-history).") so a consumer
  arriving via the legacy name still finds the mapping within one
  scroll.
- **Code of Conduct contact info.** The Contributor Covenant 2.1
  template requires a contact for enforcement reports. This is the
  same address (or a closely-related one) as the SECURITY.md
  contact, but the contexts are different (CoC violations vs
  security vulnerabilities). The file must make this distinction
  clear or the user might mis-route reports.
- **GitLab issue templates and the "Security report" option.**
  Issue templates in GitLab present a dropdown when filing a new
  issue. The "Security report" template should NOT collect
  vulnerability details in a public issue body — it should be a
  redirect-style template that says "DO NOT file vulnerability
  details here; use the private channel at
  security@tallyrow.com".
- **SafeSignal scope split signal.** The README rewrite must NOT
  promise RUM features, monitoring backend functionality, or
  anything from the planned `safesignal-server` repo. SafeSignal
  is and remains a small vendor-neutral browser SDK per the
  recent scope-split decision. The README can mention "future
  features" (web vitals, error capture, view tracking) as
  roadmap items but must not imply they exist today.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature
  adds documentation, legal, and templates files. It does not add,
  remove, rename, or alter any exported symbol, type, function
  signature, behavior, or runtime contract.

- **Compatibility Impact**: **Backward compatible / additive.** No
  consumer code change required. Existing consumers continue using
  `@tallyrow/safesignal@1.0.0` exactly as before. The `package.json`
  `license` field is added (currently absent), which is metadata-
  only.

- **Migration Notes**: No migration required for consumers. The
  README's existing v1.0.0 migration note (added in feature 003)
  is preserved; it relocates from the first-scroll position to a
  `## Migration history` section deeper in the README. A
  front-matter pointer links to it so discoverability is preserved
  for consumers arriving via the legacy package name.

- **Host/Module Usage Impact**: **No impact.** Host applications
  and federated modules are unaffected at runtime, install, or
  build time.

- **Security & Privacy Considerations**: **Positive impact.** This
  feature operationalizes Principle IV (Secure by Default) at the
  inbound layer — `SECURITY.md` gives security researchers a clear
  private channel to report vulnerabilities. The MIT license also
  formalizes the legal terms under which the package is
  distributed, removing ambiguity that could deter security-
  conscious adopters. No new path to leak sensitive data is
  introduced.

- **Log Integrity Considerations**: **No impact.** Event production,
  ordering, dropping, batching, transformation, and attribution
  semantics are all unchanged.

- **Runtime Scale & Federated Deployment Impact**: **No impact.**
  Per-`Logger` creation cost, shared runtime resource ownership,
  host vs. module configuration responsibility, and duplicate-
  package-copy classification (**isolated**) are all unchanged.

## Requirements *(mandatory)*

### Functional Requirements

#### Legal foundation

- **FR-001**: A `LICENSE` file MUST exist at the repository root
  containing the verbatim MIT License text with the copyright year
  (`2026`) and the copyright holder `John Goure` (the maintainer's
  individual legal name). `TallyRow` remains the brand and npm
  scope but is not the legal copyright holder.
- **FR-002**: `package.json` MUST include a `"license": "MIT"`
  field consistent with the `LICENSE` file. This field MUST appear
  in the published npm artifact (verifiable via `npm view
  @tallyrow/safesignal license` after publish).
- **FR-003**: The MIT license text MUST be the standard OSI-approved
  text — no custom modifications, no "with Commons Clause" or
  similar amendments. Modifying the license text would constitute
  a non-MIT license and is out of scope.

#### Contributing guide

- **FR-004**: A `CONTRIBUTING.md` file MUST exist at the repository
  root.
- **FR-005**: `CONTRIBUTING.md` MUST reference `.specify/memory/constitution.md`
  by relative link and explain its authority as the binding
  standard for package decisions.
- **FR-006**: `CONTRIBUTING.md` MUST describe the Spec Kit workflow
  (specify → clarify → plan → tasks → analyze → implement) at a
  high level, with links to existing `specs/001-*/`, `specs/002-*/`,
  `specs/003-*/`, and (eventually) `specs/004-*/` as worked
  examples.
- **FR-007**: `CONTRIBUTING.md` MUST describe how to file a bug,
  propose a feature, and open an MR, including pointers to the
  GitLab issue templates and the MR template.
- **FR-008**: `CONTRIBUTING.md` MUST reference `CODE_OF_CONDUCT.md`
  by relative link and require contributors to abide by it.
- **FR-009**: `CONTRIBUTING.md` MUST describe the local development
  setup at a high level (clone, install, build, test) without
  duplicating content already in `README.md`'s quickstart.
- **FR-009a**: `CONTRIBUTING.md` MUST document the DCO (Developer
  Certificate of Origin) sign-off requirement. The document MUST:
  (a) reproduce the canonical DCO 1.1 text inline (sourced from
  `https://developercertificate.org/`; the text is short enough —
  under 30 lines — that inline reproduction is required for
  offline-readable CONTRIBUTING), (b) instruct contributors to
  sign every commit with `git commit -s` (which appends a
  `Signed-off-by: Name <email>` footer), (c) state that MRs whose
  commits lack the sign-off footer will not be merged. The
  expected footer format is the standard git form:
  `Signed-off-by: Full Name <email@example.com>`.

#### Security disclosure

- **FR-010**: A `SECURITY.md` file MUST exist at the repository
  root.
- **FR-011**: `SECURITY.md` MUST name `security@tallyrow.com` as
  the private contact for vulnerability reports. The contact MUST
  NOT be a public-issue tracker URL. A GitLab private security
  advisory URL MAY be listed as a secondary option but the email
  is the canonical channel.
- **FR-012**: `SECURITY.md` MUST state an explicit response-time
  policy with acknowledgement and initial-assessment targets.
- **FR-013**: `SECURITY.md` MUST state a coordinated-disclosure
  policy with an explicit embargo window default (e.g., 90 days
  from acknowledgement, extendable by mutual agreement).
- **FR-014**: `SECURITY.md` MUST list which package versions are
  in scope for security fixes (initially: `1.x` only).
- **FR-015**: `SECURITY.md` MUST explicitly direct researchers AWAY
  from filing public-issue submissions of vulnerability details
  ("DO NOT file vulnerability details in a public GitLab issue").

#### Code of Conduct

- **FR-016**: A `CODE_OF_CONDUCT.md` file MUST exist at the
  repository root containing the verbatim Contributor Covenant
  version 2.1 text, with the enforcement-contact placeholder
  filled in as `conduct@tallyrow.com` (a distinct alias from
  SECURITY.md's `security@tallyrow.com`, both routing to the same
  maintainer-owned inbox on the `tallyrow.com` domain).
- **FR-017**: The Contributor Covenant version (`2.1`) MUST be
  identified in the file.

#### Governance

- **FR-018**: A `GOVERNANCE.md` file MUST exist at the repository
  root.
- **FR-019**: `GOVERNANCE.md` MUST identify the current
  maintainer(s) by name and/or GitLab handle.
- **FR-020**: `GOVERNANCE.md` MUST describe decision authority for:
  (a) MR approval, (b) constitution amendments, (c) npm publish
  rights, (d) security triage.
- **FR-021**: `GOVERNANCE.md` MUST describe the relationship to
  `.specify/memory/constitution.md` — constitution is the binding
  technical standard; GOVERNANCE.md is the human-decision-making
  process.
- **FR-022**: `GOVERNANCE.md` MUST acknowledge the current sole-
  maintainer state and describe the evolution path as
  contributor count grows.

#### GitLab issue + MR templates

- **FR-023**: A `.gitlab/issue_templates/Bug.md` file MUST exist
  with structured prompts for: steps to reproduce, expected
  behavior, actual behavior, package version, browser version
  (where relevant), minimal reproduction.
- **FR-024**: A `.gitlab/issue_templates/Feature.md` file MUST
  exist with structured prompts for: consumer use case, which
  constitutional principle(s) the feature touches, and which
  existing API surface (if any) would change.
- **FR-025**: A `.gitlab/issue_templates/Security.md` file MUST
  exist with content that REDIRECTS reporters to the private
  channel from `SECURITY.md` rather than collecting vulnerability
  details publicly.
- **FR-026**: A `.gitlab/merge_request_templates/Default.md` file
  MUST exist with sections: Summary, What changed, Verification,
  Test plan, Constitution touchpoints, **DCO sign-off checklist**.
  The DCO checklist MUST contain the canonical wording from
  `data-model.md`'s MR template inventory (verbatim): `- [ ] Every
  commit in this MR carries a Signed-off-by: footer (verify with
  \`git log <base>..HEAD --format=%B | grep -c 'Signed-off-by:'\`)`.
  Sections MAY be optional per MR type but MUST be enumerated in
  the template.

#### README rewrite

- **FR-027**: `README.md`'s first scrollable screen (first ~30
  lines) MUST contain, in order: (a) project name (`# SafeSignal`),
  (b) one-sentence value proposition, (c) a "Why SafeSignal" or
  "What you get" section summarising the package's
  differentiators (secure-by-default, vendor-neutral, federated-
  runtime-aware, lightweight) in 4–6 bullets, (d) one-line install
  command, (e) minimal quickstart code block.
- **FR-028**: The migration note from feature 003 MUST be
  relocated from its current position directly under the H1 to a
  `## Migration history` section deeper in the README. The H2
  heading text MUST read exactly `Migration history` (no
  analogous-name variants — the verification contracts in
  `contracts/readme-front-matter.md` and
  `contracts/migration-note-preservation.md` grep for the exact
  heading, so consistency is mandatory). Content of the migration
  note body is preserved verbatim (per `contracts/migration-note.md`
  from feature 003).
- **FR-029**: A front-matter pointer MUST link from the README's
  early content (after the quickstart but before deeper
  documentation) to the `## Migration history` section, so a
  consumer arriving via the legacy package name still finds the
  mapping within one scroll.
- **FR-030**: The README MUST link to `CONTRIBUTING.md`,
  `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, and
  `LICENSE` from a dedicated "Project resources" section.
- **FR-031**: The README MUST preserve links to all of the
  following supporting surfaces. Existing links in the current
  README already satisfy this requirement; the rewrite preserves
  them as-is (relocating them as needed, e.g., into `## Project
  resources` per FR-030):
    - `docs/safe-logging.md` (the full DO/DON'T sweep +
      bounded-behavior catalog)
    - `examples/host-app/` and `examples/federated-module/` (the
      two consumer-walkthrough examples)
    - `.specify/memory/constitution.md` and the `specs/` directory
      (constitution + how features are designed)
- **FR-032**: *(merged into FR-031 — examples links covered by the
  consolidated requirement above)*
- **FR-033**: *(merged into FR-031 — constitution + specs links
  covered by the consolidated requirement above)*
- **FR-034**: The README's `## What this package does NOT do (in
  v1)` section (currently present) MUST be preserved or
  equivalently expressed, since it sets honest expectations about
  scope (no auto-error-capture, no offline queue, no batching by
  default, etc.). This is constitution-relevant (Principle V's
  "minimal, maintainable" posture).
- **FR-035**: The README rewrite MUST NOT promise RUM features,
  monitoring backend functionality, or anything from the planned
  `safesignal-server` repo. Forward-looking roadmap mentions
  (web vitals, error capture, view tracking, OTel transport) are
  allowed in a clearly-labeled "Roadmap" section, but the rewrite
  must not imply those features exist today.

#### Invariants preserved

- **FR-036**: No change to `src/**` source files.
- **FR-037**: No change to test logic, test count, or test
  assertions. The full test suite passes unchanged.
- **FR-038**: No change to `package.json` `dependencies` or
  `devDependencies`. The only `package.json` change permitted by
  this feature is the addition of the `"license": "MIT"` field
  (FR-002).
- **FR-039**: No change to the `exports` map shape (`.`,
  `./testing`, `./transport-beacon`).
- **FR-040**: No change to runtime behavior, redaction defaults,
  sanitizer limits, URL scrubber behavior, level-filter defaults,
  or transport security contracts.

#### Verification

- **FR-041**: An audit MUST verify that all of `LICENSE`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`, `.gitlab/issue_templates/{Bug,Feature,Security}.md`,
  and `.gitlab/merge_request_templates/Default.md` exist at HEAD.
- **FR-042**: An audit MUST verify that `package.json` contains
  `"license": "MIT"`.
- **FR-043**: An audit MUST verify that the README's first 30
  lines contain the project name, value proposition, "Why
  SafeSignal" content, install command, and quickstart code block
  in that order, with NO migration content above them.
- **FR-044**: The full test suite MUST pass unchanged post-feature
  (same test count, same passing count, same skipped/todo counts).

### Key Entities

- **MIT License**: The legal terms under which SafeSignal is
  distributed. Standard OSI-approved text. Lives in a top-level
  `LICENSE` file and is referenced by `package.json`'s `license`
  field for the npm registry.

- **Constitution**: Pre-existing binding technical standard at
  `.specify/memory/constitution.md`. The 7 principles. This
  feature does NOT modify the constitution; it makes the
  constitution discoverable to contributors via CONTRIBUTING.md
  and GOVERNANCE.md.

- **Spec Kit workflow**: Pre-existing development process
  (specify, clarify, plan, tasks, analyze, implement). This
  feature documents the workflow in CONTRIBUTING.md so external
  contributors can engage with it.

- **Contributor Covenant 2.1**: The community standard Code of
  Conduct text. Verbatim adoption with the enforcement-contact
  placeholder filled in.

- **GitLab issue / MR template**: Markdown files in
  `.gitlab/issue_templates/` and `.gitlab/merge_request_templates/`
  that GitLab presents when a user creates an issue or MR. They
  pre-fill the description body with structured prompts.

- **Migration note**: The block currently shipping in `README.md`
  directly under the H1 (added by feature 003). Its content stays;
  its position in the README moves to a `## Migration history`
  section deeper in the document.

- **README first scrollable screen**: The first ~30 lines of
  `README.md` — what a reader sees without scrolling. The single
  most-impactful surface for a new visitor's first impression.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor reading the README's first
  scrollable screen identifies (a) what SafeSignal is, (b) what
  problem it solves, (c) the secure-by-default + vendor-neutral
  positioning, (d) the install command, and (e) the minimal usage
  pattern — within 30 seconds and without scrolling past line 30.
- **SC-002**: A prospective contributor reading only
  `CONTRIBUTING.md` can correctly answer: where does the
  constitution live? What is the Spec Kit workflow? Where do I
  file a bug / feature / security report? What is the MR template?
  Is there a Code of Conduct? **How do I sign my commits (DCO,
  `git commit -s`)?**
- **SC-003**: A security researcher reading `SECURITY.md` finds a
  private contact method, an acknowledgement-time target, an
  initial-assessment target, an embargo policy, and a supported-
  versions list — all within the file.
- **SC-004**: `package.json`'s `license` field reads `"MIT"` and
  matches the top-level `LICENSE` file (which contains verbatim
  OSI-approved MIT text).
- **SC-005**: The repository root contains: `LICENSE`,
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`. None are empty placeholders.
- **SC-006**: GitLab issue templates `Bug.md`, `Feature.md`, and
  `Security.md` exist at `.gitlab/issue_templates/`. The MR
  template exists at `.gitlab/merge_request_templates/Default.md`.
  All four templates render correctly in GitLab's "New
  issue"/"New merge request" dropdown.
- **SC-007**: The README's migration note from feature 003 is
  preserved verbatim — none of the 7 required elements
  (legacy name, new name, install one-liner, import find-and-
  replace, subpath continuity, rename version, behavior-
  preservation statement) is lost in the relocation.
- **SC-008**: The README's `## What this package does NOT do (in
  v1)` content (or equivalent honest-scope content) is preserved
  in the rewrite.
- **SC-009**: The full test suite passes unchanged post-feature —
  same file count, passing count, todo count, failing count, and
  unhandled errors as pre-feature.
- **SC-010**: An audit script (grep + file existence checks) can
  verify all of the above in under 5 seconds.

## Open Questions / Clarifications Needed

The maintainer MAY want to revise the following items before
`/speckit-plan`. SECURITY.md and CODE_OF_CONDUCT.md contact
addresses are now resolved (see Clarifications).

1. **GOVERNANCE.md "evolution path" thresholds.** Default
   suggestion: "2+ regular contributors → adopt CODEOWNERS; 5+ →
   formalize steering group." Maintainer MAY pick different
   thresholds or omit the evolution path entirely.

## Assumptions

- The maintainer (`johng` / TallyRow) chooses MIT licensing
  deliberately for permissive open-source distribution. Future
  consideration of dual-licensing (e.g., MIT + commercial) is out
  of scope for this feature.
- The maintainer chooses Contributor Covenant 2.1 (verbatim, not
  a fork) as the community standard.
- The maintainer controls the `tallyrow.com` domain and will set
  up two aliases — `security@tallyrow.com` (SECURITY.md
  vulnerability reports) and `conduct@tallyrow.com`
  (CODE_OF_CONDUCT.md enforcement reports) — both routing to the
  same maintainer-owned inbox. Both addresses MUST be deliverable
  before this feature merges.
- The current sole-maintainer governance state is acceptable to
  document explicitly in `GOVERNANCE.md`. The document
  acknowledges the evolution path but does not pre-empt
  governance decisions that haven't been made.
- `package.json` `version` stays at `1.0.0`. This feature does
  NOT trigger a version bump (the changes are documentation +
  metadata; no consumer call-site change). A patch version bump
  to `1.0.1` MAY occur in a follow-up if/when this feature ships
  to npm, but the version bump is a separate decision.
- The README rewrite preserves the technical content already in
  place; nothing currently in the README is removed except for the
  position of the migration note (its content is relocated, not
  removed).
- The `safesignal-server` monitoring service repo is a planned
  sibling product but does NOT exist yet. The README MAY mention
  it as a future possibility in the Roadmap section but MUST NOT
  link to a non-existent URL.
- The CI/CD pipeline, npm publish workflow, branch protection
  rules, lint/format configuration, and GitLab admin settings
  (master→main rename, branch protections, MR approval rules,
  integrations) are explicitly OUT OF SCOPE for this feature.
  They ship in subsequent features.
