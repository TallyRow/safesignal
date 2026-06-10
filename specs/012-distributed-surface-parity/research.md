# Phase 0 Research: Enforce Distributed-Surface Parity with exports/docs

All Technical Context unknowns from `plan.md` are resolved below. Each decision records the
choice, the rationale, and the alternatives rejected.

## R0. Does the existing audit already cover this? (issue #6's "first step")

**Finding**: **No — there is a real gap.** A repo sweep of the packaging/bundle-shape suite:

| Dimension | Covered today? | Where |
|-----------|----------------|-------|
| `exports` map keys are exactly the four subpaths | ✅ shape only | `tests/contract/dependency-pins.test.ts` (T070 sanity block) |
| Each `exports` entry has a `types/import/require` triple | ✅ shape only (and its `it.each` even omits `./transport-otlp`) | `dependency-pins.test.ts` |
| `main`/`module`/`types` point into `dist/` | ✅ shape only | `dependency-pins.test.ts` |
| Bundle vendor-neutrality / isolation / gzip budgets | ✅ | `tests/security/*bundle-shape*.test.ts` |
| **Every `exports`/entry target actually ships (`npm pack` resolution)** | ❌ | — |
| **No stray/undocumented file is packaged** | ❌ | — |
| **`exports` key set == documented public-subpath set** | ⚠️ keys checked, but not tied to a documented contract as the source of truth | — |

**Conclusion**: The "first step" resolves to *add a fail-closed check* (the documenting-only path
is insufficient). The new gate is **orthogonal** to and **builds on** the existing shape check — it
adds the *resolution*, *stray-file*, and *docs-parity* dimensions that no current test covers.

## R1. How to compute the actual published file set

**Decision**: Spawn **`npm pack --dry-run --json`** (via `node:child_process`) and read
`result[0].files[].path`. This is the authoritative list of files `npm publish` would ship.

**Rationale**:
- **Authoritative, zero new dependency.** It is exactly what npm uses to build the tarball, so the
  gate verifies the *real* shipped surface — not a re-derivation that could drift from npm's
  `files`/`.npmignore`/default-inclusion logic. Confirmed output buckets for this package:
  `LICENSE`, `README.md`, `package.json`, `dist/**` (29 files).
- **Network-free & deterministic** (`--dry-run` never contacts the registry), satisfying
  Principle IX (identical local/CI for the same source state).
- **House-consistent.** The packaging/bundle-shape invariants already live in Vitest contract tests;
  spawning a child process from a test is the same pattern Feature 011's prereq test uses.

**Alternatives considered**:
- **`npm-packlist` / `@npmcli/arborist`** — rejected. They compute the same list as a library, but
  add a new dependency (against Principle VI / XI) for what the bundled `npm` CLI already provides.
- **Re-deriving the file set from `files` + a manual `.npmignore` reading** — rejected. Brittle and
  duplicates npm's inclusion rules (mandatory `package.json`/`README`/`LICENSE`, `main` auto-include,
  glob semantics); it would drift from what npm actually ships.

## R2. The parity rule — what the gate asserts

**Decision**: Three dimensions against the documented surface contract:

1. **Targets ship (FR-002)**: every `exports` subpath's `types`/`import`/`require` file, plus
   `main`/`module`/`types`, normalized (strip leading `./`), MUST be present in the packed set.
2. **No stray file (FR-003)**: every packed path MUST be *in surface* — i.e.
   `path.startsWith('dist/')` **or** `path === 'package.json'` **or** it is npm-mandatory metadata
   (`/^(README|LICEN[CS]E)/i`). Anything else (a `src/`, `tests/`, config, or secret-bearing file) is
   a stray inclusion → fail.
3. **Subpath set matches docs (FR-004)**: `Object.keys(exports)` sorted MUST equal the documented
   public-subpath set (`.`, `./testing`, `./transport-beacon`, `./transport-otlp`).

**Rationale**:
- Dimension 2's "in-surface = under `dist/` or npm metadata" rule **naturally resolves the
  resolution-support nuance (FR-006)**: source maps (`dist/*.map`), `.d.cts` declarations, and the
  shared `dist/types-*.d.ts` chunk are all under `dist/`, so they are in-surface without special
  casing — and the gate does **not** false-positive on legitimate build output it can't tie to an
  `exports` key.
- Dimensions are checked independently so a failure can name the exact drift class (FR-009).

