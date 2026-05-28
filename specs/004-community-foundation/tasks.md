---
description: "Task list for the SafeSignal legal & community foundation"
---

# Tasks: Repo Legal & Community Foundation

**Input**: Design documents from `/specs/004-community-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: This feature does NOT add new test files (FR-037 prohibits
test-logic changes; the full suite must pass unchanged per SC-009).
Verification is performed by the four Phase 1 contracts:

- `contracts/file-presence-audit.md` — file existence + content markers (SC-005, FR-041)
- `contracts/readme-front-matter.md` — README first-30-lines structure (SC-001, FR-027/029/030)
- `contracts/migration-note-preservation.md` — byte-level diff vs. feature 003 source (SC-007, FR-028)
- `contracts/test-suite-invariance.md` — `npm test` headline counts unchanged (SC-009, FR-044)

**Organization**: Tasks are grouped by user story (US1 first-time
visitor [P1 MVP], US2 contributor experience [P2], US3 security
researcher [P2], US4 governance reader [P3]).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1 / US2 / US3 / US4) on user-story phases
- Include exact file paths in descriptions

## Path Conventions

Single-package TypeScript SDK at repo root. New files land at the
repo root (`LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
`CODE_OF_CONDUCT.md`, `GOVERNANCE.md`) and under `.gitlab/` (issue
+ MR templates). `src/` and `tests/` are NOT touched.

---

## Phase 1: Setup (Capture pre-feature baseline)

**Purpose**: Lock the pre-feature test-suite headline counts so
the Phase 7 invariance contract can verify nothing drifts. Bundle
baseline is not needed (no source/build changes ship in this
feature).

- [ ] T001 Capture pre-feature test-suite baseline: run `npm test` from repo root. Record the headline counts (test files / tests passing / tests todo / tests failing / unhandled errors) into a new file `specs/004-community-foundation/baselines.md` under a "## Pre-feature baseline" section

**Checkpoint**: Baseline committed. US1 can begin.

---

## Phase 2: Foundational

