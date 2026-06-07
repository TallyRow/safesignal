# Quickstart & Acceptance Walkthroughs: Distributed-Surface Parity Gate

These walkthroughs are the feature's acceptance "tests" (a packaging-contract feature). Each maps to
a spec User Story / Success Criterion and is runnable locally and in CI with identical outcomes
(Principle IX).

## Prerequisites

```bash
npm ci
npm run build        # npm pack ships on-disk dist/, so build first
```

## Everyday use

```bash
npm run surface:check   # run the distributed-surface parity gate
```

The gate also runs in CI inside the `dependency-pins` job (part of the required `ci-success`
aggregate) and in the release pipeline — a drifted surface can't merge or publish.

---

## Walkthrough 1 — A missing export target is blocked (User Story 1 / SC-001)

1. On a throwaway branch, point an `exports` target at a non-existent file — e.g., edit
   `package.json` so `"./transport-otlp"` `types` reads `./dist/transport-otlp-MISSING.d.ts`.
2. Run `npm run surface:check`.
3. **Expect**: non-zero exit; output lists `dist/transport-otlp-MISSING.d.ts` under "Missing
   target(s)".
4. Revert; re-run → passes.

✅ Pass criteria: a declared target that doesn't ship fails closed, naming the target.

---

## Walkthrough 2 — A stray packaged file is blocked (User Story 1 / SC-002)

1. On a throwaway branch, widen `package.json` `files` to `["dist", "src"]` (so `src/**` would be
   packaged).
2. Run `npm run surface:check`.
3. **Expect**: non-zero exit; output lists one or more `src/...` paths under "Stray file(s)".
4. Restore `files` to `["dist"]` → passes.

✅ Pass criteria: any packaged file outside `dist/` + npm metadata fails closed, naming the stray
file.

---

## Walkthrough 3 — Normal build output is not flagged (edge case / FR-006)

1. On a clean, built tree, run `npm run surface:check`.
2. **Expect**: pass — despite `dist/` containing source maps, `.d.cts` declarations, and the shared
   `dist/types-*.d.ts` chunk that no `exports` key names directly. They are in-surface (under
   `dist/`), so the gate does not false-positive.

✅ Pass criteria: legitimate `dist/` resolution-support files never count as stray.

---

## Walkthrough 4 — Subpath ↔ docs parity (User Story 3 / SC-004)

1. On a throwaway branch, add an undocumented `exports` key — e.g. `"./experimental": {...}` —
   without updating `contracts/distributed-surface.md`/the documented set.
2. Run `npm run surface:check`.
3. **Expect**: non-zero exit; "Subpath drift: undocumented exports key './experimental'".
4. Remove it (or, for an intentional new subpath, update the documented contract) → passes.

✅ Pass criteria: the shipped subpath set must match the documented public-subpath set, both ways.

---

## Walkthrough 5 — Honest prerequisite (Principle IX)

1. Remove the build output (`rm -rf dist`) and run `npm run surface:check`.
2. **Expect**: a loud, actionable failure telling you to `run npm run build` first — never a silent
   pass.
3. `npm run build` and re-run → passes.

✅ Pass criteria: the gate fails loudly when its prerequisite is missing.

---

## Walkthrough 6 — Local and CI verdicts match (User Story 2 / SC-003)

1. For any branch above, note `npm run surface:check`'s exit code locally.
2. Push and read the `dependency-pins` CI job result for the identical commit.
3. **Expect**: identical pass/fail verdict and the same drift list.

✅ Pass criteria: zero environment-dependent divergence (`npm pack --dry-run` is deterministic and
network-free).

---

## Walkthrough 7 — Rule is traceable to its check (User Story 3 / SC-005)

1. From `CONTRIBUTING.md`'s distributed-surface parity section, follow the enforcement reference.
2. **Expect**: it resolves in one hop to `npm run surface:check` /
   `tests/contract/distributed-surface.contract.test.ts` (the `dependency-pins` job) /
   `contracts/distributed-surface.md`.

✅ Pass criteria: a contributor can trace the documented rule to its automated check.
