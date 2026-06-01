# Tasks: Clarify Principle VIII — Explicit Host-Level Global Install Is Allowed (G1)

**Input**: Design documents from `/specs/014-principle-viii-host-install/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, contracts/amendment-contract.md ✅, quickstart.md ✅

**Tests**: None. This is a **governance + documentation** change with no machine-checkable invariant
of its own; acceptance is by **review against `contracts/amendment-contract.md`** (the `quickstart.md`
walkthroughs). The new boundary's mechanical enforcement is delivered by the dependent feature #13
(V1), not here.

**Organization**: Tasks are grouped by user story (from spec.md). All tasks land in **one PR / change
set** (the constitution's amendment process requires the amendment and its synced artifacts together).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

Two files actually change: `.specify/memory/constitution.md` (Principle VIII clause + constraints
note + version line + Sync Impact Report) and `README.md` (two prose spots). The plan/spec/tasks
templates are **reviewed for consistency** (expected: no edit — research R3). No `src/`, `tests/`,
`package.json`, or build change.

> Line numbers below are **approximate** (`≈`); the quoted **anchor text** (e.g. "after the
> 'configured once at the runtime/package level' paragraph") is the authoritative locator.

---

## Phase 1: Setup

**Purpose**: None required. The edit target — `contracts/amendment-contract.md` (clauses C1–C5) — was
produced in planning and is the precise specification each task below implements.

> No setup, foundational, or build prerequisite exists for a prose amendment. User-story work begins
> immediately.

---

## Phase 3: User Story 1 — Governance unblocks the V1 global-capture feature (Priority: P1) 🎯 MVP

**Goal**: Principle VIII explicitly permits a single, explicit, host-installed, runtime-level global
handler (opt-in) while keeping the per-`Logger` ban verbatim — so #13's Constitution Check passes
cleanly.

**Independent Test**: Read Principle VIII + § Logger construction constraints after the edit; confirm
both the host-install allowance and the retained per-`Logger` ban are present and citable (quickstart
Walkthrough 1).

### Implementation for User Story 1

- [X] T001 [US1] In `.specify/memory/constitution.md`, amend **Principle VIII** (after the "configured **once at the runtime/package level**" paragraph, ≈ line 275): add the **"Explicit host-level global install (opt-in)"** clause per `contracts/amendment-contract.md` C1 — single / opt-in / host-owned (one owner; modules never install) / explicitly-named / fail-safe / fail-closed, analogous to configuring a transport; and reaffirm that the per-`Logger` prohibitions are unchanged.
- [X] T002 [US1] In `.specify/memory/constitution.md`, append the **scope note** to § Logger construction constraints (Package Architecture Standards, ≈ line 437) per C2: state the prohibitions are scoped to `Logger`-instance creation / per-instance lifecycle and do **not** forbid the host-level runtime install in Principle VIII. Keep the enumerated banned-items list unchanged (nothing removed).

**Checkpoint**: Principle VIII now permits the host install and still bans per-`Logger` globals — #13's Constitution Check has a clean footing.

---

## Phase 4: User Story 2 — Public docs state the honest stance (Priority: P2)

**Goal**: The README replaces its blanket "does not install global listeners" claim with the
core-vs-opt-in-host distinction, consistent with the roadmap.

**Independent Test**: Read the README feature bullet + "What this package does NOT do" section;
confirm the precise stance and no unqualified no-globals claim (quickstart Walkthrough 3).

### Implementation for User Story 2

- [X] T003 [P] [US2] In `README.md`, reframe the **feature bullet** (≈ line 17, "…no global listeners, no ambient state reads…") per C3: the core and `createLogger()` install no global listeners and read no ambient state, **and** note an opt-in host subpath may install a single global handler.
- [X] T004 [P] [US2] In `README.md`, reframe the **"What this package does NOT do"** entry (≈ lines 51–53) per C3: state the core never installs global listeners or reads ambient state; carve the **one opt-in exception** (a host may install a single global **error** capturer via a dedicated subpath — Roadmap — routed through the secure pipeline); keep view-tracking / web-vitals / network instrumentation **out of scope** (not a RUM product).

**Checkpoint**: The README is honest and roadmap-consistent; no blanket no-globals claim remains.

---

## Phase 5: User Story 3 — The amendment is itself compliant and traceable (Priority: P3)

**Goal**: The change follows the constitution's amendment process — version bump, Sync Impact Report,
synced artifacts — and the templates are confirmed consistent.

**Independent Test**: Check the version line + Sync Impact Report and the template review outcome
(quickstart Walkthrough 4).

### Implementation for User Story 3

- [X] T005 [US3] In `.specify/memory/constitution.md`, bump the **version line** `1.4.0 → 1.5.0` (MINOR — research R1) and update **Last Amended** to 2026-06-01, per C4.
- [X] T006 [US3] In `.specify/memory/constitution.md`, update the **Sync Impact Report** (top comment block) per C4: record the version change, the modified Principle VIII (added host-install allowance + constraints scope note), the **synced-artifact list** (constitution + README edited; plan/spec/tasks templates reviewed-consistent, no edit), and the **follow-up** that the new boundary is enforced by #13 (V1) **with a stated deadline** — Principle X requires a *named, time-bound* remediation: the enforcing test lands with the `./capture` subpath (no release ships `./capture` without it), target **2026-09-01** (FR-008).
- [X] T007 [US3] **Template-consistency review** (research R3): verify `.specify/templates/plan-template.md`, `spec-template.md`, and `tasks-template.md` lightweight-`Logger` language is already per-`Logger`/per-instance-scoped and consistent with the amendment. Expected: **no edits**. If any reads as a blanket prohibition, add a minimal scope clarification; otherwise record "reviewed-consistent, no change" in the PR.

**Checkpoint**: The amendment is self-documented and compliant; all touched artifacts are accounted for.

---

## Phase 6: Polish & Validation

- [X] T008 Non-regression — empty code diff (SC-005): confirm `git diff --stat` shows changes only in `.specify/memory/constitution.md`, `README.md`, and this feature's `specs/…` docs — **no** `src/`, `tests/`, `package.json`, or build file. Run `npm run typecheck && npm run lint && npm test` to confirm the existing `ci-success`-equivalent gates pass unchanged (nothing in code changed).
- [X] T009 Per-`Logger` ban non-regression (SC-006): diff the § Logger construction constraints banned-items list against its pre-amendment form; confirm every per-instance prohibition is still listed and banned (only a scope **note** was appended — nothing removed or weakened).
- [X] T010 Review-against-contract (SC-001..SC-004): run `quickstart.md` Walkthroughs 1–6; confirm each `contracts/amendment-contract.md` element (C1–C5) and success criterion is satisfied; record the review in the PR description.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup / Foundational**: none.
- **User Stories (Phases 3–5)**: US1 and US3 both edit `.specify/memory/constitution.md` (sequential
  on that file: add clauses T001/T002 → bump version + Sync Impact Report T005/T006); US2 edits
  `README.md` (independent, [P] vs the constitution work). US3's version/SIR finalize the constitution
  edit, so they come after US1's clause edits.
- **Polish (Phase 6)**: after all edits — verifies non-regression and reviews against the contract.

### User story dependencies

- **US1 (P1)**: the substantive governing-text change. The MVP — by itself it unblocks #13's
  Constitution Check.
- **US2 (P2)**: independent README reframe; can proceed in parallel with US1.
- **US3 (P3)**: the amendment-process finalization on `constitution.md`; sequenced after US1's clause
  edits (same file) and includes the template review.

### Parallel opportunities

- T003 and T004 (US2, `README.md`) are [P] relative to the constitution work (different file). Within
  `README.md` they touch different spots and can be done together.
- The constitution edits (T001, T002, T005, T006) are sequential (same file).
- T007 (template review) is independent and can run any time.

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. T001 + T002 — the Principle VIII allowance clause + constraints scope note.
2. **STOP and VALIDATE**: Principle VIII now permits the host install and keeps the per-`Logger` ban —
   #13's Constitution Check footing is clean. This alone discharges the core of G1.

### Incremental delivery

1. US1 → governing text unblocks V1 (MVP).
2. US2 → README honest stance.
3. US3 → version bump + Sync Impact Report + template review (amendment compliant).
4. Polish → non-regression + review-against-contract.

All tasks land in **one PR** (the amendment and its synced artifacts must travel together).

---

## Notes

- **No code, tests, or build change** — the installed package is byte-unchanged (SC-005). The only
  files that change are `.specify/memory/constitution.md` and `README.md`.
- The per-`Logger` ban is **preserved verbatim**; only a scope note is appended (SC-006).
- The new boundary's automated enforcement is **sequenced to #13 (V1)**, named in the Sync Impact
  Report (Principle X), not implemented here.
- Because this amends the **constitution**, `/speckit-implement` MUST follow the Governance amendment
  process (reason, version bump, Sync Impact Report, synced artifacts in one change set);
  `/speckit-constitution` is an equivalent path.
