# Implementation Plan: Enforce Deprecate-Before-Remove for the Public API

**Branch**: `011-deprecate-before-remove` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-deprecate-before-remove/spec.md`

## Summary

Close the Principle X enforcement gap that constitution v1.4.0 opened for Principle II's
deprecation clause (the named TODO in `constitution.md` lines 66–76, filed as issue #5):
make **deprecate-before-remove mechanically enforced** for the public API.

Concretely: add a **public API surface extractor** (a Node script using the already-present
`typescript` compiler API — **no new dependency**) that reads the built `dist/*.d.ts` for all
four `exports` entry points and produces a deterministic JSON snapshot of every exported
symbol with its kind, normalized signature, and `@deprecated` status. Commit a baseline
snapshot (`api/surface.json`) representing the **last published release's** surface. A new
**fail-closed gate** (a cross-platform Node entrypoint `scripts/api/check-surface.mjs`, runnable
locally and in CI via one `npm` script — no Bash wrapper) rebuilds the current surface and
compares it to the frozen baseline: a removed or incompatibly-changed public symbol passes
**only** if it was `@deprecated` in the baseline (a backward-compatible signature change clears
via a one-time reviewed acknowledgment, not a deprecation cycle).
Wire the gate into the `ci-success` aggregate so an undeprecated breaking change cannot merge,
and add a **release-time freshness check** plus a documented `Cutting a release` step that
refreshes the snapshot so each published version becomes the next baseline. No `src/`,
runtime, `Logger`, `exports`, or packaged-surface change; `api/` is not in `files`, so nothing
new ships to consumers.

## Technical Context

**Language/Version**: TypeScript 5.4+ (already in repo); the extractor is a Node ESM script
(`"type": "module"`, Node ≥18) using the bundled `typescript` compiler API.

**Primary Dependencies**: **No new runtime or dev dependency.** Reuses `typescript` (compiler
API for `.d.ts` symbol enumeration + JSDoc tag reads) and `tsup` (existing build emits
`dist/*.d.ts` via `dts: true`). The extractor and gate are **Node ESM** modules run by the
bundled Node (≥18) — a cross-platform entrypoint with no Bash wrapper, so local outcomes match CI
on Windows/macOS/Linux. Each `.mjs` tooling module ships a hand-authored sibling `.d.mts` so the
TypeScript contract tests import it typed (no `allowJs` needed; `typecheck:tests` stays green).
Deliberately **rejects** `@microsoft/api-extractor` (see research.md) to honor minimal-dependency
design (Principle VI).

**Storage**: A committed, version-controlled JSON baseline (`api/surface.json`) plus an
optional reviewed override file (`api/surface-allow.json`). No runtime storage; no network.

**Testing**: Vitest contract test(s) under `tests/contract/` proving the gate's verdict logic
(removal fails closed, baseline-deprecated removal passes, addition passes, signature change
fails unless allowed) against fixture surfaces; the gate script itself is the integration-level
check, exercised in CI and reproducibly locally. Acceptance is by `quickstart.md` walkthroughs.

**Target Platform**: GitHub Actions CI (`ci.yml` PR/main gate, `release.yml` tag pipeline) +
contributor workstations. No browser/runtime target — this is build/CI/docs tooling.

**Project Type**: Reusable browser package — but this feature is **release-engineering /
contract-enforcement tooling**, not package code.

**Performance Goals**: N/A (no runtime). The gate runs in CI in seconds over four small
`.d.ts` files; the surface is tiny (≈8 root runtime exports + types + 2 transport factories +
testing helpers).

**Constraints**: No `src`/`exports`/runtime change; the gate is a cross-platform Node entrypoint
(`npm run api:check`) so local outcomes match CI on every OS (including the Windows dev platform);
the release-freshness step reuses the existing `CI_*` env conventions (`CI_COMMIT_TAG`,
`CI_DEFAULT_BRANCH`) where it needs the tagged commit; identical local/CI outcome (Principle IX);
network-free and deterministic;
the baseline artifact MUST NOT ship in the published tarball (`files: ["dist"]` unchanged);
the gate must fail closed and reference its own enforcement (Principle X).

**Scale/Scope**: 1 extractor script, 1 gate script, 1 npm-script pair (`api:extract`,
`api:check`), 1 committed baseline (+ usually-empty allow file), 1 new `ci.yml` job added to
`ci-success`, 1 `release.yml` freshness step, 1 contract test, doc updates to `CONTRIBUTING.md`
+ a constitution/CONTRIBUTING enforcement-reference line. ~4 spec artifacts here.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.4.0** (principles I–XI). This feature is the
> remediation named in the constitution's own Sync Impact Report (lines 66–76, item (a)).

- **Spec-Driven Development (NON-NEGOTIABLE, Principle I)** — ✅ Satisfied. This plan follows
  the spec (`/speckit-specify` → this `/speckit-plan`); no production code precedes it; this
  Constitution Check is completed before implementation. Stack/dependency/scope choices are
  justified here and in `research.md`.
- **Stable Consumer API & Deprecation Discipline (Principle II)** — ✅ **This feature is the
  enforcement of Principle II.** It introduces **no** public API/config/type/behavior change of
  its own (the package surface is untouched; `api/` does not ship). It *protects* the safe path
  by making undeprecated breaking removals fail closed. No contract is deprecated or removed by
  this feature.
- **Browser Resilience & Failure Safety (Principle III)** — ✅ N/A. No runtime/`src` code; no
  consumer call path touched.
- **Neutrality & Portability** — ✅ N/A for the package. The tooling is a cross-platform Node ESM
  entrypoint (`npm run api:check`), portable across CI and the Windows/macOS/Linux dev
  environments without a Bash dependency; no framework/vendor coupling.
- **Framework-Neutral Structured Observability (Principle IV)** — ✅ N/A. No event model,
  level behavior, wire format, or serialization change.
- **Secure & Privacy-Safe Logging by Default (Principle V)** — ✅ N/A to logging behavior.
  Security-relevant only in that the snapshot/allow artifacts and gate output MUST contain
  **only public type/symbol names and signatures** — no secrets, tokens, or consumer data —
  and the extractor MUST NOT embed absolute source paths or environment values (FR-013).
- **Testable, Minimal, Maintainable Package Design (Principle VI)** — ✅ Applies, satisfied.
  **No new dependency** (compiler API reused; api-extractor rejected for weight). The gate logic
  is covered by a contract test held to the same TS/lint standards as `src/`. The public surface
  is unchanged and the new tooling is small and self-contained.
- **Log Integrity & Monitoring Suitability (Principle VII)** — ✅ N/A. No event production.
- **Lightweight Logger Instances & Federated Runtime (Principle VIII)** — ✅ N/A. No
  logger/runtime code; no construction-path change.
- **Reproducible Verification (Principle IX)** — ✅ Applies, central to the design. The gate is
  invokable through one documented `npm run api:check` that yields the **same exit code locally
  and in CI** for the same source state. Prerequisite honesty: the gate requires built
  `dist/*.d.ts`; the CI job consumes the existing build artifact (as other jobs do) and the
  local script fails loudly with an actionable "run `npm run build` first" message when `dist/`
  is absent — it never silently passes. Determinism: sorted symbols + stable JSON formatting +
  network-free reads. Runner reconciliation: the TS contract tests import the Node ESM tooling via
  hand-authored sibling `.d.mts` declarations, so `tsc --noEmit -p tests/tsconfig.json` resolves
  them typed and Vitest and `tsc` agree on the same source (no `allowJs`, no per-runner skip).
  Test code under `tests/` is held to `src/` standards; no tolerated relaxation is introduced.
- **Mechanical Enforcement of Documented Contracts (Principle X)** — ✅ **This feature is the
  mechanical enforcement.** It converts a documented-but-unenforced gate (deprecate-before-remove)
  into a fail-closed CI check, closing the constitution's own follow-up TODO. The gate is wired
  into `ci-success` (so it gates merge), references its own enforcement mechanism in
  `CONTRIBUTING.md` (discoverability; the constitution's generic Principle X reference already
  covers it, so a constitution edit is an optional patch-level refinement — FR-011), and its
  removal is itself documented in `CONTRIBUTING.md` as subject to the amendment process (FR-012).
  No *new* documented gate is left unenforced; any
  capability deferred from v1 (see Complexity Tracking) is filed as a named, time-bound task.
- **Supply-Chain Integrity & Verifiable Provenance (Principle XI)** — ✅ Touches the release
  pipeline and CI but **preserves** every supply-chain gate: attested OIDC publish, signed tags,
  DCO, dependency pins all unchanged; **no new dependency** enters the build. The **distributed
  surface is unchanged** — `files: ["dist"]` means `api/surface.json` is *not* packaged, so what
  ships still matches `exports`/docs. The release freshness check *strengthens* surface honesty
  by asserting the recorded surface matches the tagged build.

**Result: PASS** (constitution v1.4.0 in-tree; no violations). See Complexity Tracking for the
one deliberately-scoped v1 boundary (incompatible-signature classification depth), filed as a
tracked follow-up per Principle X rather than left as an unenforced claim.

## Project Structure

### Documentation (this feature)

```text
specs/011-deprecate-before-remove/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (surface/symbol/snapshot/verdict entities)
├── quickstart.md        # Phase 1 output (acceptance walkthroughs)
├── contracts/
│   ├── api-surface-check.md   # the gate contract (inputs, rule, exit codes, env vars)
│   └── api-surface-schema.md  # the snapshot + allow-file JSON shape
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist
└── tasks.md             # /speckit-tasks output (NOT created here)
```

*No browser data entities; `data-model.md` describes the surface/snapshot/verdict records the
tooling manipulates. `contracts/` documents the gate and snapshot shapes (this project's
"external interface" here is the CI gate contract + the on-disk snapshot format).*

### Repository files affected

```text
New tooling (Node ESM, no new dependency; each .mjs ships a sibling .d.mts so TS tests import typed):
├── scripts/api/extract-surface.mjs (+ .d.mts)  # TS-compiler-API extractor → deterministic surface JSON
│                                                #   (reads dist/*.d.ts for all 4 entry points)
├── scripts/api/compare-surface.mjs (+ .d.mts)  # pure (baseline, current, allow) → GateVerdict
├── scripts/api/check-surface.mjs               # gate entrypoint: honest dist guard, extract, compare,
│                                                #   print verdict, exit 0/1 (cross-platform; no bash wrapper)
├── api/surface.json                            # committed baseline = last published release surface
└── api/surface-allow.json                      # committed, usually []: reviewed compatible-change overrides

package.json (scripts only — no deps):
├── "api:extract": "node scripts/api/extract-surface.mjs"   # regenerate baseline (release step)
└── "api:check":   "node scripts/api/check-surface.mjs"     # run the gate (local + CI; cross-platform)

CI / release wiring:
├── .github/workflows/ci.yml       # NEW job `api-surface` runs `npm run api:check` (needs build
│                                  #   artifact); add to `ci-success` needs[]
└── .github/workflows/release.yml  # NEW step asserting api/surface.json == built surface at the
│                                  #   tagged commit (freshness), alongside changelog-validate

Tests:
└── tests/contract/api-surface-gate.contract.test.ts  # verdict logic over fixture surfaces
                                                       #   (remove/deprecated-remove/add/change + edge cases)

Docs:
└── CONTRIBUTING.md   # "Cutting a release" gains `npm run api:extract` + clear-allow-list step;
                      #   new "Deprecating a public symbol" subsection with the enforcement reference
                      #   (Principle II/X → npm run api:check / `api-surface` CI job / contract) and the
                      #   gate-removal-is-an-amendment note (FR-011, FR-012)

Preserved UNCHANGED (non-regression):
├── src/**, tests/** runtime behavior, dist exports   # no public API change
├── package.json "exports" / "files" / "main"/"module"/"types"   # distributed surface unchanged
└── existing scripts/ci/*.sh, renovate.json, contract tests       # untouched
```

**Structure Decision**: Build/CI/release tooling + a committed contract baseline + docs. No
source-tree change; the package layout and the four `exports` entry points are untouched.

## Approach & sequencing

1. **Extractor first** (`scripts/api/extract-surface.mjs`) — pure function from `dist/*.d.ts`
   to a deterministic surface JSON; unit-testable in isolation, unblocks everything else.
2. **Seed the baseline** — build at the current released state and run `api:extract` to write
   `api/surface.json` (the v1.3.0 surface) + an empty `api/surface-allow.json`.
3. **Gate entrypoint** (`scripts/api/check-surface.mjs`, Node ESM) — guard the honest `dist/`
   prerequisite in-process, run the extractor on the current build, diff vs `api/surface.json`
   (minus `api/surface-allow.json`), apply the rule, print a verdict table, exit non-zero on
   violation. Cross-platform; invoked by `npm run api:check` locally and in CI (no Bash wrapper).
4. **Contract test** — assert the verdict logic against fixture baselines (no reliance on the
   live surface), so the rule is enforced independently of the current package shape.
5. **CI wiring** — add the `api-surface` job to `ci.yml` and to the `ci-success` `needs[]` so an
   undeprecated breaking removal cannot merge.
6. **Release wiring + runbook** — add the freshness assertion to `release.yml` and document the
   `npm run api:extract` + clear-allow-list step in `CONTRIBUTING.md § Cutting a release`, so
   each published version refreshes the baseline. Add the rule→check enforcement reference and the
   gate-removal-is-an-amendment note in `CONTRIBUTING.md` (the constitution edit is optional —
   FR-011).

All in-repo edits land via a single PR gated by `ci-success` (which now includes `api-surface`).

## Complexity Tracking

> One deliberately-scoped v1 boundary, filed (not waived) per Principle X.

| Item | v1 decision | Why / follow-up |
|------|-------------|-----------------|
| Depth of "incompatible change" classification | v1 enforces **symbol presence** (removal/rename) as a hard fail-closed gate, and treats any **signature-string change** on a non-deprecated symbol as failing unless covered by a reviewed `api/surface-allow.json` entry. It does **not** ship a full structural type-compatibility engine that auto-distinguishes compatible widenings from breaks. | Removal is the unambiguous, highest-value case from issue #5 ("a symbol disappears") and is fully enforced. Auto-classifying compatible-vs-incompatible *signature* changes requires a type-compat analyzer; building one in v1 would add weight for a rare case on a tiny surface. The conservative default (fail unless deprecated **or** explicitly review-acknowledged) is fail-closed and constitution-aligned. **Follow-up (named, time-bound):** a tasks.md item to evaluate automated structural compatibility classification (or adopt one) — deadline set in tasks.md — so the allow-list override can shrink. This keeps the documented gate enforced today while the refinement is tracked, not assumed. |
