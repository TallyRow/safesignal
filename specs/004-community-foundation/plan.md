# Implementation Plan: Repo Legal & Community Foundation

**Branch**: `004-community-foundation` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-community-foundation/spec.md`

## Summary

Establish the legal and community foundation for SafeSignal: an MIT
`LICENSE` (copyright holder `John Goure`), a `CONTRIBUTING.md` that
references the constitution + Spec Kit workflow + DCO sign-off
requirement, a `SECURITY.md` with vulnerability disclosure policy
keyed off `security@tallyrow.com`, a `CODE_OF_CONDUCT.md`
(Contributor Covenant 2.1, enforcement contact
`conduct@tallyrow.com`), a `GOVERNANCE.md`, GitLab issue + MR
templates that encode the project's MR structure including a DCO
sign-off checklist, and a `README.md` rewrite that leads with the
value proposition while relocating feature 003's migration note to
a clearly-labeled `## Migration history` section. The `package.json`
`license` field is added (`"MIT"`).

This is a **documentation-and-metadata-only feature**. No runtime
code, no test logic, no public API surface, no dependency, no
`exports` map shape change. The full test suite passes unchanged
post-feature. Bundle invariance is automatic (no source touched).

Verification is file-existence + content-shape audits (every new
file is present, contains the required content elements, and the
README's first 30 lines match the value-proposition contract).

## Technical Context

**Language/Version**: N/A — feature ships markdown files + a single
`package.json` field addition. No TypeScript or runtime code touched.

**Primary Dependencies**: None added. `package.json` `dependencies`
and `devDependencies` blocks are preserved verbatim (FR-038).

**Storage**: N/A.

**Testing**: Vitest + happy-dom (existing). Full suite must pass
unchanged (FR-037, FR-044, SC-009). No new test files. Verification
runs as a small shell-based audit (file existence + grep for
required content markers) — same shape as feature 003's audit
contract. The audit can be a one-shot script or inlined in the
Polish task; no test-framework integration required.

**Target Platform**: Browser SDK (unchanged — repo identity only).

**Project Type**: Reusable frontend package + supporting repo
metadata. The new files (`LICENSE`, `CONTRIBUTING.md`, etc.) are
repo-level metadata, not consumer-runtime artifacts.

**Performance Goals**: N/A for runtime. Documentation budget: the
README MUST stay under ~600 lines per the spec edge case.

**Constraints**:

- The constitution at `.specify/memory/constitution.md` is NOT
  modified by this feature (per FR-040's spirit — no runtime,
  redaction, or transport guarantee changes; the constitution
  governs those). This feature REFERENCES the constitution from
  CONTRIBUTING + GOVERNANCE; it does not amend it.
- The README rewrite preserves feature 003's migration-note content
  verbatim (FR-028, SC-007). Only its position moves.
- No `src/**` or `tests/**` changes (FR-036, FR-037).
- `package.json` change is limited to the `license` field addition
  (FR-038, FR-002).

**Scale/Scope**: 8 new files at repo root or under `.gitlab/`, 1
modified file (`README.md`), 1 modified `package.json` field. No
deletions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

This feature is identity- and process-documentation work. No
runtime code, no behavioral change, no security/privacy/integrity
mechanism is touched. Each principle stays intact by construction;
several are operationalized (made enforceable at the inbound layer)
by this feature.

- **API Stability (Principle I)**: No public API surface change.
  No symbol, type, function signature, or behavior added, removed,
  or modified. The new `CONTRIBUTING.md` documents the API
  stability contract for human contributors (it points them at
  the constitution as the binding standard). **PASS — no surface
  touched.**

- **Browser Resilience & Failure Safety (Principle II)**: No
  runtime code change. Fail-closed pipeline, bounded sanitizer,
  URL scrubber, transport security contract all unchanged
  (FR-040). **PASS — no surface touched.**

- **Neutrality & Portability (Principle III)**: Framework-neutral.
  The new files are markdown + JSON, generic across consumers.
  GOVERNANCE.md documents that the constitution remains the
  authoritative neutral standard. **PASS.**

- **Structured Observability (Principle IV)**: Event model and
  level behavior unchanged. The new `SECURITY.md` operationalizes
  Principle IV's "Secure Logging by Default" claim at the
  vulnerability-report intake layer — without a private disclosure
  channel, the non-negotiable security posture is unenforceable in
  practice. **PASS — and Principle IV is strengthened at the
  governance layer.**

- **Secure Logging by Default & Sensitive Data Minimization
  (Principle V — non-negotiable)**: Redaction defaults, sanitizer
  limits, URL scrubber, fail-closed handling all unchanged. The
  feature contributes defensive operational tooling:
  `SECURITY.md`'s private channel for vulnerability reports, the
  Code of Conduct's enforcement channel for community-safety
  reports, and the MR template's DCO sign-off prompt
  (provenance discipline). **PASS — strengthened.**

- **Log Integrity & Monitoring Suitability (Principle VI)**: Event
  production, ordering, dropping, batching, transformation, and
  attribution semantics all unchanged. No transport surface
  modified. **PASS.**

- **Lightweight Logger Instances & Federated Runtime (Principle
  VII)**: No per-`Logger` cost change. No global listener, no
  ambient state read, no network call introduced. Federated
  host/module ownership contract unchanged. **PASS.**

- **Test & Documentation Coverage (Principle VIII)**: No new
  contract / unit / integration / failure / security tests
  required (FR-037 prohibits test-logic changes; the full suite
  passes unchanged per SC-009). New documentation shipping:
  `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`,
  `GOVERNANCE.md`, GitLab templates, and the rewritten `README.md`
  — each is a Principle V deliverable made discoverable. The
  audit contract verifies every artifact exists and contains
  required content. **PASS — and Principle V is operationalized
  at the contributor-facing layer.**

**Initial gate: PASS — zero violations.** Constitution check
re-evaluated post-Phase-1 in a closing gate-check section at the
bottom of this file.

## Project Structure

### Documentation (this feature)

```text
specs/004-community-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 — best practices + content sources
├── data-model.md        # Phase 1 — file inventory + required-content shape per file
├── quickstart.md        # Phase 1 — post-feature contributor onboarding walkthrough
├── contracts/
│   ├── file-presence-audit.md     # SC-005 / FR-041 file-existence audit contract
│   ├── readme-front-matter.md     # SC-001 / FR-043 README first-30-lines content contract
│   ├── migration-note-preservation.md  # SC-007 / FR-028 verbatim-content preservation contract
│   └── test-suite-invariance.md   # SC-009 / FR-044 — same shape as feature 003's contract
├── checklists/
│   └── requirements.md  # Already completed by /speckit-clarify
└── tasks.md             # Created by /speckit-tasks (not by this command)
```

### Source Code (repository root) — files touched by the feature

```text
LICENSE                                # NEW — verbatim MIT license, copyright "John Goure"
CONTRIBUTING.md                        # NEW — references constitution + Spec Kit + DCO
SECURITY.md                            # NEW — vulnerability disclosure policy + security@tallyrow.com
CODE_OF_CONDUCT.md                     # NEW — verbatim Contributor Covenant 2.1, conduct@tallyrow.com
GOVERNANCE.md                          # NEW — solo-maintainer + evolution path
README.md                              # MODIFIED — rewrite, migration note relocates to ## Migration history
package.json                           # MODIFIED — single "license": "MIT" field added
.gitlab/
├── issue_templates/
│   ├── Bug.md                         # NEW — structured bug report prompts
│   ├── Feature.md                     # NEW — feature request prompts (constitution-aware)
│   └── Security.md                    # NEW — redirect-style; sends reporter to security@tallyrow.com
└── merge_request_templates/
    └── Default.md                     # NEW — Summary / What changed / Verification / Test plan /
                                       #       Constitution touchpoints / DCO sign-off checklist
```

**Files NOT touched (preserved boundaries)**:

```text
src/**                                 # FR-036 — no source-code changes
tests/**                               # FR-037 — no test logic changes
.specify/memory/constitution.md        # constitution preserved verbatim; not amended by this feature
dist/**                                # build output; regenerated identically (no source touched)
package-lock.json                      # regenerates on npm install if needed; the single `license`
                                       #   field addition does not affect dependency resolution
examples/**                            # not in scope (no consumer-facing identity references change)
docs/safe-logging.md                   # not in scope (content already SafeSignal-named)
specs/003-rename-safesignal/**         # archival; preserved
```

**Structure Decision**: The repo keeps its existing single-package
TypeScript SDK layout. This feature adds repo-level metadata files
at the root and under `.gitlab/`. No directory restructure, no
source tree changes. The "Source Code" block above enumerates every
file the feature touches; everything else is preserved verbatim.

## Phase 0 — Research

See [`research.md`](./research.md). Phase 0 captures:

1. **MIT license canonical text**: the OSI-approved template +
   year + copyright holder placement. No ambiguity to resolve;
   research records the verbatim text used.
2. **Contributor Covenant 2.1 canonical text**: linked + verbatim.
   Research records the source URL + the exact text version.
3. **DCO (Developer Certificate of Origin) 1.1 text**: linked +
   verbatim. Research records `https://developercertificate.org/`
   as the canonical source.
4. **GitLab issue/MR template directory conventions**:
   `.gitlab/issue_templates/<Name>.md` and
   `.gitlab/merge_request_templates/<Name>.md`. Research records
   the directory layout GitLab expects and the dropdown behavior.
5. **README front-matter best practices**: industry pattern (npm,
   GitHub Trending, popular libraries) for first-30-lines content
   ordering. Research records the pattern adopted.
6. **Migration-note preservation strategy**: the feature 003
   migration block (`README.md:11-40` at HEAD of branch
   `003-rename-safesignal`) is the verbatim source. Research
   records the exact content + the new section header it lives
   under post-rewrite.
7. **Forward-looking Roadmap content**: defines what's allowed to
   appear in the README's Roadmap section (Phase 1–3 of SafeSignal
   SDK per the prior strategic discussion + `safesignal-server`
   mention) and what's not (no commitments to specific features,
   no links to non-existent URLs).

