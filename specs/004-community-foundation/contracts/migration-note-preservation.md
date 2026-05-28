# Contract: Migration-Note Preservation

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](../spec.md)
**Maps to**: FR-028, SC-007, R-009

## Purpose

Verify that the v1.0.0 migration note from feature 003 is
preserved verbatim when it relocates from its current position
(directly under the README H1) to the new `## Migration history`
section deeper in the README.

The migration note has 7 required content elements (per feature
003's `contracts/migration-note.md`). All 7 MUST be present in
the relocated section. Body text MUST be byte-identical between
the pre-feature source and the post-feature destination.

## Source — the pre-feature migration block

The source is the content of `README.md` between (and including)
the migration-note heading and the end of that block, as it
exists at the `003-rename-safesignal` branch HEAD. Specifically:

- **Heading**: `## Renamed from \`frontend-logging-sdk\``
- **Body**: lines 11–40 (approximately) of `README.md` on
  `003-rename-safesignal`

The body covers the 7 required elements (per feature 003's
contract):

| Element | Description |
|---|---|
| (A) Legacy package name | `@your-org/frontend-logging-sdk` |
| (B) New SafeSignal package name | `@tallyrow/safesignal` |
| (C) Install one-liner | `npm install @tallyrow/safesignal` |
| (D) Import find-and-replace pattern | Legacy → new for `createLogger`, `createBeaconTransport`, `assertTransportContract` |
| (E) Subpath continuity statement | `/testing`, `/transport-beacon` unchanged |
| (F) Rename version | `v1.0.0` |
| (G) Behavior-preservation statement | No runtime/API/redaction/transport contract changes |

## Destination — the post-feature `## Migration history` section

After this feature ships, the README contains a new section
`## Migration history` (placed somewhere after the front matter,
the Quickstart section, and the Project resources section).

**Body of the relocated section MUST be byte-identical** to the
source body. Only the H2 heading changes:

- **Pre-feature heading**: `## Renamed from \`frontend-logging-sdk\``
- **Post-feature heading**: `## Migration history`

A brief intro paragraph (1-2 sentences) MAY be added between the
new H2 and the relocated body. Example:

```markdown
## Migration history

This package was previously developed under the working name
`@your-org/frontend-logging-sdk`. v1.0.0 (2026-05-28) renamed it
to **SafeSignal**, published on npm as `@tallyrow/safesignal`.
The following migration block was the original v1.0.0 notice and
remains here for consumers arriving via the legacy name.

<verbatim feature-003 migration block body — bytes identical to source>
```

The intro paragraph is the only addition. The body lines
(beginning with "This package was previously..." and ending with
"...within ±1 KiB of the pre-rename baseline. See [`CHANGELOG.md`](CHANGELOG.md)..."
or equivalent) MUST be byte-identical to the feature 003 source.

## Verification approach

The contract is verified by extracting both blocks and comparing
them byte-for-byte (excluding the H2 heading and the optional
intro paragraph).

```bash
# From repo root. Assumes feature 003 branch is at the merge-base
# (`master` after feature 003 merges).

# 1. Extract feature-003-era migration block body.
#    The block runs from the line after "## Renamed from" to the
#    blank line before the "## " that follows it.
git show 003-rename-safesignal:README.md \
  | sed -n '/^## Renamed from `frontend-logging-sdk`$/,/^## /p' \
  | sed '1d;$d' \
  | sed '/^$/d' \
  > /tmp/source-migration-block.txt

# 2. Extract current README's `## Migration history` block body.
#    Skip any 1-2 line intro paragraph; capture the rest.
sed -n '/^## Migration history$/,/^## /p' README.md \
  | sed '1d;$d' \
  | sed '/^$/d' \
  > /tmp/dest-migration-block.txt

# 3. Strip the optional intro paragraph from the destination if
#    present (heuristic: the source block starts with
#    "This package was previously developed").
sed -n '/^This package was previously developed/,$p' \
  /tmp/dest-migration-block.txt \
  > /tmp/dest-migration-block-stripped.txt

# 4. Verify all 7 required elements appear in the destination.
for marker in \
  "@your-org/frontend-logging-sdk" \
  "@tallyrow/safesignal" \
  "npm install @tallyrow/safesignal" \
  "createLogger" \
  "createBeaconTransport" \
  "/testing" \
  "/transport-beacon" \
  "v1.0.0"; do
  grep -q "$marker" /tmp/dest-migration-block-stripped.txt \
    || { echo "MISSING element: $marker"; exit 1; }
done

# 5. Byte-identical comparison (after stripping blanks for
#    formatting tolerance).
diff -q /tmp/source-migration-block.txt /tmp/dest-migration-block-stripped.txt \
  || { echo "MIGRATION-NOTE BODY DRIFTED — see diff above"; exit 1; }

echo "migration-note-preservation PASS"
```

## Pass / Fail criteria

- **PASS**:
  - The `## Migration history` section exists in the post-feature
    README.
  - All 7 required content elements (A–G) appear in the relocated
    section.
  - The body bytes (excluding the new H2 and the optional intro
    paragraph) match the feature-003 source block byte-for-byte.
- **FAIL**:
  - The `## Migration history` section is missing.
  - Any of the 7 required elements is absent from the destination.
  - The body bytes have drifted from the source.

A FAIL means the relocation lost or modified content. Restore the
verbatim feature-003 body and re-run.
