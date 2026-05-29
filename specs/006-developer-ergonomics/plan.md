# Implementation Plan: Developer Ergonomics & Supply-Chain Hygiene

**Branch**: `006-developer-ergonomics` | **Date**: 2026-05-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-developer-ergonomics/spec.md`

## Summary

Add the automated quality and supply-chain guardrails the live F005 pipeline
does not yet enforce, with **zero change to runtime `src/**` behavior, public
API, or published bundle bytes**. Five increments: (US1) GitLab Secret Detection
+ Dependency Scanning on every MR with a fake-fixture allowlist; (US2) a Biome
lint+format baseline gated in CI; (US3) native `core.hooksPath` pre-commit +
commit-msg(DCO) hooks; (US4) Renovate dependency-update MRs on a weekly schedule
authenticated by a `safesignal`-scoped Project Access Token; (US5) enforce the
**already-present** vitest coverage thresholds as a CI job. All gates are
locally reproducible and follow the existing `.gitlab-ci.yml` conventions.

## Technical Context

**Language/Version**: TypeScript 5.x (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `moduleResolution: Bundler`); Node 20 + 22 in CI.

**Primary Dependencies**: Biome (new, single lint+format devDependency, pinned);
Renovate via GitLab `renovate-runner` template; GitLab-bundled Secret Detection +
Dependency Scanning templates; existing tsup (build), vitest + `@vitest/coverage-v8`
(already present).

**Storage**: N/A (tooling/config only).

**Testing**: Vitest (48 files / 1,088 passing / 10 todo); coverage via v8 with
thresholds already defined in `vitest.config.ts` (90% global; 100% on the four
pipeline-security files). Measured baseline: 95.16% stmts / 95.28% branch /
98.47% funcs / 95.16% lines.

**Target Platform**: GitLab.com CI (`saas-linux-small-amd64`, `node:22-alpine`);
contributor workstations (macOS/Linux/WSL) for local hooks.

**Project Type**: Reusable browser logging package — but this feature is
**CI/tooling/config only**; no package source behavior is added or changed.

**Performance Goals**: Lint/format check completes in seconds locally and in CI;
hooks add negligible commit-time latency (staged-file scope only).

**Constraints**: Test-suite invariance (48/1,088/10/0/0); bundle invariance
(8,162 / 3,101 / 2,724 B gz); OIDC-only npm publish posture preserved; pinned
tool versions for reproducibility (Principle VIII); CI remains authoritative
over opt-in local hooks.

**Scale/Scope**: Single public repo (`tallyrow/safesignal`) on GitLab free tier;
single maintainer + external contributors via MRs.

## Constitution Check

*GATE: evaluated against the governing constitution on `main` — **v1.2.0**
(Principles I–VII). The spec also operationalizes the proposed **v1.3.0**
Principles VIII (reproducible verification) and IX (mechanical enforcement); see
the Dependency note below.*

- **API Stability (I)**: ✅ No consumer-facing API/config/type/behavior touched.
  Changes are limited to `.gitlab-ci.yml`, `biome.json`, `renovate.json`,
  `scripts/hooks/`, `.gitlab/` scanning config, and `package.json` dev
  scripts/devDependencies. The safe path is unchanged.
- **Browser Resilience & Failure Safety (II)**: ✅ No runtime code path changes;
  no new throw/rejection surface in consumer call sites. Formatting-only `src/**`
  edits are behavior-neutral (proven by suite + bundle invariance).
- **Neutrality & Portability (III)**: ✅ No framework/vendor/app assumptions added
  to the package; tooling is dev-time only and does not affect how host apps or
  federated modules consume the package.
- **Secure Logging by Default (IV)**: ✅ **Net improvement** — Secret Detection +
  Dependency Scanning add proactive protection. No default is downgraded. The one
  new credential (Renovate Project Access Token) is `safesignal`-scoped,
  non-publish, masked; npm publish stays OIDC-only.
- **Log Integrity & Monitoring Suitability (VI)**: ✅ No event production changes.
- **Lightweight Logger & Federated Runtime (VII)**: ✅ No per-`Logger` cost change;
  no runtime resource added.
- **Testable, Minimal, Maintainable (V)**: ✅ New gates are themselves tests
  (lint/format/scan/coverage), each locally reproducible; CONTRIBUTING +
  quickstart updated for the hook opt-in and the Biome workflow. Biome is a single
  pinned devDependency (minimalism).

**Gate result: PASS** (no violations; Complexity Tracking empty).

**Dependency note (not a violation)**: the spec cites constitution **v1.3.0**
(Principles VIII/IX), but `main` carries **v1.2.0**; the v1.3.0 amendment is on
the unmerged `constitution-v1.3.0` branch. F006 is fully compatible with v1.2.0
and *operationalizes* VIII/IX. Ratifying v1.3.0 (merging that branch) is a
recommended soft prerequisite so the spec's principle citations resolve, but it
does not block F006 implementation.

## Project Structure

### Documentation (this feature)

```text
specs/006-developer-ergonomics/
├── plan.md              # This file
├── research.md          # Phase 0 — tooling decisions + rationale
├── data-model.md        # Phase 1 — config artifacts + their shapes
├── quickstart.md        # Phase 1 — contributor workflow
├── contracts/
│   └── quality-gates.md # Phase 1 — gate behavior contracts
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
.gitlab-ci.yml                 # extend: include scanning templates + lint/format/coverage jobs
biome.json                     # NEW — Biome lint + format config (one file)
renovate.json                  # NEW — Renovate config (grouping, schedule)
.gitlab/
├── secret-detection-ruleset.toml   # NEW — allowlist for fake fixtures
└── (renovate scheduled-pipeline include if needed)
scripts/
├── ci/                        # existing F005 scripts (unchanged)
└── hooks/                     # NEW — native core.hooksPath hooks
    ├── pre-commit             # lint + format-check on staged files
    └── commit-msg             # DCO Signed-off-by enforcement
vitest.config.ts               # coverage thresholds already present; enforced via new CI job
package.json                   # add devDependency (biome) + lint/format/coverage scripts
CONTRIBUTING.md                # add hook opt-in + Biome workflow
src/** , tests/**              # one-time format baseline (mechanical, behavior-neutral)
```

**Structure Decision**: Pure additive tooling/config at the repo root plus a new
`scripts/hooks/` directory; the only `src/**`/`tests/**` change is the one-time
mechanical format baseline. The existing `.gitlab-ci.yml` quality-gate/release
structure is extended, not restructured.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
