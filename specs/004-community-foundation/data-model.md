# Data Model: Repo Legal & Community Foundation

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](./spec.md)
**Plan**: [004-community-foundation/plan.md](./plan.md)
**Date**: 2026-05-28

For a documentation-and-metadata feature, the "data model" is the
**file-by-file content inventory** — each new or modified artifact
with its required content shape: section headings, required text
markers, link targets, version identifiers. This is the
authoritative checklist `tasks.md` will use.

## Entities

The spec defines 7 entities. Their data shapes:

### MIT License

| Field | Value |
|---|---|
| File | `LICENSE` (top-level, no extension) |
| Source | OSI canonical text (research.md § MIT License canonical text) |
| Copyright year | `2026` |
| Copyright holder | `John Goure` |
| Modifications | None (verbatim OSI text) |
| Cross-reference | Mirrored in `package.json`'s `"license": "MIT"` field |

### Constitution (pre-existing — NOT modified)

| Field | Value |
|---|---|
| File | `.specify/memory/constitution.md` (existing) |
| Touched by this feature? | No |
| Referenced from | `CONTRIBUTING.md`, `GOVERNANCE.md`, `README.md` (Project resources section) |
| Authority | Binding technical standard for package decisions |

### Spec Kit workflow

| Field | Value |
|---|---|
| Documented in | `CONTRIBUTING.md` |
| Workflow phases | specify → clarify → plan → tasks → analyze → implement |
| Worked examples linked | `specs/001-*/`, `specs/002-*/`, `specs/003-*/`, `specs/004-*/` |

### Contributor Covenant 2.1

| Field | Value |
|---|---|
| File | `CODE_OF_CONDUCT.md` (top-level) |
| Version | 2.1 (identified in the file footer) |
| Source | `https://www.contributor-covenant.org/version/2/1/code_of_conduct/` |
| Enforcement contact | `conduct@tallyrow.com` (filled into `[INSERT CONTACT METHOD]` placeholder) |
| Modifications | Only the enforcement-contact placeholder is filled; body text verbatim |

### GitLab issue / MR template

| Type | Path | Purpose |
|---|---|---|
| Bug | `.gitlab/issue_templates/Bug.md` | Structured bug report prompts |
| Feature | `.gitlab/issue_templates/Feature.md` | Feature request prompts (constitution-aware) |
| Security | `.gitlab/issue_templates/Security.md` | Redirect to private channel |
| MR Default | `.gitlab/merge_request_templates/Default.md` | Structured MR body with DCO checklist |

### Migration note (preserved from feature 003)

