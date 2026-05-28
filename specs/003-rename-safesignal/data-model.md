# Data Model: Rename Project to SafeSignal

**Phase**: 1 (Design & Contracts)
**Feature**: [003-rename-safesignal/spec.md](./spec.md)
**Plan**: [003-rename-safesignal/plan.md](./plan.md)
**Date**: 2026-05-28

For a documentation-only rename, the "data model" is the **inventory
of identity surfaces** — each file that names the project, with its
before- and after-rename state. This document is the authoritative
list of edits the rename feature performs.

## Entities

The spec defines five entities. Their formal data shapes:

### SafeSignal

The public, consumer-facing project and product identity.

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Display name     | `SafeSignal`                                                     |
| Tagline          | "Secure structured logging facade and safety boundary for browser applications and federated frontend modules." |
| Package name     | `@tallyrow/safesignal`                                           |
| Repository slug  | `safesignal` (or `safesignal-sdk`)                               |
| Replaces         | `frontend-logging-sdk` (working name) + `@your-org/frontend-logging-sdk` (placeholder package name) |

### TallyRow

The publishing organization (npm scope owner; GitLab namespace).

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Display name     | `TallyRow`                                                       |
| npm scope        | `@tallyrow/`                                                     |
| Role             | Publisher / namespace; not a product name                        |
| Locks against    | Scope-level impersonation on the npm registry                    |

### Legacy project name

The pre-rename identity, retained only in archival artifacts and in
explicit migration-context callouts.

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Working name     | `frontend-logging-sdk`                                           |
| Placeholder pkg  | `@your-org/frontend-logging-sdk`                                 |
| Retention scope  | Archival specs (FR-018), migration callouts, test fixtures (FR-021), internal source identifiers (FR-020) |
| Forbidden in     | Forward-going consumer surfaces (see Public-facing surface)      |

### Public-facing surface

The set of files a consumer can encounter through normal discovery
channels. Each is in scope for the rename audit (SC-002).

| Surface                                       | Included? | Notes                                                  |
| --------------------------------------------- | --------- | ------------------------------------------------------ |
| npm registry metadata                         | Yes       | Derived from `package.json` `name`, `description`, `keywords`, `repository` |
| Top-level `README.md`                         | Yes       | First H1, first paragraph, install + import examples, migration note |
| `docs/**`                                     | Yes       | Identity references in `docs/safe-logging.md`          |
| `examples/**`                                 | Yes       | Both example projects' metadata + `index.ts` headers + the shared transport helper |
| `CHANGELOG.md`                                | Yes       | New file; rename entry names SafeSignal in title/summary |
| Active feature's `quickstart.md`              | Yes       | Per FR-009: both feature-001 and feature-002 quickstart.md files are on the consumer's path |
| Archival historical spec dirs                 | No        | FR-018 — point-in-time records                         |
| `~/org/agents/**`                             | No        | Personal org files; not in repo                        |
| `src/**`                                      | No        | FR-020 — source code identifiers                       |
| `tests/**`                                    | No        | FR-021 — test fixtures are name-agnostic               |

### Migration-context callout

A clearly-labeled section, paragraph, or inline note that frames the
legacy name as a former identity and explains how to migrate. Used
to scope the audit's "allowed exceptions".

| Field            | Value                                                            |
| ---------------- | ---------------------------------------------------------------- |
| Location         | One paragraph in `README.md`, one entry in `CHANGELOG.md`        |
| Required content | Legacy package name, new SafeSignal package name, install one-liner, import find-and-replace pattern, version at which the rename landed (see [contracts/migration-note.md](./contracts/migration-note.md)) |
| Audit treatment  | Legacy-name occurrences inside a callout are **allowed**         |

## Surface inventory (before/after)

The table below enumerates every file the rename touches. Surfaces
not in this table are NOT touched.

### `package.json` (root)

| Field         | Before                                                          | After                                                            |
| ------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `name`        | `"@your-org/frontend-logging-sdk"`                              | `"@tallyrow/safesignal"`                                         |
| `description` | "Reusable browser-first structured logging package with secure-by-default sanitization, redaction, and pluggable transports." | "SafeSignal — secure structured logging facade and safety boundary for browser applications and federated frontend modules." (or substantively similar wording that names SafeSignal and describes the secure-by-default posture) |
| `keywords`    | (existing topical terms, no `safesignal`)                       | Add `"safesignal"`; keep existing topical terms                  |
| `repository`  | (current GitLab URL, legacy slug)                               | GitLab URL with `safesignal` (or `safesignal-sdk`) slug          |
| `homepage`    | (if present) legacy-named URL                                   | (if present) URL identifying the project as SafeSignal           |
| `exports`     | (3 entries: `.`, `./testing`, `./transport-beacon`)             | **Unchanged** — FR-024                                           |
| `dependencies`, `devDependencies` | (existing pin set)                          | **Unchanged** — FR-023                                           |
| `version`     | (current)                                                       | bumped per Assumptions (major bump because import strings change) |

