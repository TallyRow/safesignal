# Phase 0 Research: Enforce Deprecate-Before-Remove for the Public API

All Technical Context unknowns from `plan.md` are resolved below. Each decision records the
choice, the rationale, and the alternatives rejected.

## R1. How to extract the public API surface

**Decision**: A Node ESM script (`scripts/api/extract-surface.mjs`) using the bundled
**`typescript` compiler API** to load the built `dist/*.d.ts` for each of the four `exports`
entry points, enumerate each module's exported symbols (`checker.getExportsOfModule`), and emit
a deterministic JSON record per symbol: `{ entry, name, kind, signature, deprecated }`.

**Rationale**:
- **No new dependency.** `typescript` is already a devDependency; the build already emits
  `dist/*.d.ts` (`tsup` `dts: true`). This honors Principle VI (deliberate, minimal dependency
  selection) and Principle XI (no new supply-chain entrant).
- **Reads the shipped declaration surface.** Operating on `dist/*.d.ts` (not `src`) checks the
  exact surface consumers receive, aligning with Principle XI's "distributed surface honest"
  intent. `@deprecated` JSDoc tags propagate into the emitted `.d.ts`, so deprecation status is
  recoverable via `symbol.getJsDocTags()`.
- **Deterministic & network-free.** Sorting symbols and serializing with stable key order yields
  byte-identical output across machines → satisfies Principle IX (identical local/CI outcome).
- **Full control over normalization.** We decide what counts as a "signature" (see R3), so the
  gate's sensitivity is tunable and explainable.
- **Typed TS tests without a build step or `allowJs`.** The extractor and its sibling modules are
  authored as Node ESM `.mjs` (runnable directly by `node`, no transpile, no new dependency); each
  ships a hand-authored sibling `.d.mts` declaration so the TypeScript contract tests import them
  fully typed and `tsc --noEmit -p tests/tsconfig.json` resolves them — keeping test code at `src/`
  typing standards (Principle VI/IX) without enabling `allowJs` and without a TS loader like `tsx`.

**Alternatives considered**:
- **`@microsoft/api-extractor`** — rejected. It natively models `@deprecated` and release tags
  and emits a reviewable `.api.md`, but it is a heavy, opinionated dependency that prefers a
  single rolled-up entry point per package (this package has four `exports`), expects its own
  `.d.ts` rollup configuration, and adds meaningful devDependency + maintenance weight for a tiny
  public surface. Pulls against Principle VI and adds a supply-chain entrant for marginal benefit.
- **String-diffing raw `dist/*.d.ts`** — rejected. Brittle: formatting/import-order churn and
  internal type renames produce noise; cannot cleanly attribute a change to a *symbol* or read
  `@deprecated` status structurally.
- **Parsing `src/**` directly** — rejected. Misses the rollup/transform the build applies and
  can diverge from what actually ships; the `.d.ts` is the contract of record.

## R2. Where the comparison baseline lives and when it updates

**Decision**: A **committed** `api/surface.json` representing the **last published release's**
surface. It is **frozen between releases** (deliberately not regenerated on feature PRs) and is
**refreshed only at release time** via `npm run api:extract`, committed alongside the
CHANGELOG-first release commit. The PR/main gate compares the *current build* against this frozen
baseline. `api/` is **not** in `package.json` `files` (which stays `["dist"]`), so the baseline
never ships to consumers.

**Rationale**:
- "Deprecated for at least one minor release before removal" (Principle II) is decidable purely
  from `{ frozen-last-published-surface, current-build }` — no version-history reconstruction and
  no network. A symbol removed/changed now passes iff it was `@deprecated` **in the last published
  surface**.
- The freeze is the feature: a feature PR that merely *adds* a symbol shows up as an addition
  (passes); the baseline only catches removals/changes against what was actually published.
- Committed + reviewed: the baseline diff is visible in the release PR, and the gate is
  network-free and reproducible (Principle IX). Not shipping it keeps the distributed surface
  honest (Principle XI).