## Phase 1 — Design & Contracts

See [`data-model.md`](./data-model.md),
[`contracts/`](./contracts/), and [`quickstart.md`](./quickstart.md).
Phase 1 captures:

- **data-model.md**: File-by-file inventory of every new or
  modified artifact with its required content shape: section
  headings, required paragraphs, required mentions of constitution
  / Spec Kit / DCO / contacts, link targets, version identifiers.
  This is the authoritative checklist tasks.md uses.
- **contracts/file-presence-audit.md**: SC-005 + FR-041 audit
  contract. Reference shell one-liner that verifies every required
  file exists and has non-trivial content (non-zero size + > 5
  non-blank lines). Pass/fail criteria for the rename feature.
- **contracts/readme-front-matter.md**: SC-001 + FR-043 contract
  for the README's first 30 lines: required ordering (H1, value
  prop, "Why SafeSignal" bullets, install, quickstart), required
  absences (no migration content above line 30), measurable check
  (line count + section heading detection).
- **contracts/migration-note-preservation.md**: SC-007 + FR-028
  contract — the migration note's content from feature 003 is
  preserved verbatim in the relocation. Reference: byte-level diff
  of the relocated block against the feature 003 source must show
  only added section header + identical body.
- **contracts/test-suite-invariance.md**: SC-009 + FR-044 contract,
  same shape as feature 003's `test-suite-invariance.md`. Same
  baseline (48 files / 1,088 passing / 10 todo / 0 failing / 0
  unhandled) since no source/test changes ship.
