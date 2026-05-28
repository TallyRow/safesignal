# Implementation Plan: Rename Project to SafeSignal

**Branch**: `003-rename-safesignal` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-rename-safesignal/spec.md`

## Summary

Rename the project's public identity from the legacy working name
(`frontend-logging-sdk`) and `@your-org/` placeholder npm scope to
**SafeSignal**, published as `@tallyrow/safesignal` (TallyRow is the
publishing organization; SafeSignal is the product). The rename is a
**metadata-and-documentation layer change**: `package.json` (`name`,
`description`, `keywords`, `repository`), the top-level `README.md`,
`docs/safe-logging.md`, the two example projects' metadata + inline
`index.ts` headers, the consumer-facing shared example
(`examples/shared/beacon-transport.ts`), a new `CHANGELOG.md` entry,
the active feature spec's `quickstart.md`, and (if it currently names
the project) the constitution.

The rename does **not** touch runtime code, public API symbol names,
type names, redaction/sanitizer/scrubber behavior, the transport
security contract, the `exports` map shape, the dependency set, the
test logic, or any source file under `src/` (per FR-020 / FR-021 /
FR-022 / FR-023 / FR-024). Subpath suffixes (`./testing`,
`./transport-beacon`) keep their relative identifiers — only the
package-name segment on the left of the slash changes.

Verification is grep-based (SC-002 audit) + bundle-size invariant
(SC-009 within ±1 KiB of pre-rename gzipped sizes) + full test-suite
invariant (SC-008 same pass/skip/todo counts). The implementation is
short and mechanical, but the **acceptance gate is the audit + the
invariants**, not the count of files edited.

## Technical Context

**Language/Version**: TypeScript 5.4+ (no change; rename is metadata-only)

**Primary Dependencies**: No change to runtime or dev dependencies.
`package.json`'s `dependencies` and `devDependencies` blocks are
preserved verbatim (FR-023).

**Storage**: N/A — browser-runtime package; no storage layer affected.

**Testing**: Vitest + happy-dom (existing). The full suite must pass
unchanged (FR-021, FR-027, SC-008). No new tests are required for the
rename itself, but a tiny grep-based audit (run via npm script or
shell one-liner) verifies the post-rename forward-going consumer
surface (SC-002, FR-025).

**Target Platform**: Browser (modern + SSR-safe) — unchanged.

**Project Type**: Reusable frontend package (single-package monorepo
layout with example consumers under `examples/`). Unchanged.

**Performance Goals**: No change to runtime performance. Bundle-size
budgets remain locked: `dist/index.mjs` ≤ 8200 B gzipped (SC-007
default-entry size lock from feature 002) and
`dist/transport-beacon.mjs` ≤ 5120 B gzipped (SC-008 from feature
002). Post-rename, both must stay within ±1 KiB of their pre-rename
gzipped baselines (SC-009 of this feature).

**Constraints**:

- The rename MUST be transparent at the API-semantics layer. A
  consumer's call sites do not change apart from the package name in
  their `import` statements and their `package.json`'s `dependencies`
  entry.
- The constitution's 7 principles and version (`1.2.0`) are
  preserved verbatim (FR-017). The constitution's `Last Amended`
  date MAY bump.
- Historical feature spec directories
  (`specs/001-structured-logging-core/`,
  `specs/002-beacon-transport/`) remain unedited as point-in-time
  archival records (FR-018).
- Source files under `src/` containing the legacy name as an
  internal identifier (`PACKAGE_ERROR_MARKER`'s Symbol description,
  `FLSDK_EVENT_KEY`, `LOGGER_NAME` in the dormant OTel adapter)
  remain unchanged — they are not part of the consumer-facing
  surface (FR-020). See research.md for the boundary analysis.
- Test fixtures referencing the legacy package name remain
  unchanged (FR-021) — they exercise duplicate-copy isolation logic
  that is name-agnostic.

**Scale/Scope**: 6 forward-going consumer-surface files +
`package.json` + a new `CHANGELOG.md` + (potentially) the
constitution's identity references. Two example projects' subtrees
are touched at the metadata + header-comment level.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The rename is identity-only. Every principle is preserved by
construction because no runtime, behavioral, or interface code
changes. The gate-pass below identifies the principle, what the
rename touches that's adjacent to it (if anything), and why no
guarantee weakens.

- **API Stability (Principle I)**: One change to the consumer call
  site — the package name string in `import` statements and in
  `package.json` `dependencies`. Public symbol names, type names,
  function signatures, and behavior are unchanged (FR-024 preserves
  the `exports` map shape; FR-020 prohibits source-code symbol
  changes). The migration is documented in a README migration note
  (FR-007), in a CHANGELOG entry (FR-010), and is versioned as a
  major bump (Assumptions: import strings change ⇒ major). **PASS.**

- **Browser Resilience & Failure Safety (Principle II)**: No
  runtime code change. The fail-closed redactor pipeline, the
  bounded sanitizer, the URL scrubber, the transport security
  contract (T-S1..T-S5), and the never-throw boundary on the public
  emit path are all preserved verbatim (FR-022). **PASS — no surface
  touched.**

- **Neutrality & Portability (Principle III)**: The rename does not
  introduce framework-specific, application-specific, or
  vendor-locked assumptions. The package remains framework-neutral
  and consumable by host applications and federated modules through
  the same API. The new identity (`@tallyrow/safesignal`) is
  vendor-neutral by construction — it names the product, not a
  framework. **PASS.**

- **Structured Observability (Principle IV)**: The structured event
  model, level behavior, metadata expectations, and production
  defaults are unchanged. The internal `FLSDK_EVENT_KEY` namespace
  in the dormant OTel mapping stays as-is because it is internal and
  not consumer-visible (the OTel adapter is not wired into any
  default transport). A note in research.md flags this for the
  future OTel-adapter activation work — the namespace should rename
  at the same time the adapter ships. **PASS.**

- **Secure Logging by Default & Sensitive Data Minimization
  (Principle V)**: Redaction defaults, sanitizer limits, URL
  scrubber behavior, fail-closed handling, and the transport
  security contract are all preserved verbatim (FR-022). The rename
  is also a small defensive win: a named brand makes imposter
  packages on the registry easier to spot, and reserving the
  `@tallyrow/` scope blocks scope-level impersonation. **PASS.**

- **Log Integrity & Monitoring Suitability (Principle VI)**: Event
  production, ordering, dropping, batching, transformation, and
  attribution semantics are all unchanged. The pipeline stage order
  and bounded-behavior guarantees from feature 001 + feature 002 are
  preserved verbatim. **PASS.**

- **Lightweight Logger Instances & Federated Runtime (Principle
  VII)**: No per-`Logger` initialization changes. No telemetry
  backend, vendor SDK, transport, queue, batching/retry loop, timer,
  global listener, console patcher, network call, or ambient browser
  read is added. The host-owns-runtime contract for federated
  deployments is preserved. The duplicate-package-copy
  classification (**isolated**) is preserved per feature 001's
  contract — a page that loads both a "legacy-named" copy and a
  "SafeSignal-named" copy during a migration window behaves like any
  two copies of the same package (each has its own configured
  runtime). **PASS.**

- **Test & Documentation Coverage (Principle VIII)**: No new
  contract, unit, integration, failure, or security tests are
  required by the rename (FR-021 prohibits test-logic changes;
  the full suite passes unchanged per SC-008). A grep-based audit
  script verifies the post-rename consumer surface (FR-025). The
  README migration note (FR-007), the new CHANGELOG entry (FR-010),
  and the constitution's identity references (FR-016, if any) all
  ship as documentation deliverables. **PASS.**

**Initial gate: PASS — zero violations.** Re-evaluated post-Phase-1
in a closing gate-check section at the bottom of this file.

## Project Structure

### Documentation (this feature)

```text
specs/003-rename-safesignal/
├── plan.md              # This file
├── research.md          # Phase 0 — audit findings + naming/scope rationale
├── data-model.md        # Phase 1 — surface inventory (before/after)
├── quickstart.md        # Phase 1 — post-rename SafeSignal five-minute quickstart
├── contracts/
│   ├── legacy-name-audit.md       # SC-002 grep-based audit contract
│   ├── bundle-invariance.md       # SC-009 + SC-010 invariance contract
│   ├── test-suite-invariance.md   # SC-008 + FR-021 invariance contract
│   └── migration-note.md          # README migration-note content contract
├── checklists/
│   └── requirements.md  # Already completed by /speckit-clarify
└── tasks.md             # Created by /speckit-tasks (not by this command)
```

### Source Code (repository root) — files touched by the rename

```text
package.json                              # name, description, keywords, repository
CHANGELOG.md                              # NEW — release note for rename version
README.md                                 # H1, first paragraph, migration note
docs/
└── safe-logging.md                       # identity references → SafeSignal
.specify/memory/
└── constitution.md                       # identity references → SafeSignal (if any)
examples/
├── host-app/
│   ├── package.json                      # name, description
│   ├── index.ts                          # header comment + import statements
│   └── README.md                         # if present, identity references
├── federated-module/
│   ├── package.json                      # name, description
│   ├── index.ts                          # header comment + import statements
│   └── README.md                         # identity references
└── shared/
    └── beacon-transport.ts               # JSDoc + import statements (2 refs)
