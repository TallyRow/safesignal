# Implementation Plan: Clarify Principle VIII — Explicit Host-Level Global Install Is Allowed

**Branch**: `014-principle-viii-host-install` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-principle-viii-host-install/spec.md`

## Summary

Roadmap **G1** — the governance prerequisite that unblocks **V1** global error capture (#13). Amend
the constitution's **Principle VIII** to explicitly permit **one** explicit, host-installed,
runtime-level global handler (opt-in, single owner, analogous to `configureLogging()`) while keeping
the per-`Logger` global-side-effect ban verbatim; add a clarifying note to the "Logger construction
constraints" that those prohibitions are scoped to per-`Logger`/per-instance creation (not a
host-level runtime install); bump the constitution version and Sync Impact Report; and reframe the
README's blanket "does **not** install global listeners" wording to "the core never touches globals;
an opt-in subpath may, with explicit host ownership." **Governance + documentation only — no `src`,
`exports`, runtime, build, or test change ships.** The new boundary's mechanical enforcement is
sequenced to the dependent feature (#13/V1), not left unenforced.

## Technical Context

**Language/Version**: N/A for runtime — this feature edits Markdown governance/docs
(`.specify/memory/constitution.md`, `README.md`). No TypeScript/`src` change.

**Primary Dependencies**: None. The change is self-contained governing text + docs.

**Storage**: N/A.

**Testing**: Acceptance is by **review against the amendment contract**
(`contracts/amendment-contract.md`) — the amended text must contain the required clauses, the
per-`Logger` ban must be unchanged, the version/Sync-Impact-Report must be updated, and the code
diff must be empty outside governance/docs. The existing automated gates (`ci-success`) continue to
pass unchanged because no code, test, or build input changes.

**Target Platform**: Repository governance + documentation (no runtime target).

**Project Type**: Reusable browser package — but this feature is **governance/documentation**, not
package code.

**Performance Goals**: N/A.

**Constraints**: Must follow the constitution's own **amendment process** (Governance section:
documented reason, semantic version bump per policy, affected templates/guidance synced in the same
change set, Sync Impact Report updated); MUST NOT change any `src`/`exports`/runtime/build/test;
MUST preserve every per-`Logger` prohibition verbatim; MUST NOT weaken any security/privacy/
integrity/federation guarantee (the permitted install stays opt-in, fail-closed, fail-safe,
host-owned).

**Scale/Scope**: ~1 governing-text amendment (Principle VIII + construction-constraints note),
1 version-line + Sync-Impact-Report update, 2 README spots, a template-consistency review (expected:
no edits — see research). ~4 spec artifacts here.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: this feature is checked against the in-tree **v1.4.0** (the version it
> amends). The amendment itself is performed through the Governance section's amendment process, so
> the change is self-compliant by construction.

- **Spec-Driven Development (NON-NEGOTIABLE, Principle I)** — ✅ Satisfied. Spec → this plan; the
  governing-text edit follows the Spec Kit lifecycle; this Constitution Check precedes implementation.
- **Stable Consumer API & Deprecation Discipline (Principle II)** — ✅ N/A. No API/config/type/
  behavior change; no contract deprecated or removed. A blanket *documentation* claim is narrowed in
  wording, which is not a consumer contract change.
- **Browser Resilience & Failure Safety (Principle III)** — ✅ N/A. No runtime/`src` code. The
  amendment's text *reaffirms* that the future permitted install must be fail-safe.
- **Neutrality & Portability** — ✅ N/A. Governing text only.
- **Framework-Neutral Structured Observability (Principle IV)** — ✅ N/A. No event model change.
- **Secure & Privacy-Safe Logging by Default (Principle V)** — ✅ Preserved. FR-007 requires the
  amendment keep the permitted install bound (in text) to fail-closed redaction and secure-by-default;
  the amendment does not relax any secure-default.
- **Testable, Minimal, Maintainable Package Design (Principle VI)** — ✅ N/A to code. The change is
  minimal governing text; no dependency or surface change.
- **Log Integrity & Monitoring Suitability (Principle VII)** — ✅ N/A.
- **Lightweight Logger Instances & Federated Runtime Discipline (Principle VIII)** — ✅ **This is the
  principle being amended, via its own sanctioned process.** The amendment *adds* an explicit
  host-level carve-out and *preserves* every per-`Logger` constraint verbatim (FR-002). It does not
  remove or weaken the lightweight-`Logger` guarantee; it disambiguates an existing gap.
- **Reproducible Verification (Principle IX)** — ✅ Applies trivially: with no code/test/build change,
  every existing check produces the same outcome locally and in CI. Acceptance of the amendment is by
  documented review against `contracts/amendment-contract.md`.
- **Mechanical Enforcement of Documented Contracts (Principle X)** — ✅ Satisfied via sequencing. The
  amendment introduces a documented boundary ("only an explicit host-level install touches globals").
  Per Principle X's allowance, where a documented gate lacks an automated check it is filed as a
  **named, time-bound remediation** — here the already-filed **#13 (V1)**, which delivers the
  enforcing tests, **with a stated deadline**: the test lands with the `./capture` subpath (no release
  ships `./capture` without it), target **2026-09-01**. No *existing* enforced gate is disabled, and
  the per-`Logger` ban's status is unchanged.
- **Supply-Chain Integrity & Verifiable Provenance (Principle XI)** — ✅ N/A. No change to the
  published package, `exports`, `files`, dependencies, or build; governance/docs files do not ship.

**Result: PASS** (constitution v1.4.0; the amendment is executed through the documented Governance
process; Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/014-principle-viii-host-install/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 output (version level, template-sync review, process path)
├── quickstart.md        # Phase 1 output (review-based acceptance walkthrough)
├── contracts/
│   └── amendment-contract.md   # the exact required clauses/wording the amendment must satisfy
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist
└── tasks.md             # /speckit-tasks output (NOT created here)
```

