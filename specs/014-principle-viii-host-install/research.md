# Phase 0 Research: Clarify Principle VIII — Explicit Host-Level Global Install Is Allowed

All Technical Context decisions for this governance amendment are resolved below.

## R1. Constitution version level: MINOR (1.4.0 → 1.5.0)

**Decision**: Bump the constitution **MINOR**: `1.4.0 → 1.5.0`.

**Rationale**: The constitution's own versioning policy (Governance section) states *"MINOR for
adding a new principle or **materially expanding governance requirements**"* and *"PATCH for wording
clarifications, typo fixes, or non-semantic refinements."* This amendment **permits a new behavior
class** (a host-level global install) that the text previously left ambiguous-to-forbidden — that is
a material expansion of what governance allows, not a typo/wording fix. It is **not MAJOR** because no
governing principle is removed or redefined incompatibly; the per-`Logger` ban is preserved verbatim.

**Alternatives considered**: **PATCH** — rejected; permitting a new behavior is more than a wording
clarification. **MAJOR** — rejected; nothing is removed or made incompatible (the lightweight-`Logger`
guarantee is untouched).

## R2. Where the allowance goes (placement)

**Decision**: Two edits inside `.specify/memory/constitution.md`:
1. **Principle VIII body** — add an explicit *"Explicit host-level global install (opt-in)"* clause
   after the "configured **once at the runtime/package level**" paragraph (≈ line 275), stating the
   single/opt-in/host-owned/explicitly-named/fail-safe/fail-closed allowance and reaffirming that the
   per-`Logger` ban is unchanged.
2. **§ Logger construction constraints** (Package Architecture Standards, ≈ line 437) — append a
   one-sentence **scope note**: these prohibitions are scoped to `Logger`-instance creation /
   per-instance lifecycle and do **not** forbid the host-level runtime install described in
   Principle VIII.

**Rationale**: Principle VIII already establishes "configure expensive runtime resources once at the
runtime/package level (e.g. `configureLogging()`)"; the host-level global install is the natural
sibling of that, so it belongs in VIII. The construction-constraints list is the *binding enumeration*
the rest of the repo cites, so it must be made unambiguous at the source rather than only in prose.

**Alternatives considered**: A **new principle** — rejected (overkill; this is a clarification within
VIII, not a new governing concern). **README-only** — rejected; the governing text is the source of
the contradiction, so README alone would leave the constitution ambiguous.

## R3. Template-sync review: no template edits required

**Decision**: The plan/spec/tasks templates need **no change**. Their lightweight-`Logger` language is
already scoped to **per-`Logger` / per-instance** construction, which the amendment preserves:
- `plan-template.md` (Lightweight-Logger gate): *"Show that the design does not perform per-`Logger`
  initialization of … global listeners, console patching …"* — per-`Logger`, consistent.
- `spec-template.md` (FR-011): *"keep `Logger` instance creation lightweight and side-effect-free (no
  … global listener, console patch …)"* — per-instance, consistent.
- `tasks-template.md` (validation pass): *"side-effect-free `Logger` construction (no … global
  listener …)"* — per-instance, consistent.

The "synced artifacts" set required by FR-006 is therefore **constitution.md + README.md**, with the
three templates **reviewed and recorded as already-consistent** (no edit).

**Rationale**: Editing already-correctly-scoped templates would add churn and risk implying they were
wrong. Recording the review outcome satisfies the "synced in the same change set" requirement (the
sync is confirmation-of-consistency for the templates, an actual edit for constitution + README).

## R4. Execution path: `/speckit-implement` following the Governance amendment process

**Decision**: Perform the edits in `/speckit-implement`, following the constitution's Governance
amendment process: documented reason, version bump per policy, **Sync Impact Report** updated (top
comment block) with the reason + synced-artifact list, and all affected docs in the **same change
set / PR**. `/speckit-constitution` is an acceptable alternative (it automates template-sync), but the
template review (R3) shows no template edits are needed, so the linear lifecycle path is sufficient.

**Rationale**: Keeps the feature on the same specify → plan → tasks → implement track as its siblings;
the `contracts/amendment-contract.md` is the precise edit target so the implement step is mechanical.

## R5. Enforcement sequencing (Principle X)

**Decision**: The boundary the amendment introduces — *only an explicit host-level install attaches
global handlers; per-`Logger`/module code may not* — is **mechanically enforced by #13 (V1)**, the
already-filed dependent feature, which adds the `./capture` install **and** the test that no
per-`Logger`/non-capture code attaches global listeners. #12 **names** #13 as that enforcement.

**Rationale**: Principle X permits a documented gate to be paired with a *named, **time-bound***
remediation rather than an immediate check, provided it is filed in the change set **with a stated
deadline**. #13 is filed, sequenced next in the roadmap (G1 → V1), and is exactly that enforcement.
The deadline is airtight by construction plus a date: the enforcing test MUST land in the same change
set that adds the `./capture` subpath (no release may ship `./capture` without it), **target
2026-09-01**. No *existing* enforced gate is disabled by #12.

## R6. Non-regression: no code/test/build change; CI unaffected

**Decision**: This feature touches only `.specify/memory/constitution.md` and `README.md` (Markdown
prose). It changes **no** `src`, `tests`, `package.json`, `exports`, or build input, so every existing
`ci-success` check produces an identical result. The README edits are in the **prose** "What this
package does NOT do" list and a feature bullet — **not** inside an embedded code block — so the
README/quickstart embedded-code tests (e.g. `transport-beacon-quickstart`) are unaffected.

**Rationale**: Confirms SC-005 (empty code diff) is achievable and that the amendment cannot
accidentally break a gate. Verified again at implement time.

## Resolved decisions summary

| Topic | Resolution |
|-------|------------|
| Version level | **MINOR** 1.4.0 → 1.5.0 (materially expands governance) (R1) |
| Placement | Principle VIII allowance clause + § construction-constraints scope note (R2) |
| Template sync | No template edits; reviewed-consistent (per-instance-scoped already) (R3) |
| Execution path | `/speckit-implement` via the Governance amendment process (R4) |
| Enforcement (X) | Sequenced to #13 (V1), named in the change set (R5) |
| Non-regression | Prose-only edits; zero code/test/build change; CI unaffected (R6) |
