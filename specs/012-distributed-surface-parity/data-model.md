# Phase 1 Data Model: Enforce Distributed-Surface Parity with exports/docs

This feature has **no browser/runtime data entities**. The "data model" here is the set of records
the parity test derives and compares at check time. All are computed in-process from `npm pack`
output + `package.json`, are network-free and deterministic, and contain only file paths/metadata
(no secrets — FR-012).

## Entities

### PublishedFileSet

The files `npm pack` would include for the package — the actual shipped surface.

| Field | Type | Notes |
|-------|------|-------|
| `paths` | string[] | Repo-relative paths from `npm pack --dry-run --json` → `result[0].files[].path` (e.g., `dist/index.mjs`, `package.json`, `README.md`, `LICENSE`). |
| `entryCount` | number | `result[0].entryCount` — sanity cross-check against `paths.length`. |

**Validation rules**
- Derived only from `npm pack --dry-run --json`; never hand-maintained.
- Paths are repo-relative and forward-slashed (no absolute/machine paths — FR-012).

### DeclaredEntryTargets

Every file path the package's resolution metadata points at.

| Field | Type | Notes |
|-------|------|-------|
| `targets` | string[] | The union of each `exports[subpath].{types,import,require}` plus `main`, `module`, `types`, each normalized by stripping a leading `./` (e.g., `dist/index.d.ts`). |

**Validation rules**
- Read from `package.json`; deduplicated. Each MUST appear in `PublishedFileSet.paths`.

### DocumentedSurfaceContract

The authoritative enumeration the gate compares against (`contracts/distributed-surface.md`,
encoded in the test).

| Field | Type | Notes |
|-------|------|-------|
| `publicSubpaths` | string[] | `['.', './testing', './transport-beacon', './transport-otlp']` — the documented public `exports` keys. |
| `inSurface(path)` | predicate | True iff `path` is within the documented surface: `path.startsWith('dist/')` OR `path === 'package.json'` OR `/^(README\|LICEN[CS]E)/i.test(path)`. |

**Validation rules**
- `publicSubpaths` MUST equal `Object.keys(package.json.exports)` (sorted) — drift either way fails.
- `inSurface` encodes the `files` boundary (`dist`) + npm-mandatory metadata; it is the definition
  of "documented surface", so legitimate `dist/` resolution-support files (maps, `.d.cts`, shared
  chunks) are in-surface and not stray (FR-006).

### ParityVerdict

The result of comparing the actual surface to the documented contract.

| Field | Type | Notes |
|-------|------|-------|
| `missingTargets` | string[] | Declared targets absent from `PublishedFileSet` (FR-002 failures). |
| `strayFiles` | string[] | Packed paths failing `inSurface` (FR-003 failures). |
| `subpathDrift` | {undocumented: string[], missing: string[]} | `exports` keys not in the documented set; documented subpaths not in `exports` (FR-004 failures). |
| `pass` | boolean | True iff all three lists are empty. |

## Relationships

```text
package.json ──exports/main/module/types──▶ DeclaredEntryTargets ─┐
            └──exports keys──▶ (compare) ── DocumentedSurfaceContract.publicSubpaths
                                                                   │
`npm pack --dry-run --json` ──▶ PublishedFileSet ──────────────────┤
                                  │  every target ∈ paths?  (missingTargets)
                                  │  every path inSurface?  (strayFiles)
                                  ▼
                              ParityVerdict ──▶ test pass (exit 0) / fail (exit non-zero)
```

## Drift scenarios (lifecycle)

- **`exports` target's file not built / renamed** → `missingTargets` non-empty → fail (FR-002).
- **`files` widened (e.g., `["dist","src"]`)** → `src/...` packed → `strayFiles` non-empty → fail
  (FR-003).
- **New `exports` subpath added without updating the contract** → `subpathDrift.undocumented` →
  fail (FR-004); **documented subpath removed from `exports`** → `subpathDrift.missing` → fail.
- **Normal build output** (maps, `.d.cts`, shared chunk under `dist/`) → `inSurface` true → not
  stray → pass (FR-006).
- **`README`/`LICENSE`/`package.json`** auto-included by npm → `inSurface` true → not stray.