*No `data-model.md` — this feature has no data entities. The "interface" it changes is governing
text, whose required shape is specified in `contracts/amendment-contract.md`.*

### Repository files affected

```text
Governance (amended):
└── .specify/memory/constitution.md
    ├── Principle VIII (line ~255): ADD the explicit host-level-install allowance clause
    │                               (single, opt-in, host-owned, runtime-level; analogous to
    │                               configureLogging); per-`Logger` ban kept verbatim
    ├── "Logger construction constraints" (line ~437): ADD a clarifying note that the
    │                               global-listener / window.onerror / window.onunhandledrejection
    │                               prohibitions are scoped to per-`Logger`/per-instance creation
    │                               and do not forbid an explicit host-level runtime install
    ├── Sync Impact Report (top comment block): record version change, modified principle, and
    │                               the synced artifacts
    └── Version line (line ~562): bump 1.4.0 → 1.5.0 (MINOR — governance expansion) + Last Amended

Docs (amended):
└── README.md
    ├── line ~17 feature bullet ("no global listeners …"): qualify — core/per-logger never touches
    │                               globals; an opt-in host subpath may
    └── lines ~51–53 ("Install global listeners or singletons …"): reframe to "the core never
                                    touches globals; an opt-in subpath may, with explicit host
                                    ownership (one owner; modules never install)"

Reviewed — expected NO edit (already per-instance-scoped; confirm consistency, FR-006):
├── .specify/templates/plan-template.md   (Lightweight-Logger gate — per-`Logger` phrasing)
├── .specify/templates/spec-template.md   (FR-011 lightweight-logger — per-instance phrasing)
└── .specify/templates/tasks-template.md  (lightweight-logger validation — per-instance phrasing)

Preserved UNCHANGED (non-regression — FR-009):
├── src/**, tests/**, dist, package.json exports/files   # zero code/build/test change
├── GOVERNANCE.md, CONTRIBUTING.md                        # no Principle-VIII global-listener claim found
└── all existing per-`Logger` prohibitions (verbatim)     # FR-002 / SC-006
```

**Structure Decision**: Governance-text amendment + README reframe + a template-consistency review.
No source-tree change; the package is byte-unchanged.

## Approach & sequencing

1. **Author the amendment contract** (`contracts/amendment-contract.md`) — the exact clauses the
   amended Principle VIII and construction-constraints note must contain, the README wording, and the
   version/Sync-Impact-Report requirements. This is the testable target the review checks against.
2. **Amend the constitution** — add the Principle VIII allowance clause + the construction-constraints
   clarifying note; preserve the per-`Logger` ban verbatim; bump version 1.4.0 → 1.5.0; update the
   Sync Impact Report (reason + synced artifacts). (May be executed via `/speckit-implement` or
   `/speckit-constitution`; either follows the Governance process.)
3. **Reframe the README** — the two spots, to the core-vs-opt-in-host distinction.
4. **Template-consistency review** — confirm the plan/spec/tasks templates' lightweight-logger
   language is already per-instance-scoped and consistent with the amendment (expected: no edits);
   record the review outcome so FR-006's "synced artifacts" set is complete.
5. **Verify non-regression** — empty code/test/build diff; existing `ci-success` unaffected.

All in-repo edits land via a single PR; because there is no code change, the PR is gated by the
existing `ci-success` (which passes unchanged) plus human governance review.

## Complexity Tracking

> No Constitution Check violations — none to justify. (The one notable judgment, the MINOR vs PATCH
> version level, is resolved in research.md, not a violation.)

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
