# Phase 1 Data Model: Enforce Deprecate-Before-Remove for the Public API

This feature has **no browser/runtime data entities**. The "data model" here is the set of
records the extraction-and-gate tooling produces and consumes on disk. All records are
deterministic, network-free, and contain only public-type information (no secrets — FR-013).

## Entities

### PublicSymbol

One exported value or type reachable from an `exports` entry point.

| Field | Type | Notes |
|-------|------|-------|
| `entry` | string | The `exports` subpath the symbol is reachable from: `"."`, `"./testing"`, `"./transport-beacon"`, `"./transport-otlp"`. |
| `name` | string | The exported identifier (e.g., `createLogger`, `LogEvent`). |
| `kind` | enum | One of `function` \| `class` \| `interface` \| `type` \| `const` \| `enum`. |
| `signature` | string | **Normalized** declaration shape for the kind (function/method signature, type-alias/interface shape, class public-member set, const type). Whitespace and import-path noise normalized out so only meaningful changes register. |
| `deprecated` | boolean | `true` iff the symbol carries an `@deprecated` JSDoc/TSDoc tag in the declaration. |

**Validation rules**
- `(entry, name)` is the unique identity of a symbol within a surface.
- `kind` and `signature` are derived from the built `dist/*.d.ts` via the `typescript` compiler
  API, never hand-authored.
- `deprecated` is derived from the tag, not from a side list.

### PublicSurface

The complete set of `PublicSymbol`s for a single build, across all four entry points.

| Field | Type | Notes |
|-------|------|-------|
| `version` | string | The package version the surface was extracted at (from `package.json`). |
| `symbols` | PublicSymbol[] | Sorted by `(entry, name)` for deterministic, diff-friendly output. |

**Validation rules**
- Serialization MUST be byte-stable: sorted symbols + stable key order + fixed formatting, so
  the same source state yields identical output on any machine (Principle IX).
- No absolute paths, environment values, or non-public identifiers may appear (FR-013).

### SurfaceBaseline (`api/surface.json`)

A committed `PublicSurface` representing the **last published release's** surface. Frozen between
releases; refreshed only at release time by `npm run api:extract`. The reference the current
build is compared against. **Not** included in `package.json` `files`, so it is never published.

### AllowEntry (`api/surface-allow.json`)

A reviewed acknowledgment that a specific signature change is backward-compatible. The file is an
array, **usually empty `[]`**; entries are added in the PR that makes a compatible change and
cleared when the baseline is refreshed at release.

| Field | Type | Notes |
|-------|------|-------|
| `entry` | string | The symbol's `exports` subpath. |
| `name` | string | The symbol identifier. |
| `from` | string | The baseline `signature` being changed. |
| `to` | string | The new `signature` asserted compatible. |
| `reason` | string | Why the change is backward-compatible (human-readable). |
| `reviewedBy` | string | The reviewer/maintainer acknowledging it. |

**Validation rules**
- An entry only suppresses a CHANGED finding when its `(entry, name, from, to)` matches the exact
  observed transition — a stale or imprecise entry does not silently pass an unrelated change.
- Entries are remediation debt: they exist only for the current in-flight cycle and are removed
  when the baseline folds the change in.

### GateVerdict

The result of comparing the current `PublicSurface` to the `SurfaceBaseline`.

| Field | Type | Notes |
|-------|------|-------|
| `removed` | Finding[] | Baseline symbols absent from current. |
| `changed` | Finding[] | Symbols whose `signature` differs. |
| `added` | Finding[] | Current symbols absent from baseline (informational). |
| `violations` | Finding[] | The subset of `removed`+`changed` that is **not** excused (not baseline-`deprecated`, not allow-listed). |
| `pass` | boolean | `true` iff `violations` is empty. |

Each `Finding` carries `{ entry, name, class: "removed"|"changed"|"added", excusedBy?: "deprecated"|"allow-list" }`.

## State transitions (lifecycle of a public symbol under the gate)

```text
                 add symbol (ADDED → pass)
   (absent) ───────────────────────────────▶ (live, not deprecated)
                                                      │
                                       add @deprecated │ (CHANGED on the symbol's own
                                       + replacement   │  doc only; still present → pass)
                                                      ▼
                                              (live, deprecated)
                                                      │
                              ── release cut: baseline refreshed ──
                              (baseline now records deprecated:true)
                                                      │
                               remove symbol (REMOVED, excused by
                               baseline deprecated:true → pass)
                                                      ▼
                                                  (absent)
```

- **Removing a non-deprecated published symbol** → REMOVED, not excused → **violation** (fail).
- **Deprecate-and-remove before any release** → baseline still has it as non-deprecated →
  REMOVED, not excused → **violation** (fail). The one-minor window was not honored.
- **Compatible signature change** → CHANGED → excused only by a matching `AllowEntry` (fail
  otherwise).
- **Incompatible signature change without deprecation** → CHANGED, not excused → **violation**.

## Relationships

```text
package.json "exports" ──defines──▶ 4 entry points
        │
        ▼
dist/*.d.ts (built) ──extract-surface.mjs──▶ PublicSurface (current)
                                                   │
                  compare-surface.mjs ◀── SurfaceBaseline (api/surface.json, frozen)
                          (minus AllowEntry[] from api/surface-allow.json)
                                                   │
                                                   ▼
                            GateVerdict ──check-surface.mjs──▶ exit 0 (pass) / 1 (violation)
```

*Entrypoint*: `npm run api:check` → `node scripts/api/check-surface.mjs`, which guards the
honest `dist/` prerequisite, calls `extract-surface.mjs`, then `compare-surface.mjs`, and exits
on the `GateVerdict`. Cross-platform (no Bash); each `.mjs` ships a sibling `.d.mts` so the TS
contract tests import the same logic typed.
