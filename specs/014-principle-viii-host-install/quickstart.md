# Quickstart & Acceptance Walkthroughs: Principle VIII Host-Install Clarification (G1)

This is a **governance + documentation** feature, so acceptance is by **review against the amendment
contract** (`contracts/amendment-contract.md`), not by running code. Each walkthrough maps to a spec
User Story / Success Criterion and is checkable by reading the amended artifacts.

## Prerequisites

```bash
# No build/test needed — this feature changes only governance/docs prose.
git diff --stat   # used in Walkthrough 5 to prove the empty code diff
```

---

## Walkthrough 1 — Principle VIII permits the host install AND keeps the per-Logger ban (US1 / SC-001)

1. Open `.specify/memory/constitution.md` → Principle VIII.
2. **Expect**: a clause "Explicit host-level global install (opt-in)" stating the install is
   single / opt-in / host-owned / explicitly-named / fail-safe / fail-closed (contract C1).
3. **Expect**: the same principle (and § Logger construction constraints) still bans per-`Logger`
   global side effects, with a scope note clarifying the bans are per-instance (contract C2).

✅ Pass criteria: both the allowance and the retained per-`Logger` ban are present and citable.

---

## Walkthrough 2 — The #13 Constitution Check has no contradiction (US1 / SC-002)

1. Re-read the (parked) #13 global-capture spec's G1 dependency and imagine its `/speckit-plan`
   Constitution Check against Principle VIII.
2. **Expect**: it can cite the new host-install allowance directly; the previously-apparent conflict
   ("Principle VIII forbids global listeners") is gone.

✅ Pass criteria: a reader can map #13's host-level install onto the amended Principle VIII with no
unresolved contradiction.

---

## Walkthrough 3 — README states the honest stance (US2 / SC-003)

1. Open `README.md` → the feature bullet (~line 17) and "What this package does NOT do" (~lines
   51–53).
2. **Expect**: no unqualified "does not install global listeners" claim; instead, "the core never
   touches globals; an opt-in subpath may, with explicit host ownership," and view-tracking/
   web-vitals/network remain out of scope (contract C3).

✅ Pass criteria: the README distinction is present and consistent with the roadmap.

---

## Walkthrough 4 — The amendment is itself compliant (US3 / SC-004)

1. Open `.specify/memory/constitution.md` → version line and the top Sync Impact Report.
2. **Expect**: version bumped `1.4.0 → 1.5.0`, Last Amended date updated, and the Sync Impact Report
   records the reason, the modified principle, and the synced-artifact list (constitution + README
   edited; templates reviewed-consistent) (contract C4).

✅ Pass criteria: the amendment followed the constitution's own Governance process.

---

## Walkthrough 5 — Zero code/runtime change (US3 / SC-005)

1. Run `git diff --stat` for the change set.
2. **Expect**: only `.specify/memory/constitution.md` and `README.md` (plus this feature's `specs/…`
   docs) appear — **no** `src/`, `tests/`, `package.json`, or build file.

✅ Pass criteria: the installed package is byte-unchanged; every existing `ci-success` check passes
unchanged.

---

## Walkthrough 6 — The per-Logger ban is unchanged (SC-006)

1. Diff the § Logger construction constraints banned-items list against the pre-amendment version.
2. **Expect**: every banned per-instance item is still listed and banned; only a scope **note** was
   appended (nothing removed or weakened).

✅ Pass criteria: no per-`Logger` prohibition was relaxed.