**Purpose**: None required. This feature has no external
prerequisites and no foundational source changes. The 4 user
stories can begin in any order after Setup; US1 is sequenced
first because its README updates establish the link targets that
US2-US4 reference, but US2/US3/US4 can technically land before
US1 (the audit doesn't care about file-creation order).

---

## Phase 3: User Story 1 — First-time visitor orients to the project (Priority: P1) 🎯 MVP

**Goal**: A new visitor opens the GitLab project page or the npm
registry page and within 30 seconds identifies (a) what
SafeSignal is, (b) the secure-by-default + vendor-neutral
positioning, (c) the install command, (d) the minimal usage
pattern. The MIT license is unambiguous from `package.json` and
a top-level `LICENSE` file. The feature 003 migration content is
preserved but relocated below the front matter.

**Independent Test**: After this phase, `head -30 README.md`
contains H1 + value proposition + "Why SafeSignal" bullets +
install command + quickstart code block (in that order, no
migration content). `LICENSE` exists at repo root with `John
Goure` as copyright holder. `package.json` `license` field reads
`"MIT"`. The `## Migration history` section in the README
contains the verbatim feature 003 migration block.

### Implementation for User Story 1

- [ ] T002 [P] [US1] Create `LICENSE` at repo root with the verbatim OSI-canonical MIT license text from `research.md` § "MIT License canonical text". Copyright line: `Copyright (c) 2026 John Goure`. No modifications to the OSI text (maps R-001 / FR-001 / FR-003)
- [ ] T003 [P] [US1] Add `"license": "MIT"` field to `package.json` (insert near the `name` / `version` / `description` block; preserve all other fields verbatim per FR-038) (maps R-002 / FR-002 / SC-004)
- [ ] T004 [US1] Rewrite `README.md` per `data-model.md` README inventory and `contracts/readme-front-matter.md` first-30-lines structure: (a) replace lines 1–9 with `# SafeSignal` H1 + 4-6 line value proposition + positioning sentences; (b) add `## Why SafeSignal` (or `## What you get`) section with 4–6 differentiator bullets within first 12 lines; (c) ensure `## Install` + `npm install @tallyrow/safesignal` code block within first 24 lines; (d) ensure `## Quickstart` + minimal `configureLogging` + `createLogger` + `log.info` code block within first 30 lines. Preserve verbatim: `## What this package does NOT do (in v1)` section (FR-034); `## Ship logs over HTTPS — ./transport-beacon subpath`; `## Logging safely` (DO/DON'T); `## Transport security`; `## Federated / module-federation deployments`; `## Examples`. REMOVE the existing `## Where to learn more` H2 — its content (links to constitution, specs, docs/safe-logging.md) consolidates into the new `## Project resources` section created by T007 (FR-031 link targets preserved; just regrouped). The `## Status` block MAY remain but moves below the front-matter and below Project resources. NO migration content above line 30 (maps FR-027 / R-008 / SC-001)
- [ ] T005 [US1] Add a migration-history pointer to `README.md` immediately after the Quickstart block (approximately line 31). Format: a single blockquote or paragraph saying "Previously known as `@your-org/frontend-logging-sdk`? See [Migration history](#migration-history) for the install + import upgrade path." Must link to the `#migration-history` anchor and must mention `@your-org/frontend-logging-sdk` so consumers searching for the legacy string find it within ~32 lines (maps FR-029 / R-010)
- [ ] T006 [US1] Relocate the migration block from `README.md`'s current position (directly under H1 as `## Renamed from \`frontend-logging-sdk\``) to a new `## Migration history` section deeper in the README (placed before the new `## Project resources` section). Replace the H2 heading text from `Renamed from \`frontend-logging-sdk\`` to exactly `Migration history` (no analogous-name variants — the verification contracts grep for the exact heading per the FR-028 tightening). ADD a 1–2 line intro paragraph above the relocated body explaining what the section contains. Body bytes MUST be identical to the source per `contracts/migration-note-preservation.md` (maps R-009 / FR-028 / SC-007)
- [ ] T007 [US1] Add a `## Project resources` section to `README.md` (placed after `## Examples` — REPLACES the removed `## Where to learn more` section that T004 deleted). The section MUST link to all of: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `LICENSE` (the new links from FR-030), AND preserve the existing links from the deleted `## Where to learn more`: `docs/safe-logging.md`, `examples/host-app/`, `examples/federated-module/`, `.specify/memory/constitution.md`, the `specs/` directory (FR-031). The five "new" links don't resolve until US2/US3/US4 land; that's expected — the whole feature ships as one PR (maps FR-030 / FR-031 / R-011)
- [ ] T008 [US1] Preliminary US1-scope audit: run the checks from `contracts/readme-front-matter.md` (9 shell-based checks). Confirm: H1 on line 1, SafeSignal in first 6 lines, "Why SafeSignal" header within first 12 lines, install command within first 24 lines, quickstart import within first 32 lines, NO migration content in first 30 lines, migration pointer present in lines 30–60, `## Project resources` section present, `## What this package does NOT do (in v1)` (or equivalent) preserved. Confirm `LICENSE` exists, contains `Copyright (c) 2026 John Goure`. Confirm `package.json` contains `"license": "MIT"`

**Checkpoint**: US1 complete — README front matter shipped, LICENSE + license-field in place, migration history relocated. MVP shippable.

---

## Phase 4: User Story 2 — Prospective contributor finds a clear path to contribute (Priority: P2)

**Goal**: A prospective contributor reads `CONTRIBUTING.md` and
understands: where the constitution lives + its role, what the
Spec Kit workflow is, where to file bugs / features / security
reports, the MR template's required sections, the Code of
Conduct, and the DCO sign-off requirement (`git commit -s`).

**Independent Test**: After this phase, `CONTRIBUTING.md`,
`CODE_OF_CONDUCT.md`, `.gitlab/issue_templates/Bug.md`,
`.gitlab/issue_templates/Feature.md`, and
`.gitlab/merge_request_templates/Default.md` all exist with the
content elements enumerated in `data-model.md`. The
`file-presence-audit.md` contract's grep markers for these files
all pass.

### Implementation for User Story 2

- [ ] T009 [P] [US2] Create `CONTRIBUTING.md` at repo root per `data-model.md` § "CONTRIBUTING.md (NEW)" inventory. Required sections: H1 `# Contributing to SafeSignal`; welcome paragraph; Code of Conduct section linking to `CODE_OF_CONDUCT.md`; "Where this project's rules live" section linking to `.specify/memory/constitution.md`; Spec Kit workflow section (6 phases: specify → clarify → plan → tasks → analyze → implement) with links to `specs/001-*/`, `specs/002-*/`, `specs/003-*/`, `specs/004-*/` as worked examples; Filing a bug section; Proposing a feature section; Reporting a security issue section (cross-references `SECURITY.md`, explicit "DO NOT public-issue" instruction); Opening an MR section; **DCO section** with verbatim DCO 1.1 text (from `https://developercertificate.org/` per `research.md`), `git commit -s` instructions, expected `Signed-off-by:` footer format, statement that MRs without sign-off won't be merged, retroactive sign-off commands; Local development setup section (clone/install/build/test at high level) (maps FR-004..FR-009a / R-003)
- [ ] T010 [P] [US2] Create `CODE_OF_CONDUCT.md` at repo root per `data-model.md` § "CODE_OF_CONDUCT.md (NEW)" + `research.md` § "Contributor Covenant 2.1 canonical text". Body: verbatim Contributor Covenant 2.1 markdown from `https://www.contributor-covenant.org/version/2/1/code_of_conduct/`. Fill the `[INSERT CONTACT METHOD]` placeholder with `conduct@tallyrow.com`. Preserve the version identifier (`Contributor Covenant version 2.1`) in the canonical footer. NO modifications beyond the contact substitution (maps FR-016 / FR-017 / R-005)
- [ ] T011 [P] [US2] Create `.gitlab/issue_templates/Bug.md` per `data-model.md` § ".gitlab/issue_templates/Bug.md (NEW)". Required sections: Steps to reproduce, Expected behavior, Actual behavior, Package version, Browser/runtime, Minimal reproduction, Additional context (maps FR-023 / R-007)
- [ ] T012 [P] [US2] Create `.gitlab/issue_templates/Feature.md` per `data-model.md` § ".gitlab/issue_templates/Feature.md (NEW)". Required sections: Consumer use case, Proposed change, Constitution touchpoints (with reference to `.specify/memory/constitution.md`), Existing API surface impact, Alternatives considered (maps FR-024 / R-007)
- [ ] T013 [P] [US2] Create `.gitlab/merge_request_templates/Default.md` per `data-model.md` § ".gitlab/merge_request_templates/Default.md (NEW)". Required sections: Summary; What changed; Verification; Test plan (with reviewer checklist items); Constitution touchpoints (reference to constitution); **DCO sign-off checklist** (a checkbox `- [ ] Every commit in this MR carries a Signed-off-by: footer ...`); Optional Spec Kit linkage + migration note prompts (maps FR-026 / R-007)

**Checkpoint**: US2 complete — contributor onboarding path discoverable end-to-end. CONTRIBUTING references constitution + Spec Kit + DCO; CoC ships verbatim; issue + MR templates present.

---

## Phase 5: User Story 3 — Security researcher knows how to report a vulnerability (Priority: P2)

**Goal**: A security researcher discovers a vulnerability, opens
`SECURITY.md`, and finds a private contact (`security@tallyrow.com`),
a response-time policy (72h ack / 7d initial assessment), a
coordinated-disclosure policy (90-day default embargo), a
supported-versions list (`1.x`), and an explicit "DO NOT
public-issue" directive. The GitLab security-report template
redirects them away from public issues.

**Independent Test**: After this phase, `SECURITY.md` exists with
all required content markers (per `file-presence-audit.md`
§ SECURITY.md). `.gitlab/issue_templates/Security.md` exists,
contains the warning banner + redirect to `security@tallyrow.com`,
and has NO form fields for vulnerability details.

### Implementation for User Story 3

- [ ] T014 [P] [US3] Create `SECURITY.md` at repo root per `data-model.md` § "SECURITY.md (NEW)" inventory. Required sections: H1 `# Security Policy`; Reporting a vulnerability (names `security@tallyrow.com` as canonical private contact; "DO NOT file vulnerability details in a public GitLab issue"; describes what the email should include); Response timeline ("acknowledgement within 72 hours; initial assessment within 7 days"); Coordinated disclosure ("fix landed and published before public disclosure, target 90 days from initial acknowledgement, extendable by mutual agreement"); Supported versions (table listing `1.x` as in-scope); Scope (what's in scope: SafeSignal SDK code, examples, build output; out: third-party deps); cross-reference link to `CODE_OF_CONDUCT.md` for CoC violations (distinct concern) (maps FR-010..FR-015 / R-004)
- [ ] T015 [P] [US3] Create `.gitlab/issue_templates/Security.md` per `data-model.md` § ".gitlab/issue_templates/Security.md (NEW)". Required content: bold/blockquote warning banner at top — **"DO NOT file vulnerability details in this public issue."**; redirect instruction to `security@tallyrow.com`; cross-reference to `SECURITY.md`; optional "non-sensitive related question" prompt only. The template MUST NOT contain form fields for vulnerability details, reproduction, impact (maps FR-025 / R-007)

**Checkpoint**: US3 complete — vulnerability disclosure channel discoverable, public-issue path defensively redirected.

---

## Phase 6: User Story 4 — Maintainer / reader understands how decisions are made (Priority: P3)

**Goal**: A reader opens `GOVERNANCE.md` and finds the current
maintainer, decision authority for 4 named domains (MR approval,
constitution amendments, npm publish, security triage), the
relationship to the constitution, and the evolution path as
contributor count grows.

**Independent Test**: After this phase, `GOVERNANCE.md` exists
with all required content markers (per `file-presence-audit.md`
§ GOVERNANCE.md).

### Implementation for User Story 4

- [ ] T016 [P] [US4] Create `GOVERNANCE.md` at repo root per `data-model.md` § "GOVERNANCE.md (NEW)" inventory. Required sections: H1 `# Governance`; Current state (identifies sole maintainer John Goure / GitLab `johng` under TallyRow; acknowledges single-maintainer transitional status); Constitution authority (link to `.specify/memory/constitution.md`; explains constitution as binding technical standard, GOVERNANCE as human-decision process); Decision authority — MR approval (maintainer-only currently; future CODEOWNERS at 2+ contributors); Decision authority — Constitution amendments (amendment process via feature spec + version bump per constitution's own policy); Decision authority — npm publish (maintainer holds rights on `@tallyrow/` scope, 2FA enforced; CI-mediated publish via OIDC planned in Feature 006); Decision authority — Security triage (maintainer triages `security@tallyrow.com` + `conduct@tallyrow.com` reports); Evolution path ("2+ regular contributors → adopt CODEOWNERS; 5+ → formalize steering group" hedged as suggestions); cross-references to CONTRIBUTING, SECURITY, constitution (maps FR-018..FR-022 / R-006)

**Checkpoint**: US4 complete — governance documentation present, legitimacy signal in place.

---

## Phase 7: Polish & Verification

**Purpose**: Run the four acceptance contracts from `contracts/`,
walk the contributor-onboarding quickstart, and write the
final-review record.

- [ ] T017 Run `contracts/file-presence-audit.md` reference script: verify all 9 required files exist (LICENSE, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, GOVERNANCE.md, 3 issue templates, 1 MR template), meet minimum-size guards, and contain every required content marker (full marker list in the contract). Record PASS / FAIL into `specs/004-community-foundation/baselines.md` (maps R-001..R-007 / R-011 / FR-041 / SC-005 / SC-006)
- [ ] T018 [P] Run `contracts/readme-front-matter.md` reference script: verify the 9 checks (H1 on line 1, SafeSignal in first 6 lines, "Why SafeSignal" header within first 12 lines, install command within first 24 lines, quickstart import within first 32 lines, no migration content in first 30 lines, migration pointer present in lines 30–60, `## Project resources` section present, "What this package does NOT do (in v1)" section preserved). Record PASS / FAIL into `baselines.md` (maps FR-027 / FR-029 / FR-030 / FR-034 / R-008 / R-010 / R-011 / R-012 / SC-001)
- [ ] T019 [P] Run `contracts/migration-note-preservation.md` reference script: byte-level diff of the relocated `## Migration history` block body against feature 003's `## Renamed from \`frontend-logging-sdk\`` block body (sourced from the merge-base commit). All 7 required content elements (A-G) present in destination. Record PASS / FAIL into `baselines.md` (maps FR-028 / R-009 / SC-007)
- [ ] T020 [P] Run `contracts/test-suite-invariance.md` reference script: `npm test` produces 48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled — identical to the T001 baseline. Record PASS / FAIL into `baselines.md` (maps FR-037 / FR-044 / R-013 / SC-009)
- [ ] T020a [P] Invariant diff check: verify no source/test/dependency drift by running `git diff --stat master..HEAD -- 'src/**' 'tests/**'` (output MUST be empty — feature ships zero src/ or tests/ changes per FR-036 + FR-037) AND `git diff master..HEAD -- package.json` (output MUST show ONLY the `license` field addition per FR-038). Record outcome into `baselines.md`. Belt-and-suspenders catch for cross-scope edits beyond what `npm test` would detect (maps R-014 / R-015 / FR-036 / FR-038 / FR-039 / FR-040)
- [ ] T021 [P] Quickstart walkthrough validation: walk `specs/004-community-foundation/quickstart.md` end-to-end (10 steps), confirming each verification item holds against HEAD. Record outcome into `baselines.md`
- [ ] T022 Write `specs/004-community-foundation/checklists/final-review.md` recording: (a) the four contracts' PASS / FAIL outcomes (file-presence, README front-matter, migration-note preservation, test-suite invariance) plus T020a invariant diff check, (b) pre-feature vs post-feature test-suite baseline numbers, (c) one-line acceptance statement, (d) confirmation that no source/test/dependency changes shipped. **MR-merge blocker check** (e): verify that BOTH `security@tallyrow.com` AND `conduct@tallyrow.com` are deliverable BEFORE marking the MR ready-to-merge. Verification: (i) `dig MX tallyrow.com` returns at least one MX record; (ii) a test email sent to each address is delivered to the maintainer-owned inbox without bounce. If either address is not yet deliverable, DO NOT merge — the published SECURITY.md naming a non-deliverable address would create a real disclosure-channel gap. Hold the merge until DNS/MX setup completes. Record the deliverability verification (or the open blocker) in this checklist.

**Checkpoint**: All four contracts PASS; quickstart walkthrough green; final-review checklist written. Feature complete and ready for merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup, T001)**: No dependencies. MUST complete first so the test-suite baseline is locked before any file edits.
- **Phase 2 (Foundational)**: Empty — no foundational tasks needed for a doc-only feature.
- **Phase 3 (US1, T002–T008)**: T002 and T003 are [P] (different files: LICENSE + package.json). T004–T007 sequence on `README.md` (same-file edits). T008 is the US1 audit gate and runs last in the phase.
- **Phase 4 (US2, T009–T013)**: All [P] across distinct files (CONTRIBUTING.md, CODE_OF_CONDUCT.md, 3 separate template files). Can run in parallel with US3 and US4.
- **Phase 5 (US3, T014–T015)**: Both [P] across distinct files (SECURITY.md, .gitlab/issue_templates/Security.md). Can run in parallel with US2 and US4.
- **Phase 6 (US4, T016)**: Single task. Can run in parallel with US2 and US3.
- **Phase 7 (Polish, T017–T022)**: Depends on all user stories complete. T018, T019, T020, T021 are [P] read-only verifications. T017 (full audit) and T022 (final-review writeup) sequence at the start and end of the phase.

### User Story Dependencies

- **US1 (P1 MVP)**: Depends on Setup. No dependencies on other user stories. Note: US1's README rewrite includes `## Project resources` section linking to files that land in US2-US4. These are forward links that resolve once those phases complete — no intermediate broken-link state ships externally (the whole feature merges as one PR).
- **US2 (P2)**: Depends on Setup. Independent of US1, US3, US4 — entirely distinct files.
- **US3 (P2)**: Depends on Setup. Independent of US1, US2, US4.
- **US4 (P3)**: Depends on Setup. Independent of US1, US2, US3.

### Within Each User Story

- US1's tasks T004–T007 all edit `README.md` → sequential within the same file
- US2's 5 tasks edit 5 distinct files → fully [P]
- US3's 2 tasks edit 2 distinct files → fully [P]
- US4's 1 task → trivial

### Parallel Opportunities

- **Setup**: T001 stands alone
- **US1**: T002 + T003 are [P] (LICENSE + package.json edits independent); T004–T007 serialize on README.md; T008 is the gate
- **US2**: T009 + T010 + T011 + T012 + T013 are all [P] across distinct files
- **US3**: T014 + T015 are [P] across distinct files
- **US4**: T016 stands alone
- **Polish**: T018 + T019 + T020 + T021 are [P] read-only checks; T017 first, T022 last

### Parallel Example: US2

```bash
# All distinct files; safe to run concurrently:
Task: T009 CONTRIBUTING.md
Task: T010 CODE_OF_CONDUCT.md
Task: T011 .gitlab/issue_templates/Bug.md
Task: T012 .gitlab/issue_templates/Feature.md
Task: T013 .gitlab/merge_request_templates/Default.md
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) — baseline captured.
2. Complete Phase 3 (US1) — LICENSE, `package.json` license field, README front-matter rewrite, migration relocation, Project resources section (with forward links to US2-US4 files).
3. **STOP and VALIDATE**: T008 preliminary audit confirms README's first 30 lines match the value-proposition contract; `LICENSE` exists with correct copyright; `package.json` license field present.
4. The MVP is shippable here for the consumer-discovery purpose: a new visitor opening the README or `npm view` sees SafeSignal as a clear, MIT-licensed project with a coherent front matter. The Project resources links won't resolve until US2-US4 land, but US2-US4 are part of the same merge — not a separate ship.

### Incremental Delivery

1. Setup → baseline locked
2. US1 → README front-matter rewrite + LICENSE + license field (MVP)
3. US2 + US3 + US4 → all [P]; land in any order
4. Polish → run all 4 contracts + quickstart walkthrough + write final-review

### Single-Developer Linear Strategy

A solo developer runs phases in order with commits after each phase (or after each logical task group). Per the auto-commit-per-task cadence from the user's memory: commit at the end of each task without asking. The `[Spec Kit] T### — <one-line summary>` commit convention from features 001–003 applies.

---

## Notes

- [P] tasks edit different files and have no inter-task dependencies.
- No new test files are added by this feature (FR-037 prohibits test-logic changes). Verification is the four Phase 1 contracts plus the quickstart walkthrough.
- `specs/004-community-foundation/baselines.md` is the scratch file where the agent records pre- and post-feature measurements. It ships with the merge so the audit trail is preserved (same pattern as feature 003).
- Commit after each task or logical group; the `[Spec Kit] T### — <one-line summary>` convention applies.
- T017 (file-presence audit) runs FIRST in Polish because any missing file fails the rest of the polish phase. T022 (final-review) runs LAST as the record-of-record.
- The `tallyrow.com` email aliases (`security@tallyrow.com`, `conduct@tallyrow.com`) MUST be deliverable before this feature merges to `main`. This is a maintainer-side ops action (analogous to feature 003's T003 GitLab slug rename): the maintainer sets up DNS/MX + aliases on the `tallyrow.com` domain; the agent emits the requirement in this task list but cannot perform the DNS work. T022 flags this as a final-review open item if the addresses are not yet deliverable at merge time.
- Avoid: editing `src/**` or `tests/**` (out of scope per FR-036 / FR-037); modifying any `package.json` field other than `license` (out of scope per FR-038); modifying `.specify/memory/constitution.md` (out of scope — this feature references the constitution, does not amend it); deleting or modifying the body of feature 003's migration block (out of scope per FR-028 — only the H2 heading and position change).
