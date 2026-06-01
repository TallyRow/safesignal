# Implementation Plan: Enforce Distributed-Surface Parity with exports/docs

**Branch**: `012-distributed-surface-parity` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-distributed-surface-parity/spec.md`

## Summary

Close the Principle X enforcement gap that constitution v1.4.0 opened for Principle XI's
distributed-surface-honesty clause (the named TODO in `constitution.md` lines 66–76, **item b**,
filed as issue #6): make **"what ships matches what is documented/contracted" mechanically
enforced**.

The issue's "first step" investigation is answered: the existing audit does **not** cover this.
`tests/contract/dependency-pins.test.ts` locks the `exports` map *shape* (the four keys + each
`types/import/require` triple) and the bundle-shape tests lock vendor-neutrality/size — but
nothing runs `npm pack`, verifies each `exports`/entry target actually ships, or guards against a
stray/undocumented packaged file.

Concretely: add a **vitest contract test** (`tests/contract/distributed-surface.contract.test.ts`,
**no new dependency**) that runs `npm pack --dry-run --json`, derives the **actual published file
set**, and asserts parity against a documented surface contract: every `exports` subpath target
(plus `main`/`module`/`types`) resolves to a shipped file; no file ships outside the declared
surface (`dist/**` + npm's mandatory `package.json`/`README`/`LICENSE`); and the `exports` key set
equals the documented public-subpath set. Fail closed. Fold it into the existing **`dependency-pins`**
CI job (already in the required `ci-success` aggregate **and** the release pipeline), add a
discoverable `npm run surface:check` entrypoint, and document the gate in `CONTRIBUTING.md`. No
`src/`, runtime, `exports`, or `files` change — the distributed surface itself is untouched; this
only adds verification.

## Technical Context

**Language/Version**: TypeScript 5.4+ (already in repo); the gate is a Vitest contract test
(`tests/contract/*.contract.test.ts`), the house pattern for packaging/shape invariants.

**Primary Dependencies**: **No new dependency.** Uses `npm pack --dry-run --json` (the authoritative
publish file-list, spawned via `node:child_process` — exactly what `npm publish` would ship),
`package.json`'s own `exports`/`files`/`main`/`module`/`types`, and the existing `vitest` runner.
Deliberately avoids `npm-packlist`/`@npmcli/arborist` (a new dependency) in favor of the CLI npm
already provides.

**Storage**: N/A. No committed baseline file is needed — the documented surface contract is the
small, stable enumeration (four subpaths + the in-surface rule) encoded in the test and stated in
`contracts/distributed-surface.md`. (Unlike Feature 011, the surface here is a *bounded rule*, not
a per-symbol snapshot, so no snapshot artifact.)

**Testing**: Vitest contract test asserting the three parity dimensions over real `npm pack`
output; runnable via `npm run surface:check` (new convenience script) and `npm run test:contract`.
Acceptance is by `quickstart.md` walkthroughs.

**Target Platform**: GitHub Actions CI (`ci.yml` PR/main gate, `release.yml` tag pipeline) +
contributor workstations. No browser/runtime target — packaging-contract tooling.

**Project Type**: Reusable browser package — but this feature is **packaging-contract enforcement**,
not package code.

**Performance Goals**: N/A. `npm pack --dry-run` runs in CI in a second over a 29-file package.

**Constraints**: No `src`/`exports`/`files`/runtime change; identical local/CI outcome
(Principle IX); network-free (`--dry-run` does not hit the registry) and deterministic; the test
and contract artifacts do not ship (not under `dist/`); the gate must fail closed and reference its
own enforcement (Principle X). Honest prerequisite: `npm pack` reflects on-disk `dist/`, so the
build must precede the gate — guarded with an actionable message.

**Scale/Scope**: 1 contract test, 1 surface-contract doc, 1 `npm` convenience script, the test
added to the existing `dependency-pins` job in `ci.yml` + `release.yml`, and a `CONTRIBUTING.md`
section. ~4 spec artifacts here.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.4.0** (principles I–XI). This feature is the remediation
> named in the constitution's own Sync Impact Report (lines 66–76, **item b** — the "distributed
> surface matches exports/docs" clause of Principle XI). Feature 011 closed item (a).

- **Spec-Driven Development (NON-NEGOTIABLE, Principle I)** — ✅ Satisfied. Spec → this plan; no
  production code precedes it; this Constitution Check completes before implementation.
- **Stable Consumer API & Deprecation Discipline (Principle II)** — ✅ N/A. No public API/config/
  type/behavior change; no `exports` subpath added or removed. The gate *protects* the surface.
- **Browser Resilience & Failure Safety (Principle III)** — ✅ N/A. No runtime/`src` code.
- **Neutrality & Portability** — ✅ N/A for the package. The test is a plain Vitest spec; `npm pack`
  is platform-neutral.
- **Framework-Neutral Structured Observability (Principle IV)** — ✅ N/A. No event model change.
- **Secure & Privacy-Safe Logging by Default (Principle V)** — ✅ N/A to logging. Security-relevant
  only in that the gate output and contract contain **only file paths and packaging metadata** — no
  secrets/tokens/consumer data (FR-012). By catching stray packaged files, it *reduces* the risk of
  an undocumented (possibly secret-bearing) file shipping.
- **Testable, Minimal, Maintainable Package Design (Principle VI)** — ✅ Applies, satisfied. **No new
  dependency** (`npm pack` + `child_process` + Vitest). The gate is one small contract test held to
  the same TS/lint standards as `src/`. Public surface unchanged.
- **Log Integrity & Monitoring Suitability (Principle VII)** — ✅ N/A. No event production.
- **Lightweight Logger Instances & Federated Runtime (Principle VIII)** — ✅ N/A. No logger/runtime
  code.
- **Reproducible Verification (Principle IX)** — ✅ Applies, central. The gate runs through one
  documented command (`npm run surface:check`, also covered by `npm run test:contract`) with the
  **same exit code locally and in CI**. `npm pack --dry-run --json` is deterministic and
  network-free. Prerequisite honesty: `npm pack` reflects on-disk `dist/`; the test `beforeAll`
  fails loudly with "run `npm run build` first" when `dist/` is absent — never a silent pass (the
  CI `dependency-pins` job already consumes the build artifact). Test code is held to `src/`
  standards; no relaxation introduced.
- **Mechanical Enforcement of Documented Contracts (Principle X)** — ✅ **This feature is the
  mechanical enforcement.** It converts a documented-but-unenforced gate (distributed-surface
  parity) into a fail-closed test, closing the constitution's own follow-up TODO item (b). It is in
  the `dependency-pins` job → the required `ci-success` aggregate (gates merge) and the release
  pipeline (gates publish), references its enforcement mechanism in `CONTRIBUTING.md`
  (discoverability), and its removal is documented as amendment-gated (FR-011).
- **Supply-Chain Integrity & Verifiable Provenance (Principle XI)** — ✅ **This feature strengthens
  Principle XI.** It mechanically asserts the published file set + `exports` map match the
  documented contract. It changes **no** packaging fact (`files`, `exports`, `main`/`module`/`types`
  unchanged), adds **no** dependency, and ships **nothing** new (the test/contract are not under
  `dist/`). Attested OIDC publish, signed tags, DCO, and dependency pins remain intact; the gate now
  *guards* the ship-vs-documented parity those guarantees assume.

**Result: PASS** (constitution v1.4.0 in-tree; no violations; Complexity Tracking empty).

## Project Structure

### Documentation (this feature)

```text
specs/012-distributed-surface-parity/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (surface/target/verdict records)
├── quickstart.md        # Phase 1 output (acceptance walkthroughs)
├── contracts/
│   └── distributed-surface.md   # the documented surface contract (source of truth) + gate rule
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Repository files affected

```text
New:
└── tests/contract/distributed-surface.contract.test.ts   # runs `npm pack --dry-run --json`,
                                                           #   asserts the 3 parity dimensions
    (the documented surface contract lives under specs/, above)

package.json (script only — no deps):
└── "surface:check": "vitest run tests/contract/distributed-surface.contract.test.ts"

CI / release wiring (add the test to the existing packaging-contract job — already in ci-success
and the release pipeline; no new job, no new ci-success entry):
├── .github/workflows/ci.yml       # add the test file to the `dependency-pins` job's `npm test --`
│                                  #   invocation (consumes the existing build artifact)
└── .github/workflows/release.yml  # same addition to its `dependency-pins` job

Docs:
└── CONTRIBUTING.md   # new "Distributed-surface parity" subsection: the rule, the enforcement
                      #   reference (npm run surface:check / the dependency-pins job /
                      #   contracts/distributed-surface.md), and the gate-removal-is-an-amendment
                      #   note (FR-010, FR-011)

Preserved UNCHANGED (non-regression — the whole point):
├── package.json "exports" / "files" / "main"/"module"/"types"   # distributed surface unchanged
├── src/**, dist exports, tests/** runtime behavior              # no change
└── existing dependency-pins.test.ts shape checks, bundle-shape tests   # complemented, not edited
```

**Structure Decision**: A single Vitest contract test + a documented surface contract + docs, folded
into the existing `dependency-pins` packaging job. No source-tree change; the package's `exports`
and `files` are untouched.

## Approach & sequencing

1. **Contract doc first** (`contracts/distributed-surface.md`) — the documented source of truth: the
   four public subpaths, the in-surface rule (`dist/**` + npm-mandatory metadata), and the
   resolution-support categories. Makes the parity comparison real, not a hard-coded guess.
2. **Contract test** (`distributed-surface.contract.test.ts`) — spawn `npm pack --dry-run --json`,
   parse the file list, and assert the three dimensions (every target ships; no stray file; subpath
   set == documented). Honest `dist/` prerequisite guard. Write the failing cases first.
3. **Convenience script + CI/release wiring** — add `surface:check`; add the test to the existing
   `dependency-pins` job in `ci.yml` and `release.yml`.
4. **Docs** — `CONTRIBUTING.md` parity subsection with the enforcement reference and gate-removal
   note.

All in-repo edits land via a single PR gated by `ci-success` (the `dependency-pins` job now includes
the parity test).

## Complexity Tracking

> No Constitution Check violations — none to justify. One deliberate, documented design choice
> (not a violation): the gate is folded into the existing `dependency-pins` job rather than getting
> a dedicated `distributed-surface` CI job (as Feature 011's `api-surface` did). Rationale: that job
> already aggregates the packaging/bundle-shape tests and is already in `ci-success` + the release
> pipeline, so folding in is the minimal, contract-preserving change; a dedicated job would add a
> `ci-success` `needs[]` entry for no extra coverage. A future rename of `dependency-pins` →
> `packaging-contracts` (safe: branch protection requires only `ci-success`) is noted as optional
> polish, out of scope here.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