**Alternatives considered**:
- **"Stray = any packed file not named by an `exports` key"** — rejected; it would flag every map,
  `.d.cts`, and shared chunk as stray (massive false positives). The `files`-boundary rule is the
  correct, intent-matching definition of the documented surface.

## R3. Where the documented source of truth lives

**Decision**: `specs/012-distributed-surface-parity/contracts/distributed-surface.md` is the
authoritative contract — it enumerates the four public subpaths, the in-surface rule, and the
resolution-support categories. The test encodes the same enumeration (a `PUBLIC_SUBPATHS` constant
+ the in-surface predicate) with a reference to the contract, mirroring the existing
`dependency-pins.test.ts` pattern (which hard-codes the expected keys/triples with a contract
reference).

**Rationale**:
- The surface here is a small, stable **bounded rule** (four subpaths + a directory boundary), not a
  per-item snapshot like Feature 011's API surface — so a committed machine-readable manifest would
  be over-engineering. The contract doc + the test's encoded constant is the right altitude, and the
  test failing on drift forces the doc to be updated (keeping them in parity).
- Matches the repo's established "contract states it, test enforces it" convention.

**Alternatives considered**:
- **A committed JSON manifest (à la `api/surface.json`)** — rejected as over-engineering for a
  four-row, rarely-changing contract; adds a refresh step with no real benefit.
- **Parsing `README.md` for subpath mentions** — rejected as brittle (prose format); the contract
  doc is the precise, stable source of truth, with the README remaining human-facing docs.

## R4. Where the gate runs and how it stays reproducible

**Decision**: A Vitest contract test `tests/contract/distributed-surface.contract.test.ts`, exposed
locally as `npm run surface:check` and added to the existing **`dependency-pins`** job in `ci.yml`
and `release.yml` (that job already runs the packaging/bundle-shape tests, is in the required
`ci-success` aggregate, and runs in the release pipeline). A `beforeAll` guard fails loudly with
"run `npm run build` first" if `dist/` is absent (honest prerequisite — never a silent pass).

**Rationale**:
- Identical verdict local/CI for the same source (Principle IX): locally via the documented
  `npm run surface:check`, in CI via the *same test file* run inside the `dependency-pins` job's
  `npm test --` batch — same test, so the same verdict (an accepted command-form difference, not a
  CI-only shim). The job's test step gets a descriptive `name:` so a parity failure is self-evident.
  Folding into `dependency-pins` is the minimal change that still gates merge *and* release — no new
  job, no new
  `ci-success` `needs[]` entry (Principle X — the rule actually blocks both paths).
- The `dependency-pins` job already downloads the `dist` build artifact, so `npm pack` sees the
  built surface; locally, the prerequisite guard makes the build requirement explicit.

**Alternatives considered**:
- **A dedicated `distributed-surface` CI job** (symmetry with Feature 011's `api-surface`) —
  rejected as heavier for no extra coverage; folding into the existing packaging job is simpler and
  equally enforced. (A future `dependency-pins` → `packaging-contracts` rename is optional polish.)
- **A standalone node script + `npm run`-only gate (no test)** — rejected; the invariant is a
  natural Vitest assertion and belongs with the other packaging contract tests for discoverability.

## R5. Security & privacy of the gate

**Decision**: The test, the contract doc, and the failure output contain **only file paths and
packaging metadata** — no secrets, tokens, or consumer data, and no absolute machine paths (the
`npm pack` JSON emits repo-relative paths).

**Rationale**: FR-012 and Principle V's secure-by-default posture. The feature is in fact a *net
security improvement*: by failing closed on any packaged file outside `dist/` + npm metadata, it
mechanically prevents an undocumented (possibly secret-bearing) file from shipping.

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Existing-coverage gap (issue first step) | No coverage of pack-resolution / stray-file / docs-parity; add a fail-closed check (R0) |
| Compute the published file set | `npm pack --dry-run --json` via child_process; no new dep (R1) |
| Parity rule | Targets ship + no out-of-`dist/`-stray + subpath-set == documented; `dist/` boundary resolves the support-file nuance (R2) |
| Documented source of truth | `contracts/distributed-surface.md` + the test's encoded enumeration; no JSON manifest (R3) |
| Run location & reproducibility | Vitest test, `npm run surface:check`, folded into the `dependency-pins` job (ci + release); honest `dist/` prerequisite (R4) |
| Security | Paths/metadata only; net reduction in stray-file/secret-ship risk (R5) |
