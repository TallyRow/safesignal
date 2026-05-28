# Contract: Legacy-Name Audit

**Phase**: 1 (Design & Contracts)
**Feature**: [003-rename-safesignal/spec.md](../spec.md)
**Maps to**: FR-025, SC-002, SC-011, R-014

## Purpose

Define the grep-based audit that verifies the post-rename
forward-going consumer surface contains **zero** occurrences of the
legacy project name (`frontend-logging-sdk` or `@your-org`) outside
explicit migration-context callouts.

The audit is the rename's primary **acceptance gate**. A passing
audit is necessary (though not sufficient — see also
`bundle-invariance.md` and `test-suite-invariance.md`) for the
rename to be considered complete.

## Globs — forward-going consumer surface (IN SCOPE)

```text
README.md
CHANGELOG.md
docs/**/*.md
examples/host-app/package.json
examples/host-app/index.ts
examples/host-app/README.md
examples/federated-module/package.json
examples/federated-module/index.ts
examples/federated-module/README.md
examples/shared/beacon-transport.ts
package.json
specs/001-structured-logging-core/quickstart.md
specs/002-beacon-transport/quickstart.md
.specify/memory/constitution.md
.specify/templates/**/*.md
```

## Globs — NOT in scope (audit must NOT scan these)

```text
src/**                                # FR-020 — internal source identifiers
tests/**                              # FR-021 — test fixtures, name-agnostic
specs/001-structured-logging-core/{spec,plan,tasks,research,data-model}.md
specs/001-structured-logging-core/contracts/**
specs/001-structured-logging-core/checklists/**
specs/002-beacon-transport/{spec,plan,tasks,research,data-model}.md
specs/002-beacon-transport/contracts/**
specs/002-beacon-transport/checklists/**
specs/003-rename-safesignal/**        # this feature's own spec; self-references are expected
node_modules/**                       # vendored
dist/**                               # build output; regenerated
package-lock.json                     # regenerated
examples/**/package-lock.json         # regenerated
examples/**/node_modules/**           # vendored
```

## Denied patterns

A "denied match" is any of the following case-sensitive strings
appearing inside an in-scope file:

- `frontend-logging-sdk`
- `@your-org`

Note: The audit is case-sensitive. `Frontend-Logging-SDK` or similar
proper-noun framings of the legacy concept are NOT denied because
they are unambiguous prose, not the literal package identifier.

## Allowed exceptions

A denied-pattern match is **allowed** (and the audit passes) only if
the match satisfies BOTH of the following:

1. The match appears inside a **migration-context callout** —
   defined as a clearly-labeled section, block, or paragraph that
   explicitly frames the legacy name as a former identity AND that
   names SafeSignal in the same paragraph or in the immediately
   adjacent paragraph.
2. The file is one of:
   - `README.md` (one migration-note block per FR-007).
   - `CHANGELOG.md` (the rename version's entry per FR-010).
   - `docs/safe-logging.md` (if a callout is needed for migration
     context in the body).

A reviewer assesses the callout by reading the surrounding
paragraph. The audit script flags the match for a human to
acknowledge; it does not automatically suppress it.

## Audit script (reference shell one-liner)

The audit is intentionally lightweight — a shell one-liner with
`grep -rn` against the in-scope globs is sufficient. The Phase 2
tasks.md will spell out the exact invocation; the reference form is:

```bash
# From repo root:
grep -rn --color=never \
  -E '(frontend-logging-sdk|@your-org)' \
  README.md CHANGELOG.md \
  docs/ \
  examples/host-app/package.json examples/host-app/index.ts examples/host-app/README.md \
  examples/federated-module/package.json examples/federated-module/index.ts examples/federated-module/README.md \
  examples/shared/beacon-transport.ts \
  package.json \
  specs/001-structured-logging-core/quickstart.md \
  specs/002-beacon-transport/quickstart.md \
  .specify/memory/constitution.md \
  .specify/templates/ \
  2>/dev/null
```

**Expected result** (post-rename, passing audit): zero matches, OR
all matches are inside the README.md migration-note block + the
CHANGELOG.md rename-version entry + (optionally)
`docs/safe-logging.md`'s migration paragraph.

The audit can be wrapped into a CI script
(`scripts/audit-legacy-name.sh`) or run as a one-off check during
the rename's final review.

## Pass / Fail criteria

- **PASS**: Zero denied matches, OR every denied match lives inside
  a migration-context callout that names SafeSignal in the same
  paragraph.
- **FAIL**: Any denied match outside a migration-context callout.

A FAIL means the rename is incomplete; the offending file must be
updated and the audit re-run before the rename feature is merged.

## Out-of-band considerations

- The audit ignores `dist/**` because builds are regenerated.
  Verification that `dist/` does not embed the legacy name is
  covered by re-running `npm run build` after the package metadata
  update.
- The audit ignores `package-lock.json` because npm regenerates it
  on `npm install` once `package.json`'s `name` field changes.
- A future feature that activates the dormant OTel adapter will
  expand the in-scope set to include the OTel namespace constants
  (`FLSDK_EVENT_KEY`, `LOGGER_NAME`); those are out of scope here
  per the boundary analysis in research.md.