### `README.md`

| Surface                | Before                                                 | After                                                                   |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| H1                     | Legacy-named or generic                                | Names SafeSignal                                                        |
| First paragraph        | Legacy-named or generic                                | Names SafeSignal; describes secure-by-default posture                   |
| Install command        | `npm install @your-org/frontend-logging-sdk` (or placeholder) | `npm install @tallyrow/safesignal`                                      |
| Import examples        | `from '@your-org/frontend-logging-sdk'`                | `from '@tallyrow/safesignal'`                                           |
| Subpath imports        | `from '@your-org/frontend-logging-sdk/transport-beacon'` | `from '@tallyrow/safesignal/transport-beacon'`                          |
| Migration note         | (none)                                                 | NEW — per [contracts/migration-note.md](./contracts/migration-note.md)  |

### `docs/safe-logging.md`

| Surface                              | Before                                          | After                                                  |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------ |
| Identity references                  | Legacy-named                                    | SafeSignal-named                                       |
| Import statements in code blocks     | Legacy package path                             | `@tallyrow/safesignal[/subpath]`                       |
| DO/DON'T sweep, pipeline-order, transport-security, federated-deployments sections | (structure) | **Unchanged structure** — only identity references update |

### `examples/host-app/`

| File                  | Surface                                  | Before                                          | After                                                  |
| --------------------- | ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `package.json`        | `name`                                   | `"host-app-example"`                            | **Unchanged** — example name is descriptive, not derived from the SDK identity |
| `package.json`        | `description`                            | "Single-app consumer example for @your-org/frontend-logging-sdk." | "Single-app consumer example for SafeSignal (@tallyrow/safesignal)." |
| `index.ts`            | Header doc comment, first paragraph      | Legacy-named                                    | SafeSignal-named                                       |
| `index.ts`            | Every `import` statement                 | `from '@your-org/frontend-logging-sdk[...]'`    | `from '@tallyrow/safesignal[...]'`                     |
| `README.md`           | (if present) identity references         | Legacy-named (if any)                           | SafeSignal-named                                       |

### `examples/federated-module/`

| File                  | Surface                                                  | Before                                          | After                                                  |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `package.json`        | `description`                                            | "Federated module consumer example for @your-org/frontend-logging-sdk." | "Federated module consumer example for SafeSignal (@tallyrow/safesignal)." |
| `index.ts`            | Header doc comment, first paragraph                      | Legacy-named                                    | SafeSignal-named                                       |
| `index.ts`            | Every `import` statement (incl. standalone-iteration block) | `from '@your-org/frontend-logging-sdk[...]'`    | `from '@tallyrow/safesignal[...]'`                     |
| `README.md`           | Identity references                                      | Legacy-named                                    | SafeSignal-named                                       |

### `examples/shared/beacon-transport.ts`

| Surface                       | Before                                                | After                                                  |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Line 33 (JSDoc import example) | `from '@your-org/frontend-logging-sdk/testing'`       | `from '@tallyrow/safesignal/testing'`                  |
| Line 42 (`import type`)       | `from '@your-org/frontend-logging-sdk'`               | `from '@tallyrow/safesignal'`                          |
| All other lines               | (structure)                                           | **Unchanged**                                          |

### `CHANGELOG.md` (NEW)

| Surface                | Content                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| File status            | NEW — created in this feature                                                                                 |
| Format                 | "Keep a Changelog" convention (one section per version, newest at top)                                        |
| First entry version    | The rename version (per Assumptions: major bump because import strings change)                                |
| First entry title      | Names SafeSignal (FR-010, SC-006)                                                                             |
| First entry summary    | (a) Rename from legacy package to `@tallyrow/safesignal`; (b) link to README's migration note; (c) statement that public API symbols, behavior, redaction, and transport contracts are unchanged |

### `specs/001-structured-logging-core/quickstart.md`

| Surface                              | Before                                          | After                                                  |
| ------------------------------------ | ----------------------------------------------- | ------------------------------------------------------ |
| Identity references                  | Legacy-named                                    | SafeSignal-named                                       |
| Import statements in code blocks     | Legacy package path                             | `@tallyrow/safesignal[/subpath]`                       |
| Quickstart steps + flow              | (structure)                                     | **Unchanged**                                          |

### `specs/002-beacon-transport/quickstart.md`

Same shape as feature 001's quickstart.md row above. Identity
references + import paths update; flow stays.

### `.specify/memory/constitution.md`