| Field | Value |
|---|---|
| Pre-feature location | `README.md` lines 11-40 directly under H1 (branch `003-rename-safesignal`) |
| Post-feature location | `README.md` `## Migration history` section (deeper in the file) |
| Content modification | None — body identical; only the H2 heading changes and a 1-2 line intro is added |
| Front-matter pointer | A single sentence after install/quickstart linking to `#migration-history` |
| Required elements preserved | (A) legacy name, (B) new name, (C) install one-liner, (D) import find-and-replace, (E) subpath continuity, (F) rename version, (G) behavior-preservation statement (per feature 003's `contracts/migration-note.md`) |

### README first scrollable screen

| Section | Lines | Content |
|---|---|---|
| H1 | Line 1 | `# SafeSignal` |
| Value proposition | Lines 3–6 | One-sentence what + 1-2 sentences positioning |
| H2 "Why SafeSignal" | Lines 8–9 | Section header |
| Differentiator bullets | Lines 10–18 | 4–6 bullets (secure-by-default, never-throw, vendor-neutral, federated-aware, lightweight, structured) |
| H2 "Install" | Lines 20–22 | Section header + `npm install @tallyrow/safesignal` code block |
| Minimal quickstart | Lines 24–30 | `configureLogging` + `createLogger` + `log.info` |

## Per-file content inventory

The tables below enumerate the required content shape for every
new or modified file. Tasks.md uses this as the checklist.

### `LICENSE` (NEW)

| Element | Required content |
|---|---|
| Title | `MIT License` (first line) |
| Copyright line | `Copyright (c) 2026 John Goure` |
| Body | OSI canonical MIT text verbatim (see research.md) |
| Trailing newline | Yes |

### `CONTRIBUTING.md` (NEW)

| Element | Required content |
|---|---|
| H1 | `# Contributing to SafeSignal` |
| Welcome paragraph | Brief — names SafeSignal; thanks contributors; sets tone |
| Section: Code of Conduct | Relative link to `CODE_OF_CONDUCT.md`; statement that contributors must abide |
| Section: Where this project's rules live | Relative link to `.specify/memory/constitution.md`; explains it as the binding technical standard |
| Section: How features get scoped (Spec Kit) | Brief description of the 6-phase workflow (specify → clarify → plan → tasks → analyze → implement); links to `specs/001-*/`, `specs/002-*/`, `specs/003-*/`, `specs/004-*/` as worked examples |
| Section: Filing a bug | Link to the GitLab "New Issue → Bug" template; what to include |
| Section: Proposing a feature | Link to the GitLab "New Issue → Feature" template |
| Section: Reporting a security issue | Cross-reference to `SECURITY.md`; explicit instruction NOT to file public issues for vulnerabilities |
| Section: Opening an MR | Link to the GitLab MR template; brief description of expected sections |
| Section: Developer Certificate of Origin (DCO) | DCO 1.1 text (inline) OR link to `https://developercertificate.org/`; instructions to use `git commit -s`; expected `Signed-off-by:` footer format; statement that MRs without sign-off won't be merged; how to retroactively sign-off (`git commit --amend --signoff` and `git rebase --signoff -i <base>`) |
| Section: Local development setup | High-level (clone, install, build, test); do NOT duplicate README quickstart |
| Footer or link list | Links to LICENSE, GOVERNANCE.md |

### `SECURITY.md` (NEW)

| Element | Required content |
|---|---|
| H1 | `# Security Policy` |
| Section: Reporting a vulnerability | Names `security@tallyrow.com` as the canonical private contact; "DO NOT file vulnerability details in a public GitLab issue"; instruction that the email should include reproduction, impact, suggested fix if available |
| Section: Response timeline | "Acknowledgement within 72 hours; initial assessment within 7 days" |
| Section: Coordinated disclosure | "Fix landed and published before public disclosure, target 90 days from initial acknowledgement, extendable by mutual agreement" |
| Section: Supported versions | Table listing `1.x` as currently supported for security fixes; older/`0.x` versions out of scope |
| Section: Scope | What's in scope (the SafeSignal SDK code, examples, build output); what's out (third-party dependencies — report to those projects directly) |
| Optional: PGP key / GPG fingerprint | If maintainer publishes one; otherwise omit |
| Cross-reference | Link to `CODE_OF_CONDUCT.md` (distinct contact for CoC violations) |

### `CODE_OF_CONDUCT.md` (NEW)

| Element | Required content |
|---|---|
| Source | Verbatim Contributor Covenant 2.1 (markdown form from `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`) |
| Enforcement contact substitution | `[INSERT CONTACT METHOD]` placeholder filled with `conduct@tallyrow.com` |
| Version identifier | "Contributor Covenant version 2.1" referenced in the file (the canonical template includes this; preserve verbatim) |
| Modifications | NONE beyond the contact substitution |

### `GOVERNANCE.md` (NEW)

| Element | Required content |
|---|---|
| H1 | `# Governance` |
| Section: Current state | Identifies sole maintainer (John Goure / GitLab handle `johng`) under TallyRow; acknowledges single-maintainer status as a transitional default |
| Section: Constitution authority | Relative link to `.specify/memory/constitution.md`; explains: constitution is binding technical standard; GOVERNANCE describes how humans make + apply decisions about it |
| Section: Decision authority — MR approval | Currently maintainer approves all MRs. Future: when 2+ regular contributors, adopt CODEOWNERS |
| Section: Decision authority — Constitution amendments | Documented amendment process: a proposed amendment lives in a feature spec → goes through /speckit-clarify + /speckit-plan → constitution gets a version bump (MAJOR/MINOR/PATCH per its own policy). Currently the maintainer ratifies; future state could require multi-contributor approval. |
| Section: Decision authority — npm publish | Maintainer holds npm publish authority on the `@tallyrow/` scope; 2FA enforced. (CI-mediated publish via OIDC is planned in Feature 006.) |
| Section: Decision authority — Security triage | Maintainer triages reports inbound to `security@tallyrow.com`. CoC reports inbound to `conduct@tallyrow.com` triaged by same person. |
| Section: Evolution path | "At 2+ regular contributors: adopt CODEOWNERS for review enforcement. At 5+: formalize a steering group (member list, quorum rules, conflict-resolution process)." Hedged language — these are suggestions, not binding rules. |
| Cross-references | Links to CONTRIBUTING, SECURITY, constitution |

### `.gitlab/issue_templates/Bug.md` (NEW)

| Element | Required content |
|---|---|
| Title (markdown comment / first line) | Optional; GitLab uses the filename `Bug` as the dropdown label |
| Section: Steps to reproduce | Numbered list prompt |
| Section: Expected behavior | Single-line prompt |
| Section: Actual behavior | Single-line prompt + asks for any error messages |
| Section: Package version | Prompt for `npm view @tallyrow/safesignal version` or local `package.json` |
| Section: Browser / runtime | Prompt for browser, OS, Node version (where relevant) |
| Section: Minimal reproduction | Prompt for a runnable snippet or repo link |
| Section: Additional context | Optional free-form |

### `.gitlab/issue_templates/Feature.md` (NEW)

| Element | Required content |
|---|---|
| Section: Consumer use case | Prompt: "What are you trying to accomplish that the current SDK can't do?" |
| Section: Proposed change | Prompt for sketch / API shape |
| Section: Constitution touchpoints | Prompt: "Which of the 7 principles does this touch? Link to `.specify/memory/constitution.md`" |
| Section: Existing API surface impact | Prompt: "Would this change any existing exported symbol, type, or behavior?" |
| Section: Alternatives considered | Optional free-form |

### `.gitlab/issue_templates/Security.md` (NEW)

| Element | Required content |
|---|---|
| ⚠️ Warning banner | At top of template, in bold/blockquote: "DO NOT file vulnerability details in this public issue." |
| Redirect instruction | "Email `security@tallyrow.com`. See `SECURITY.md` for the full disclosure policy." |
| Optional: public-aspect prompt | "If you have a NON-sensitive related question (e.g., 'is the security policy current?'), this template is fine." |
| No vulnerability-detail prompts | The template MUST NOT have form fields for vulnerability details, reproduction, impact — those go in the private email channel only |

### `.gitlab/merge_request_templates/Default.md` (NEW)

| Element | Required content |
|---|---|
| Section: Summary | Free-form short paragraph |
| Section: What changed | Prompt for bulleted list of changes |
| Section: Verification | Prompt: "How did you verify the change works? Tests passed? Manual check?" |
| Section: Test plan | Checklist for reviewer to verify (e.g., "[ ] `npm test` passes"; "[ ] CI green"; "[ ] No bundle-size regression beyond ±1 KiB") |
| Section: Constitution touchpoints | Prompt to identify which constitutional principle(s) the change touches; reference to `.specify/memory/constitution.md` |
| Section: DCO sign-off checklist | Checkbox: "[ ] Every commit in this MR carries a `Signed-off-by:` footer (verify with `git log <base>..HEAD --format=%B \| grep -c 'Signed-off-by:'`)" |
| Optional: Spec Kit linkage | "Related spec (if applicable):" link prompt |
| Optional: Migration note | "Any consumer migration required?" prompt — for non-trivial breaking changes |

### `README.md` (MODIFIED — see migration-note details in research.md)

The README rewrite follows the table in research.md § "README
front-matter best practices." Key non-front-matter modifications:

| Section | Action |
|---|---|
| H1 + first paragraph + Why-SafeSignal + Install + Quickstart | NEW first-30-lines structure (per FR-027) |
| Front-matter pointer to migration history | NEW — single sentence linking to `#migration-history` |
| `## Status` block (currently lines 6-12) | MAY remain but moves below the front matter and below the Project resources section; OR can be removed if SafeSignal-as-product framing makes it redundant; maintainer's call |
| `## What this package gives you` | PRESERVED (or merged into "Why SafeSignal" — content overlaps significantly) |
| `## What this package does NOT do (in v1)` | PRESERVED verbatim (FR-034) — honest scope-setting per Principle V |
| `## Install` | Already exists; preserve but ensure single canonical install command at front matter |
| `## Quickstart` | Already exists; preserve |
| `## Ship logs over HTTPS — ./transport-beacon subpath` | PRESERVED verbatim |
| `## Logging safely` (DO/DON'T) | PRESERVED |
| `## Transport security — body-only, HTTPS, no event data in URLs` | PRESERVED |
| `## Federated / module-federation deployments` | PRESERVED |
| `## Examples` | PRESERVED |
| `## Where to learn more` | EXPANDED into a `## Project resources` section that adds CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, GOVERNANCE, LICENSE links (FR-030) |
| `## Roadmap` (NEW, optional) | Forward-looking section per research.md § "Forward-looking Roadmap content" — names trace-context, OTel, RUM, safesignal-server WITHOUT linking to non-existent URLs |
| `## Migration history` (NEW location for relocated migration note) | Per FR-028; body verbatim from feature 003 |

### `package.json` (MODIFIED — single field added)

| Field | Pre-feature | Post-feature |
|---|---|---|
| `"license"` | (absent) | `"MIT"` |
| All other fields | (existing) | **Unchanged** |

The `license` field is the only modification permitted by FR-038.
No `dependencies`, `devDependencies`, `scripts`, `version`,
`exports`, or any other field changes in this feature.

## Validation rules

These rules are enforced by the Phase 1 contracts. Each is keyed
to one or more spec FRs.

- **R-001 (FR-001, FR-003)**: `LICENSE` exists at repo root,
  contains verbatim OSI MIT text, copyright year `2026`, copyright
  holder `John Goure`.
- **R-002 (FR-002, SC-004)**: `package.json` contains
  `"license": "MIT"`.
- **R-003 (FR-004..FR-009a)**: `CONTRIBUTING.md` exists, contains
  every required section enumerated in the per-file inventory
  above (constitution reference, Spec Kit workflow, issue/MR
  template pointers, CoC reference, DCO documentation, local
  dev setup).
- **R-004 (FR-010..FR-015)**: `SECURITY.md` exists, names
  `security@tallyrow.com`, states response-time and disclosure
  policies, lists `1.x` as supported, redirects public-issue
  reporters away from posting vulnerability details.
- **R-005 (FR-016, FR-017)**: `CODE_OF_CONDUCT.md` exists,
  contains verbatim Contributor Covenant 2.1, names
  `conduct@tallyrow.com` in the enforcement-contact slot,
  identifies version `2.1`.
- **R-006 (FR-018..FR-022)**: `GOVERNANCE.md` exists, identifies
  current maintainer, documents decision authority for the 4
  named domains (MR approval, constitution amendments, npm
  publish, security triage), references the constitution,
  acknowledges sole-maintainer state.
- **R-007 (FR-023..FR-026)**: All 4 GitLab templates exist
  (`Bug.md`, `Feature.md`, `Security.md` in `.gitlab/issue_templates/`;
  `Default.md` in `.gitlab/merge_request_templates/`).
- **R-008 (FR-027)**: README first 30 lines match the structure
  defined in research.md (H1, value prop, Why bullets, install,
  quickstart — no migration content above line 30).
- **R-009 (FR-028, SC-007)**: Migration note body in
  `## Migration history` section equals feature 003's migration
  block content byte-for-byte (per
  [contracts/migration-note-preservation.md](./contracts/migration-note-preservation.md)).
- **R-010 (FR-029)**: README contains a front-matter pointer
  linking to `#migration-history` after the quickstart.
- **R-011 (FR-030)**: README's "Project resources" section links
  to `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`, `LICENSE`.
- **R-012 (FR-034)**: README preserves the "What this package
  does NOT do (in v1)" content (or an equivalent honest-scope
  statement).
- **R-013 (FR-037, FR-044, SC-009)**: `npm test` produces the
  same test count, pass count, todo count, failing count, and
  unhandled count as the pre-feature baseline.
- **R-014 (FR-036)**: No `src/**` file is modified by this
  feature.
- **R-015 (FR-038)**: No `package.json` field is modified except
  the addition of `"license": "MIT"`.

## State transitions

The feature is one-shot — no intermediate states. The repo
transitions from "no legal/community foundation" to "complete
legal/community foundation" within a single feature branch. The
audit (R-001 .. R-015) is the acceptance gate.

The only post-feature "transition" is the public-facing one: a
new visitor's first encounter with the repo now starts with a
value-proposition front matter instead of a migration block.
