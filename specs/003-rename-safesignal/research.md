# Research: Rename Project to SafeSignal

**Phase**: 0 (Outline & Research)
**Feature**: [003-rename-safesignal/spec.md](./spec.md)
**Plan**: [003-rename-safesignal/plan.md](./plan.md)
**Date**: 2026-05-28

This document records the audit + decision rationale that fed into
`plan.md`. It is the authoritative footprint inventory for the
rename and the place where each scope decision (in-scope vs.
out-of-scope) is justified against the spec's functional
requirements.

## Audit findings — legacy-name footprint

A repository-wide grep for the two legacy identifiers
(`frontend-logging-sdk` and `@your-org`) on 2026-05-28 returned the
files below, grouped by scope decision.

### Group A: Forward-going consumer surface — **IN SCOPE**

These files are the canonical consumer-facing surface per the spec's
"Public-facing surface" entity definition. Every legacy-name
reference in these files must move to the SafeSignal identity (or to
an explicit migration-context callout).

| File                                          | Refs | FR mapping       | Notes                                                                 |
| --------------------------------------------- | ---- | ---------------- | --------------------------------------------------------------------- |
| `package.json`                                | 1    | FR-001..FR-005   | `name` field is `@your-org/frontend-logging-sdk` placeholder → `@tallyrow/safesignal` |
| `README.md`                                   | many | FR-006, FR-007   | H1, first paragraph, install command, import examples; ADD migration note |
| `docs/safe-logging.md`                        | many | FR-008           | Identity references only; body structure unchanged                    |
| `examples/host-app/package.json`              | 1    | FR-011           | `description` field references legacy name                            |
| `examples/host-app/index.ts`                  | many | FR-013           | Header doc comment + every `import` statement                         |
| `examples/federated-module/package.json`      | 1    | FR-012           | `description` field references legacy name                            |
| `examples/federated-module/index.ts`          | many | FR-014           | Header doc comment + every `import` statement (incl. the standalone-iteration block) |
| `examples/federated-module/README.md`         | many | FR-015           | Body identity references                                              |
| `examples/shared/beacon-transport.ts`         | 2    | FR-013-adjacent  | JSDoc at line 33 + `import type` at line 42; consumer-readable example file |
| `specs/001-structured-logging-core/quickstart.md` | many | FR-009       | Forward-going quickstart even though the spec dir is "feature 001"    |
| `specs/002-beacon-transport/quickstart.md`    | many | FR-009           | Forward-going quickstart for the beacon transport's canonical five-minute path |
| `CHANGELOG.md`                                | N/A  | FR-010           | **File does not currently exist.** New in this feature.               |

**Note on `examples/host-app/README.md`**: The 2026-05-28 grep did
not return this file in the legacy-name match set, which means it
either (a) does not exist or (b) contains no legacy-name references.
Either is consistent with FR-015 ("if present"). The task pass will
verify and either update (if present + references found) or skip.

### Group B: Constitution — **IN SCOPE if identity is referenced**