| Surface                | Before                                                   | After                                                                                                          |
| ---------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| H1 title (line 29)     | `# Frontend Logging SDK Constitution`                    | A SafeSignal-flavored title (e.g., `# SafeSignal Constitution`). This is the project-identity reference T017 rewrites. |
| Body prose             | Generic terms ("frontend logging SDK", "logging SDK", "browser package", "reusable browser package") used in Rationale paragraphs | **Unchanged** — generic descriptive language is preserved per spec edge case (lines 208–214). Kebab `frontend-logging-sdk` pattern returns 0 matches. |
| Principles (1..7)      | 7 principles, version `1.2.0`                            | **Unchanged** — FR-017                                                                                         |
| `Version`              | `1.2.0`                                                  | `1.2.0` (FR-017 — version not bumped)                                                                          |
| `Last Amended`         | (existing date)                                          | MAY bump to the rename's landing date (per Assumptions)                                                        |

### `.specify/templates/**`

| Surface                | Before                                              | After                                                                |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Identity references    | (audit found 0 literal legacy-name matches; templates use generic terms throughout) | No structural change required; if any legacy-name reference is found during the tasks pass it updates to SafeSignal. |

## Validation rules

These rules are enforced by the Phase 1 contracts. Each is keyed to
one or more spec FRs.

- **R-001 (FR-001, SC-003)**: `package.json` `name` exactly equals
  `@tallyrow/safesignal`.
- **R-002 (FR-002, FR-003)**: `package.json` `description` contains
  the literal string `"SafeSignal"`. `keywords` array contains
  `"safesignal"`.
- **R-003 (FR-004)**: `package.json` `repository.url` ends with
  `/safesignal` or `/safesignal-sdk` (or `.git` suffix variant).
- **R-004 (FR-006, FR-007, SC-001, SC-005)**: README's first H1
  contains `SafeSignal`. README's first paragraph contains
  `SafeSignal`. README contains a migration-note block satisfying
  [contracts/migration-note.md](./contracts/migration-note.md).
- **R-005 (FR-008)**: `docs/safe-logging.md` contains `SafeSignal`
  in at least one identity-level reference and contains zero literal
  legacy-name strings outside migration-context callouts.
- **R-006 (FR-009)**: Every quickstart.md under `specs/*/` that is
  forward-going consumer-surface (currently 001 and 002) uses
  `@tallyrow/safesignal[...]` in every import statement and names
  the project as SafeSignal in at least one identity-level reference.
- **R-007 (FR-010, SC-006)**: `CHANGELOG.md` exists and its
  newest entry's title or summary contains `SafeSignal`.
- **R-008 (FR-011, FR-012, SC-004)**: Both
  `examples/*/package.json` `description` fields contain
  `SafeSignal`.
- **R-009 (FR-013, FR-014, SC-004)**: Both `examples/*/index.ts`
  header doc comments name SafeSignal in the first paragraph; every
  `import` statement uses `@tallyrow/safesignal[/subpath]`.
- **R-010 (FR-015)**: `examples/federated-module/README.md` names
  SafeSignal; `examples/host-app/README.md` (if present) names
  SafeSignal.
- **R-011 (FR-016, SC-007)**: Constitution names the project as
  SafeSignal in its title or preamble; version stays `1.2.0`.
- **R-012 (FR-021, FR-027, SC-008)**: `npm test` produces the same
  test count, pass count, and skipped/todo counts pre- and
  post-rename. Enforced by
  [contracts/test-suite-invariance.md](./contracts/test-suite-invariance.md).
- **R-013 (FR-026, SC-009)**: `dist/index.mjs` and
  `dist/transport-beacon.mjs` stay within ±1 KiB gzipped of their
  pre-rename baselines. Enforced by
  [contracts/bundle-invariance.md](./contracts/bundle-invariance.md).
- **R-014 (FR-025, SC-002, SC-011)**: Grep-based audit returns zero
  legacy-name occurrences in the forward-going consumer surface
  outside migration-context callouts. Enforced by
  [contracts/legacy-name-audit.md](./contracts/legacy-name-audit.md).
- **R-015 (FR-023, SC-010)**: `tests/contract/dependency-pins.test.ts`
  passes unchanged.
- **R-016 (FR-024, SC-010)**: `tests/security/bundle-shape.security.test.ts`
  and `tests/security/transport-beacon-bundle-shape.security.test.ts`
  pass unchanged.

## State transitions

The rename is one-shot — there are no intermediate states. The
repository transitions from "legacy-named in all forward-going
consumer surfaces" to "SafeSignal-named in all forward-going
consumer surfaces" within a single feature branch and a single
release version. There is no per-file phasing or partial-rename
intermediate; the audit (R-014) is the gate.

The only post-rename "transition" is the published-package
migration consumers perform on their own schedule (see
[contracts/migration-note.md](./contracts/migration-note.md) for
the content they receive).