specs/001-structured-logging-core/
└── quickstart.md                         # forward-going consumer surface (FR-009)
specs/002-beacon-transport/
└── quickstart.md                         # forward-going consumer surface (FR-009)
.specify/templates/                       # only if templates currently use legacy name
```

**Files NOT touched (FR-020 / FR-021 / FR-018 boundaries):**

```text
src/**                                    # FR-020 — no source-code changes
tests/**                                  # FR-021 — no test logic changes
                                          # incl. tests/integration/duplicate-copy-isolation.integration.test.ts
src/internal/errors/internal-errors.ts    # Symbol('frontend-logging-sdk/package-error')
                                          #   — internal symbol description, not consumer-visible
src/internal/telemetry/otel/mapping.ts    # FLSDK_EVENT_KEY ('frontend-logging-sdk.event')
                                          #   — dormant OTel adapter, future-work rename
src/internal/telemetry/otel/otel-backend.ts # LOGGER_NAME = 'frontend-logging-sdk'
                                          #   — dormant OTel adapter, future-work rename
specs/001-structured-logging-core/
  spec.md, plan.md, tasks.md,             # FR-018 — archival, not edited
  data-model.md, research.md, contracts/, checklists/
specs/002-beacon-transport/
  spec.md, plan.md, tasks.md,             # FR-018 — archival, not edited
  data-model.md, research.md, contracts/, checklists/
~/org/agents/projects/frontend-logging-sdk.org # personal org files — not in repo
```

**Structure Decision**: The repository keeps its existing layout —
single-package TypeScript SDK with examples under `examples/` and
Spec Kit artifacts under `specs/`. The rename feature does not
introduce a new directory or alter the existing tree. The "Source
Code" block above enumerates every file the rename touches;
everything else is preserved verbatim. Phase 0's audit (research.md
§ Audit findings) is the authoritative footprint inventory.

## Phase 0 — Research & Audit

See [`research.md`](./research.md). Phase 0 captures:

1. The legacy-name footprint audit (every file containing the legacy
   identifier, categorized by in-scope vs. out-of-scope-per-FR).
2. The TallyRow + SafeSignal naming rationale recap from the
   /speckit-clarify session (Q1 GitLab slug; Q2 npm package name).
3. GitLab slug-rename mechanics (auto-redirect from the old slug;
   `package.json` `repository` URL update).
4. The npm `@tallyrow/` scope reservation consideration.
5. The CHANGELOG.md authoring decision (file currently absent — new
   in this feature).
6. The constitution's identity reference status (grep returned no
   literal `frontend-logging-sdk` or `@your-org` matches; the
   constitution uses generic terms throughout, which simplifies
   FR-016 — likely only a title-level identity line needs to be
   added if any).
7. Future-work flag: the dormant OTel adapter's `FLSDK_EVENT_KEY`
   namespace should rename when the adapter ships.

## Phase 1 — Design & Contracts

See [`data-model.md`](./data-model.md),
[`contracts/`](./contracts/), and [`quickstart.md`](./quickstart.md).
Phase 1 captures:

- **data-model.md**: Surface inventory mapping every consumer-facing
  file to its before/after identity references, plus the formal
  definitions of the spec's key entities (SafeSignal, TallyRow,
  legacy project name, public-facing surface, migration-context
  callout).
- **contracts/legacy-name-audit.md**: The SC-002 grep-based audit
  contract — exact globs, exact denied patterns, exact allowed
  exceptions (migration-context callouts, archival paths). This
  contract is the rename's acceptance gate.
- **contracts/bundle-invariance.md**: The SC-009 + SC-010 contract
  — pre-rename and post-rename dist sizes must stay within ±1 KiB
  gzipped for `dist/index.mjs` and `dist/transport-beacon.mjs`. The
  existing dependency-pins and bundle-shape tests pass unchanged.
- **contracts/test-suite-invariance.md**: The SC-008 + FR-021
  contract — `npm test` produces the same test count, pass count,
  and skipped/todo counts pre- and post-rename.
- **contracts/migration-note.md**: The README migration note's
  required content — legacy package name, new SafeSignal package
  name, the `npm install` one-liner, the find-and-replace pattern
  for import statements, the version at which the rename landed.
- **quickstart.md**: The post-rename SafeSignal five-minute path
  (install → import → emit). Mirrors the pre-rename quickstart
  structure but with `@tallyrow/safesignal` everywhere.

After Phase 1 artifacts ship, this plan's CLAUDE.md SPECKIT marker
updates to point at `specs/003-rename-safesignal/plan.md`.

## Phase 2 — Tasks (NOT created by /speckit-plan)

`/speckit-tasks` will produce a tasks.md that breaks the work into
sequential file-edit tasks grouped by user story (US1: package
metadata + README headline; US2: docs and migration note; US3:
examples + CHANGELOG), plus a final audit-gate task that runs the
contracts/legacy-name-audit.md script and the bundle-invariance +
test-suite-invariance checks.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Constitution check passes initially and is
re-confirmed at end-of-plan (see "Post-Phase-1 gate" below). Table
omitted.

## Post-Phase-1 Constitution Re-check

The Phase 1 artifacts (data-model.md, contracts/, quickstart.md) do
not introduce any new code, runtime behavior, dependency, or
interface. They are descriptive verification contracts (audit script,
invariance assertions) plus a post-rename quickstart that mirrors the
pre-rename one. **All 7 principles remain PASS after Phase 1
design.** No re-evaluation triggered any change to plan.md.
