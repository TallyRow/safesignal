# Quickstart & Acceptance Walkthroughs: Deprecate-Before-Remove Gate

These walkthroughs are the feature's acceptance "tests" (a documentation/release-engineering
feature). Each maps to a spec User Story / Success Criterion and is runnable locally and in CI
with identical outcomes (Principle IX).

## Prerequisites

```bash
npm ci
npm run build        # produces dist/*.d.ts the gate reads
```

## Everyday use

```bash
npm run api:check    # run the deprecate-before-remove gate against the frozen baseline
npm run api:extract  # (release only) refresh api/surface.json from the current build
```

The gate also runs in CI as the `api-surface` job, included in the required `ci-success`
aggregate — an undeprecated breaking removal cannot merge.

---

## Walkthrough 1 — Undeprecated removal is blocked (User Story 1 / SC-001)

1. On a throwaway branch, delete a non-deprecated public export (e.g., remove `scrubUrl` from
   `src/index.ts`) and `npm run build`.
2. Run `npm run api:check`.
3. **Expect**: non-zero exit; output names `scrubUrl` (`.`) as REMOVED and not excused, with the
   deprecate-before-remove remediation message.
4. Push the branch; **expect** the `api-surface` CI job to fail and `ci-success` to block merge.
5. Restore `scrubUrl`, rebuild, re-run → gate passes.

✅ Pass criteria: the removal fails closed locally and in CI; restoring the symbol clears it.

---

## Walkthrough 2 — Deprecate-then-remove across a release is allowed (User Story 1 / SC-002)

1. **Release N**: add `@deprecated` (with a replacement + migration note) to a public symbol,
   keep it present, ship the release. Cutting the release runs `npm run api:extract`, so
   `api/surface.json` now records that symbol with `deprecated: true`.
2. **Release N+1 cycle**: delete the deprecated symbol and `npm run build`.
3. Run `npm run api:check`.
4. **Expect**: pass — the symbol is REMOVED but excused (`excusedBy: deprecated`) because the
   frozen baseline recorded it `deprecated: true`.

✅ Pass criteria: removal passes with no manual override once the one-minor deprecation window
was honored.

---

## Walkthrough 3 — Additions are always allowed (User Story 1 / edge case)

1. Add a new public export (e.g., a new helper in `src/index.ts`) and `npm run build`.
2. Run `npm run api:check`.
3. **Expect**: pass; the new symbol is reported as ADDED (informational).

✅ Pass criteria: additive changes never require a deprecation step.

---

## Walkthrough 4 — Compatible signature change via reviewed override (Assumptions / R3)

1. Make a backward-compatible signature change to an existing public symbol (e.g., add a trailing
   optional parameter), `npm run build`, run `npm run api:check`.
2. **Expect**: fail — CHANGED, not excused.
3. Add a matching entry to `api/surface-allow.json` (`entry,name,from,to,reason,reviewedBy`).
4. Re-run `npm run api:check`.
5. **Expect**: pass — CHANGED excused by `allow-list`; the override is visible in the PR diff for
   reviewer sign-off.

✅ Pass criteria: compatible changes proceed only through an auditable, reviewed acknowledgment —
never a silent skip, and **never** forced through a deprecation cycle (per FR-005). The deferred
follow-up (T017) will auto-classify provably-compatible changes so even the acknowledgment drops.

---

## Walkthrough 5 — Local and CI verdicts match (User Story 2 / SC-003)

1. For any of the branches above, note `npm run api:check`'s exit code locally.
2. Push and read the `api-surface` CI job result for the identical commit.
3. **Expect**: identical pass/fail verdict and the same offending-symbol list.

✅ Pass criteria: zero environment-dependent divergence.

---

## Walkthrough 6 — Release refreshes the baseline (SC-004 / FR-007)

1. In a release commit, run `npm run api:extract`, commit the refreshed `api/surface.json`, and
   reset `api/surface-allow.json` to `[]`, alongside the CHANGELOG entry.
2. Tag and run the release pipeline.
3. **Expect**: the `release.yml` freshness step passes (committed surface == tagged build's
   surface). Omitting the refresh fails the release with an actionable message.

✅ Pass criteria: no release ships without an updated baseline; each published version becomes the
next comparison reference.

---

## Walkthrough 7 — Rule is traceable to its check (User Story 3 / SC-005)

1. From `CONTRIBUTING.md`'s Principle II/X enforcement reference, follow the link to the
   enforcement mechanism.
2. **Expect**: it resolves in one hop to `npm run api:check` (`scripts/api/check-surface.mjs`) /
   the `api-surface` CI job / `contracts/api-surface-check.md`.

✅ Pass criteria: a contributor can trace the documented rule to its automated check.