- **quickstart.md**: Post-feature walkthrough for a new
  contributor — open README, scan first screen, follow Project
  resources links, read CONTRIBUTING, find DCO instructions, file
  a sample issue. This is the "first contributor experience"
  validation script.

After Phase 1 ships, this plan's CLAUDE.md SPECKIT marker updates
to point at `specs/004-community-foundation/plan.md`.

## Phase 2 — Tasks (NOT created by /speckit-plan)

`/speckit-tasks` will produce a `tasks.md` that breaks the work
into file-creation + content-validation tasks grouped by user
story:

- **Phase 1 Setup**: capture pre-feature test-suite baseline
  (single task; bundle baseline irrelevant since no source/build
  changes)
- **US1 (P1)**: LICENSE + `package.json` license field + README
  rewrite + Project resources links — the consumer-discovery and
  legal foundation
- **US2 (P2)**: CONTRIBUTING.md (with DCO documentation) + GitLab
  issue templates (Bug, Feature) + GitLab MR template (with DCO
  checklist) + CODE_OF_CONDUCT.md
- **US3 (P2)**: SECURITY.md + GitLab Security issue template
  (redirect-style)
- **US4 (P3)**: GOVERNANCE.md
- **Polish**: run all 4 contracts (file-presence audit, README
  front-matter, migration-note preservation, test-suite
  invariance) + write final-review record

US2 and US3 can land in parallel (different files); US4 is
independent. US1 should land first because it touches the README
which US2-US4 link into.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Constitution check passes initially and is
re-confirmed at end-of-plan (see "Post-Phase-1 gate" below). Table
omitted.

## Post-Phase-1 Constitution Re-check

The Phase 1 artifacts (data-model.md, contracts/, quickstart.md)
do not introduce any new code, runtime behavior, dependency, or
public interface. They are descriptive verification contracts +
content-shape inventories + a contributor-onboarding walkthrough.
All 7 constitutional principles remain **PASS** after Phase 1
design. No re-evaluation triggered any change to plan.md.