| File                              | Refs | FR mapping       | Notes                                                                       |
| --------------------------------- | ---- | ---------------- | --------------------------------------------------------------------------- |
| `.specify/memory/constitution.md` | 1 (title) + N (body prose) | FR-016, FR-017 | The kebab grep for `frontend-logging-sdk` returned **no** matches. However, the title-case identity reference `# Frontend Logging SDK Constitution` exists at `constitution.md:29` (H1), and body prose uses generic phrases such as "frontend logging SDK" / "logging SDK" (e.g., `constitution.md:63` in Principle II's Rationale). The title is the project-identity reference T017 rewrites; the body prose is preserved per the spec edge case (lines 208–214). Version stays `1.2.0` (FR-017). `Last Amended` MAY bump. |

**Decision**: The constitution's H1 title at `constitution.md:29`
moves to a SafeSignal-flavored title (handled by T017). The
constitution's body language ("browser-first structured logging
package", "reusable browser package", "logging SDK") stays as
generic descriptive prose — it is factually accurate (SafeSignal
IS a browser-first structured logging package). The rename touches
the title-level identity reference, not the generic descriptive
vocabulary. The audit's case-sensitive kebab pattern intentionally
does NOT flag the title-case prose; T017 is the enforcement.

### Group C: Spec Kit templates — **IN SCOPE if templates use legacy name**

| Path                       | Refs | FR mapping | Notes                                                                                       |
| -------------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------- |
| `.specify/templates/**`    | 0    | FR-019     | Templates use generic terms throughout (per Assumptions in spec). A task-level grep verifies; if any legacy reference is found, it updates. No structural change required. |

### Group D: Internal source code — **OUT OF SCOPE per FR-020**

| File                                              | Refs | Why out of scope                                                                                                                          |
| ------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/internal/errors/internal-errors.ts:7`        | 1    | `Symbol('frontend-logging-sdk/package-error')` — Symbol description is debugging-only. Symbols don't compare by description, so this string is functionally inert. Not consumer-visible. Per FR-020, source files don't change unless the literal is consumer-facing. |
| `src/internal/telemetry/otel/mapping.ts:27`       | 1    | `FLSDK_EVENT_KEY = 'frontend-logging-sdk.event'` — internal constant; the OTel adapter is dormant (not wired to any default transport). Not currently consumer-visible. **Flagged as future work**: when the OTel adapter ships, this namespace SHOULD rename to a `safesignal.*` form alongside that adapter's activation. |
| `src/internal/telemetry/otel/otel-backend.ts:33`  | 1    | `LOGGER_NAME = 'frontend-logging-sdk'` — same dormancy argument as above. Renames with OTel adapter activation, not now.                  |

**FR-020 boundary**: "NO change to any source file under `src/`
except where a string literal contains the legacy project name AND
that string literal is part of the consumer-facing surface." None of
the three above are currently part of any consumer-facing surface
(they sit behind a dormant adapter or are debug-only). They remain
unchanged in feature 003.

### Group E: Tests — **OUT OF SCOPE per FR-021**

| File                                                                    | Refs | Why out of scope                                                                                                                                          |
| ----------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/duplicate-copy-isolation.integration.test.ts:217-219,284` | 4    | Test fixtures for the duplicate-copy isolation contract. The fixtures use the legacy package name as a marker string to verify the **isolation behavior is name-agnostic** — the test would pass equally with `@tallyrow/safesignal` substituted, but FR-021 prohibits test-logic changes. The fixtures stay. The test is name-agnostic by design. |

### Group F: Archival — **OUT OF SCOPE per FR-018**

| Path                                                                              | Refs                                  | Why out of scope                                                                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/001-structured-logging-core/{spec,plan,tasks,research,data-model}.md, contracts/, checklists/` | many | FR-018 — historical archival records. Exception: `quickstart.md` (in Group A).                                                                |
| `specs/002-beacon-transport/{spec,plan,tasks,research,data-model}.md, contracts/, checklists/` | many | FR-018 — historical archival records. Exception: `quickstart.md` (in Group A).                                                                |
| `~/org/agents/projects/frontend-logging-sdk.org`                                  | many                                  | Personal org file, outside the repo. Not a consumer-facing surface. Stays.                                                                    |

### Group G: Self-references — **EXPECTED**

| File                                                | Refs | Notes                                                                                                                  |
| --------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| `specs/003-rename-safesignal/spec.md`               | many | This feature's own spec — references the legacy name to describe what's being renamed. Stays as authored.             |
| `specs/003-rename-safesignal/checklists/requirements.md` | several | Same — references the legacy name to describe the change.                                                          |

### Group H: Build artifacts — **AUTO-REGENERATED**

| Path                       | Notes                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `package-lock.json`        | Regenerates on `npm install` after `package.json`'s `name` field updates.                                              |
| `examples/*/node_modules/` | Removed and reinstalled on next `npm install` from the example's directory.                                            |
| `dist/**`                  | Removed and rebuilt by `npm run build`. The bundle-invariance contract (Phase 1) locks the size delta within ±1 KiB.   |

## Decision: TallyRow + SafeSignal naming

Resolved by the /speckit-clarify session on 2026-05-28 (recorded in
spec.md's Clarifications section).

- **Q1**: GitLab project slug — rename now vs. defer? → **Rename
  now**. Slug `safesignal` (or `safesignal-sdk`). `package.json`
  `repository` updates to the new URL. GitLab auto-redirects from
  the old slug, so external links don't immediately break.
- **Q2**: NPM package name shape? → **`@tallyrow/safesignal`**.
  TallyRow is the publishing organization (npm scope); SafeSignal
  is the product (package name). Leaves room for sibling packages
  (`@tallyrow/safesignal-transport-otel`, etc.) without renaming
  the SDK.

**Rationale (recap)**:

- A scoped npm name (`@tallyrow/safesignal`) locks the package
  against scope-level impersonation. Once `@tallyrow/` is reserved,
  no one else can publish to that scope.
- Separating publisher (TallyRow) from product (SafeSignal) leaves
  the publisher free to add sibling products without forcing a
  rename. A future `@tallyrow/safesignal-transport-otel`,
  `@tallyrow/safesignal-react`, or
  `@tallyrow/safesignal-redaction-presets` reads as a coherent
  family at install time.
- Slug rename mechanics: GitLab issues HTTP redirects from the old
  slug to the new one for at least the lifetime of the project, so
  external links that hard-coded the old URL continue to resolve.
  The `package.json` `repository` field updates to point at the
  new URL so npm-registry metadata is correct from v1 onward.

## Decision: CHANGELOG creation

CHANGELOG.md does not currently exist in the repository. The rename
feature creates it.

**Rationale**: FR-010 requires a release-facing CHANGELOG entry for
the rename version. The entry's title or summary must name
"SafeSignal" so consumers tracking releases see the rename in their
feed. The CHANGELOG follows the "Keep a Changelog" convention (one
section per version, newest at the top), starting with the rename
version. Earlier versions (the pre-published v1 work from features
001 and 002) MAY be backfilled in subsequent entries; the rename
feature only requires the rename entry.

## Decision: npm scope reservation

**Assumption** (recorded in spec.md's Assumptions section): the
`@tallyrow/` npm scope is owned (or will be reserved before v1
publish) by TallyRow, and `@tallyrow/safesignal` is available to
claim under that scope.

**Out of plan scope**: The actual `npm publish` step that claims
the scope is post-merge work, not part of this rename feature's
acceptance gate. The rename feature ships the renamed metadata +
docs; v1 publish is a separate gate.

## Decision: src/internal/telemetry/otel/ namespace (future work)

The dormant OTel adapter currently namespaces its event attribute
key (`FLSDK_EVENT_KEY = 'frontend-logging-sdk.event'`) and its
logger-name constant (`LOGGER_NAME = 'frontend-logging-sdk'`) under
the legacy name. These are internal until the adapter activates.

**Decision**: Leave both unchanged in feature 003. When the OTel
adapter is activated (a future feature 004+ scoped to "OpenTelemetry
adapter — vendor-neutral attribute mapping"), the rename of these
namespaces is in scope of that feature's design, not this one.

**Rationale**: Renaming them now would (a) be invisible to consumers
because the adapter is not wired up, (b) require touching `src/`
which FR-020 prohibits unless the literal is consumer-facing, and
(c) risk breaking any out-of-tree code that imports the constants
directly. A future-flag note in this research doc + a follow-up
task on the OTel-adapter activation feature is sufficient.

## Verification approach

The rename's acceptance gate is the conjunction of:

1. **Grep audit** (FR-025 / SC-002): No occurrence of the legacy
   project name in any forward-going consumer-surface file
   (README, docs/**, examples/**, CHANGELOG.md, the active
   feature's quickstart.md) outside an explicit migration-context
   callout. The contract is formalized in
   [contracts/legacy-name-audit.md](./contracts/legacy-name-audit.md).
2. **Bundle invariance** (FR-026 / SC-009): `dist/index.mjs` and
   `dist/transport-beacon.mjs` stay within ±1 KiB gzipped of their
   pre-rename baselines. The contract is formalized in
   [contracts/bundle-invariance.md](./contracts/bundle-invariance.md).
3. **Test-suite invariance** (FR-021 / FR-027 / SC-008): The full
   test suite passes unchanged — same test count, same pass count,
   same skipped/todo counts. The contract is formalized in
   [contracts/test-suite-invariance.md](./contracts/test-suite-invariance.md).
4. **README migration-note content** (FR-007 / SC-005): The README's
   migration note contains the legacy-to-SafeSignal mapping, the
   install one-liner, and the import-statement find-and-replace
   pattern. The content is specified in
   [contracts/migration-note.md](./contracts/migration-note.md).

All four are independently verifiable by a reviewer scanning the
artifacts at HEAD post-merge.