**Alternatives considered**:
- **Fetch the last published npm tarball at check time and extract its `.d.ts`** — rejected.
  Always-true-to-published, but needs network in CI and locally (fragile, non-reproducible if the
  registry is slow/down; violates Principle IX's "honest prerequisites, no environment-dependent
  outcome").
- **Regenerate the snapshot on every PR (api-extractor `--local` style)** — rejected for the
  *deprecation* gate. That model reviews *every* change but loses the "prior published release"
  reference the one-minor window needs; the baseline would always equal HEAD and never flag a
  same-cycle deprecate-and-remove.

## R3. What counts as an "incompatible change", and the v1 boundary

**Decision**: Two delta classes against the baseline:
1. **REMOVED** (symbol present in baseline, absent in current — includes renames and whole
   entry-point removal): **fails closed** unless the baseline symbol was `deprecated: true`.
2. **CHANGED** (symbol present in both, `signature` string differs): **fails closed** unless the
   baseline symbol was `deprecated: true` **or** an `api/surface-allow.json` entry explicitly
   acknowledges the exact `from → to` signature transition as backward-compatible.
3. **ADDED** (absent in baseline, present in current): always **passes**.

The `signature` is a **normalized** string per symbol kind (function/method signature, type
alias/interface shape, class public member set, const type). Whitespace/import-path noise is
normalized out so only meaningful shape changes register.

v1 **does not** ship a structural type-compatibility engine that auto-proves a signature change
is a compatible widening (e.g., a new optional parameter). Such changes trip CHANGED and require
a reviewed allow-entry. (See Complexity Tracking in `plan.md`; refinement is a tracked follow-up.)

This is exactly what revised **FR-005** describes: pure additions pass automatically, and a
backward-compatible signature change is **not** forced through deprecate-before-remove — it is
cleared by the one-time reviewed acknowledgment (the allow-entry). The allow-entry is the
"reviewed acknowledgment," not a deprecation step; the deferred follow-up replaces it with
automated classification so even that acknowledgment disappears for provably-compatible changes.

**Rationale**:
- Removal/rename is the unambiguous, highest-damage case named in issue #5 and is fully,
  mechanically enforced.
- The conservative default (CHANGED fails unless deprecated or explicitly acknowledged) is
  **fail-closed** — a false alarm a maintainer resolves with a reviewed assertion, never a
  silently-shipped break (matches the spec's stated conservative-incompatibility assumption).
- The allow-list keeps the gate from blocking legitimate compatible evolution (which would tempt
  contributors to disable it — an anti-pattern), while keeping every override **auditable and
  reviewed** (Principle X), not a silent skip. Allow-entries are cleared at release when the
  baseline is refreshed (the delta they describe is folded in).

**Alternatives considered**:
- **Removal-only gate (ignore signature changes)** — rejected as under-delivering vs spec
  FR-001/FR-002 ("removed *or* changed incompatibly"). The allow-listed CHANGED path covers
  changes without a full analyzer.
- **Full structural type-compat analyzer in v1** — rejected for weight on a tiny surface; tracked
  as a time-bound follow-up instead so the documented gate is enforced today (Principle X).

## R4. How deprecation is signaled and detected

**Decision**: The machine-readable signal is the **`@deprecated` JSDoc/TSDoc tag** on the
exported symbol, read via the compiler API (`symbol.getJsDocTags()` / leading JSDoc on the
declaration) and recorded as `deprecated: true` in the snapshot. This is consistent with
Principle II's required signaling surface (types / `@deprecated` / changelog) and surfaces in
consumer IDE tooling automatically.

**Rationale**: `@deprecated` is the one signal that is simultaneously (a) visible to consumers in
types/editors, (b) emitted into `dist/*.d.ts`, and (c) structurally readable by the extractor —
so the *same* annotation satisfies the human-facing requirement and feeds the mechanical gate.
The CHANGELOG mention remains required by the release runbook (and `changelog-validate`), but the
gate keys on `@deprecated` because it is the in-type, machine-readable marker.

**Alternatives considered**: a separate hand-maintained "deprecated symbols" list (rejected —
drifts from the types consumers see, duplicates the source of truth, and is itself unenforced).

## R5. Where the gate runs and how it stays reproducible

**Decision**: A cross-platform **Node ESM entrypoint** `scripts/api/check-surface.mjs`, invoked by
`npm run api:check`, run by a new `api-surface` job in `ci.yml` and added to the **`ci-success`**
aggregate `needs[]` (the single required merge gate). It consumes the existing build artifact like
other jobs; in-process it checks for `dist/*.d.ts` and **fails loudly** with "run `npm run build`
first" when absent (honest prerequisite — never a silent pass). A separate **freshness** assertion
in `release.yml` confirms `api/surface.json` equals the built surface at the tagged commit.

**Rationale**:
- One documented entrypoint, identical exit code local/CI (Principle IX); wired into the same
  aggregate gate as the other quality checks (Principle X — the rule actually blocks merge).
- **Node, not Bash.** The core diff reads committed files (no git base-detection needed), so the
  gate has no reason to be a shell script; a Node entrypoint runs identically on
  Windows/macOS/Linux with the same exit-code semantics, which matters because the primary dev
  platform here is Windows and no existing `npm` script shells out to `bash`. The CI YAML invokes
  it the same way `coverage`/`test` invoke their `npm` scripts.
- The release freshness check mirrors `changelog-validate`'s "the entry must exist" discipline:
  it prevents a release from shipping with a stale baseline, so each published version genuinely
  becomes the next comparison reference (FR-007). It may use the `CI_COMMIT_TAG`/`CI_DEFAULT_BRANCH`
  conventions to locate the tagged commit, matching the existing release scripts.

**Alternatives considered**:
- **A Bash wrapper as the npm entrypoint** (`"api:check": "bash scripts/ci/…sh"`) — rejected.
  No existing `npm` script shells out to `bash`, and on the Windows dev platform `npm run api:check`
  would depend on git-bash being on `PATH`, risking local/CI divergence (Principle IX). A Node
  entrypoint removes the dependency and the redundant wrapper layer (the logic is Node already).
- **A standalone required check outside `ci-success`** — rejected; the repo's branch protection
  requires the single `ci-success` aggregate, so the gate must join its `needs[]` to actually
  block merges.
- **Regenerate-and-commit the baseline from the tag build in `release.yml`** — rejected;
  committing back to `main` from a tag-triggered run is awkward and bypasses review. The
  CHANGELOG-first manual runbook already has the maintainer prepare the release commit, so the
  `api:extract` refresh belongs there, with CI only *asserting* freshness.

## R6. Security & privacy of the new artifacts

**Decision**: The snapshot, allow-file, and gate output contain **only** public symbol names,
kinds, and normalized signatures — no secrets, tokens, consumer data, or absolute source paths.
The extractor normalizes away machine-specific paths and emits stable relative identifiers.

**Rationale**: FR-013 and Principle V's secure-by-default posture. Although this is tooling (no
runtime logging), the committed artifacts and CI logs must not become a leakage vector; keeping
them to public-type information also means the (non-shipped) baseline reveals nothing a consumer
of the public types could not already see.

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Surface extraction mechanism | Node script over `dist/*.d.ts` via the bundled `typescript` compiler API; no new dep (R1) |
| Tooling language & TS-test boundary | Node ESM `.mjs` modules each with a sibling `.d.mts` declaration so TS tests import typed (no `allowJs`, no `tsx`) (R1) |
| Baseline storage & refresh cadence | Committed `api/surface.json` = last published surface, frozen between releases, refreshed at release; not packaged (R2) |
| "Incompatible change" definition / v1 depth | REMOVED + CHANGED(signature) fail closed unless baseline-deprecated or reviewed-allow-listed (the FR-005 acknowledgment); no auto type-compat engine in v1 (R3) |
| Deprecation signal | `@deprecated` JSDoc tag read structurally → `deprecated: true` (R4) |
| Run location & reproducibility | Cross-platform Node entrypoint `scripts/api/check-surface.mjs` via `npm run api:check`, in `ci-success`; release freshness check; honest in-process `dist/` prerequisite (R5) |
| Artifact security | Public-type info only; no secrets/paths (R6) |
