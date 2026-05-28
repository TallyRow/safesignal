# Contract: README Migration Note

**Phase**: 1 (Design & Contracts)
**Feature**: [003-rename-safesignal/spec.md](../spec.md)
**Maps to**: FR-007, FR-010, SC-005, SC-006, R-004, R-007

## Purpose

Specify the required **content** of the migration note that ships
in `README.md` (and the corresponding `CHANGELOG.md` entry) so that
a consumer who arrives via the legacy project name can map their
existing install + import statements to SafeSignal in under 30
seconds.

This contract does not prescribe wording — it prescribes the
**information** the consumer must receive.

## Required content elements

The migration note MUST contain ALL of the following:

| Element                                | Description                                                                                                                                                | Example                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **(A) Legacy package name**            | The pre-rename identifier the consumer may have used.                                                                                                      | `@your-org/frontend-logging-sdk`                                                              |
| **(B) New SafeSignal package name**    | The post-rename canonical identifier.                                                                                                                      | `@tallyrow/safesignal`                                                                        |
| **(C) Install one-liner**              | The exact shell command a consumer runs to install the new package.                                                                                        | `npm install @tallyrow/safesignal`                                                            |
| **(D) Import find-and-replace pattern**| A single sed/IDE-find-and-replace pattern that covers every import.                                                                                        | Replace `@your-org/frontend-logging-sdk` with `@tallyrow/safesignal` in every `import`/`require`. |
| **(E) Subpath continuity statement**   | A short note that the subpath suffixes (`/testing`, `/transport-beacon`) are unchanged — only the package-name segment moves.                              | "Subpaths `/testing` and `/transport-beacon` remain identical."                               |
| **(F) Rename version**                 | The version at which the rename landed, so consumers can pin to a specific cutover.                                                                        | "Renamed in v\<X.0.0\> (the first published SafeSignal release)."                             |
| **(G) Behavior-preservation statement**| A one-sentence assurance that public API, redaction defaults, transport behavior, and security guarantees are unchanged across the rename.                 | "No runtime behavior, public API, redaction default, or transport contract changes in this release — only project identity moves." |

## Placement

The migration note MUST:

- Be inside `README.md`.
- Be discoverable on the README's **first scrollable screen** (per
  FR-007). It may be:
  - A small dedicated section directly under the H1 (recommended).
  - Or the first paragraph of body text (acceptable if the H1
    already names SafeSignal and the migration content can fit in
    a single paragraph).
  - NOT acceptable: buried below the Quickstart section or below
    any API documentation.

## CHANGELOG.md entry

The newest CHANGELOG entry — the one shipping the rename — MUST:

- Be at the top of the file (newest-first convention).
- Title or summary contains the literal string `SafeSignal`
  (FR-010, SC-006).
- Identify the rename as the **primary** change of the release.
- Link to the README migration note (relative link
  `[migration note](./README.md#<anchor>)` or by section name).
- Contain the same Element (G) behavior-preservation statement
  from the migration note (or a verbatim cross-reference to it).

The CHANGELOG file is new in this feature (it did not exist
pre-rename). Earlier releases (features 001 + 002, which were never
published) MAY be backfilled in subsequent entries but are not
required by this contract.

## Audit cross-reference

The migration note is one of the explicit "allowed exceptions" in
[contracts/legacy-name-audit.md](./legacy-name-audit.md). The
legacy package name string `@your-org/frontend-logging-sdk` is
permitted to appear inside this note (and inside the CHANGELOG
entry) because it appears in a clearly-labeled migration-context
callout that names SafeSignal in the same block.

## Sample shape (illustrative, not normative)

The following is a sketch of what an acceptable migration note
might look like in `README.md`. The exact wording is at the
author's discretion; only the seven required elements (A..G) are
contract-binding.

```markdown
## Renamed from `frontend-logging-sdk`

This package was previously developed under the working name
`@your-org/frontend-logging-sdk`. As of v<X.0.0>, it ships as
**SafeSignal**, published on npm as `@tallyrow/safesignal`.

**Migration**:

```bash
# Install the new package
npm install @tallyrow/safesignal
```

```ts
// Update every import:
// Before
import { createLogger } from '@your-org/frontend-logging-sdk';
import { createBeaconTransport } from '@your-org/frontend-logging-sdk/transport-beacon';

// After
import { createLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
```

Subpaths (`/testing`, `/transport-beacon`) are unchanged — only the
package-name segment moves.

No runtime behavior, public API, redaction default, or transport
contract changes in this release. Bundle sizes are within ±1 KiB
of the pre-rename baseline.
```

## Pass / Fail criteria

- **PASS**: README contains a discoverable migration note covering
  all seven elements (A..G), AND CHANGELOG.md exists with a
  newest entry that names SafeSignal in title/summary and
  cross-references the README's migration note.
- **FAIL**: Any of the seven elements is missing or the placement
  is below the first scrollable screen of the README.
