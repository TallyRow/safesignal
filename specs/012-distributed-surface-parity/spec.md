# Feature Specification: Enforce Distributed-Surface Parity with exports/docs

**Feature Branch**: `012-distributed-surface-parity`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #6 — "Enforce distributed-surface parity with exports/docs (constitution Principle XI / X)"

> **Why this exists.** Constitution **v1.4.0** (PR #4) added **Principle XI — Supply-Chain
> Integrity & Verifiable Provenance**: *what ships (entry points, the `exports` map, bundle
> contents) MUST match what is documented and contracted; nothing undocumented rides along.*
> **Principle X — Mechanical Enforcement** requires every documented gate to have a
> machine-executable enforcement path. This one has none, so it was filed (issue #6) as the
> named, time-bound remediation Principle X itself mandates. The issue's "first step" — confirm
> whether the existing bundle-shape audit already covers `exports`↔packaged-files↔docs parity —
> has been answered: **it does not.** Today's checks lock the `exports` map *shape* (keys + the
> `types/import/require` triple) and bundle vendor-neutrality/size, but nothing runs `npm pack`,
> verifies each `exports` target actually ships, or guards against a stray/undocumented packaged
> file. This feature closes that gap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A broken or dishonest distributed surface cannot ship (Priority: P1)

A maintainer makes a packaging change — adds an `exports` subpath whose build output is missing,
renames a built file so an `exports` target no longer resolves, or widens `files` so a stray
file (source, test, secret) rides along in the tarball. An automated gate computes the **actual
published file set** and the **declared entry-point targets**, detects the drift, **fails
closed**, and blocks the merge/release until the surface matches what is documented.

**Why this priority**: This is the feature and the MVP. Without it, Principle XI's "what ships
matches what is documented" is unenforced — a consumer could `npm install` a package whose
`./transport-otlp` subpath 404s, or whose tarball carries files never meant to ship. Local
reproduction and documentation are supporting machinery around this one gate.

**Independent Test**: On a throwaway branch, point an `exports` target at a non-existent file (or
add a stray path to `files`); run the gate; confirm it exits non-zero naming the specific drift.
Restore; confirm it passes. Deliverable value: the distributed surface is now provably honest.

**Acceptance Scenarios**:

1. **Given** an `exports` subpath target (its `types`/`import`/`require` file) that is **not** in
   the published file set, **When** the gate runs, **Then** it fails closed and names the missing
   target.
2. **Given** a packaged file **outside** the documented distributed surface (e.g., a `src/` or
   `tests/` file, or anything beyond the declared `files` + npm's mandatory metadata), **When**
   the gate runs, **Then** it fails closed and names the stray file.
3. **Given** the four documented public subpaths all resolving to shipped files and no stray
   inclusion, **When** the gate runs, **Then** it passes.

---

### User Story 2 - A contributor reproduces the verdict locally before pushing (Priority: P2)

Before opening a PR, a contributor runs a single documented project command and gets the **same**
pass/fail verdict the CI gate will produce, so packaging drift is caught at the desk rather than
from a red pipeline.

**Why this priority**: Principle IX requires identical local and CI outcomes for the same source
state. A packaging gate that can only run in CI wastes round-trips. Valuable, but only once the
P1 gate exists.

**Independent Test**: Run the documented command locally against a branch with packaging drift
and a clean branch; confirm the verdict matches what CI reports for the identical commits.

**Acceptance Scenarios**:

1. **Given** a source state, **When** the gate runs locally and in CI, **Then** both produce the
   identical pass/fail verdict and the same drift list.
2. **Given** a fresh clone with dependencies installed, **When** the contributor runs the single
   documented command, **Then** no extra environment-specific setup is required to reproduce the
   CI result.

---

### User Story 3 - The contract is documented and failures are actionable (Priority: P3)

There is a documented source of truth — a contract enumerating the public subpaths and the
expected published surface — that the gate compares against, so "docs match what ships" is a real
comparison and not an assumption. When the gate fails, the message names the specific drift
(missing target / stray file / undocumented subpath) and how to resolve it; and a contributor
reading the rule can trace it to the enforcing check.

**Why this priority**: Principle XI requires the shipped surface to match what is *documented* —
which presupposes a documented surface to compare against. Principle X requires the enforcement
path be discoverable. This turns a packaging failure into a self-service fix, but the gate
delivers its core protection without it.

**Independent Test**: Confirm a documented surface contract exists and the gate reads it; trigger
a drift and confirm the message identifies the offending file/subpath and the remediation; from
the documented rule, confirm a reference resolves to the enforcing check.

**Acceptance Scenarios**:

1. **Given** the documented distributed-surface contract, **When** the gate runs, **Then** it
   compares the actual published surface against that documented set (not a hard-coded guess).
2. **Given** a gate failure, **When** the contributor reads the output, **Then** it names the
   drift and the remediation, and the documented rule references the enforcing mechanism.

---

### Edge Cases

- **Resolution-support files**: the published `dist/` legitimately contains files no `exports`
  key names directly — source maps, the `.d.cts` CommonJS declarations, and shared declaration
  chunks that the entry `.d.ts` re-exports from. These are **within** the documented surface and
  MUST NOT be flagged as stray; "stray" means a file **outside** the declared surface, not every
  unnamed `dist/` file.
- **npm's mandatory inclusions**: `package.json`, `README`, and `LICENSE` are always packaged
  regardless of `files`; the contract accounts for them so they are not flagged as stray.
- **New subpath added without a build target**: an `exports` entry whose file was never built →
  missing-target failure.
- **New subpath added without documentation**: an `exports` key not present in the documented
  public-subpath set → undocumented-subpath failure (and vice versa: a documented subpath dropped
  from `exports`).
- **`files` widened to a glob that captures extra paths** (e.g., `["dist", "src"]` or `["."]`) →
  stray-file failure.
- **A built entry file deleted or renamed** so an `exports`/`main`/`module`/`types` target no
  longer resolves → missing-target failure.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature adds a packaging-parity check, a
  documented surface contract, CI wiring, and documentation. It does not add, remove, or alter any
  exported symbol, `exports` subpath, or packaged file of `@tallyrow/safesignal`.
- **Compatibility Impact**: Backward compatible / additive (project tooling only). It *protects*
  the existing distributed surface rather than changing it.
- **Migration Notes**: None for consumers. For maintainers: packaging changes (new subpath,
  changed `files`, renamed build output) now run through the parity gate.
- **Deprecation & Migration**: No package contract is deprecated or removed.
- **Host/Module Usage Impact**: None. No runtime, `Logger`, transport, or resolution behavior
  changes; host apps and federated modules are unaffected.
- **Security & Privacy Considerations**: No runtime behavior change. The parity check operates on
  file paths and packaging metadata only — it MUST NOT embed or print secrets, tokens, or consumer
  data into the repo, CI logs, or artifacts. By guarding against stray packaged files, the feature
  *reduces* the risk of an undocumented file (including a secret-bearing one) shipping.
- **Log Integrity Considerations**: No impact. No event production is touched.
- **Runtime Scale & Federated Deployment Impact**: No impact. No `src/` change.
- **Supply-Chain / Distribution Impact**: This is the point of the feature — it **strengthens**
  supply-chain integrity by mechanically asserting the published file set + `exports` map match
  the documented contract (Principle XI). It changes **no** packaging fact itself (`files`,
  `exports`, `main`/`module`/`types` are unchanged); it only adds verification. Attested
  publishing, signed tags, DCO, and pinned dependencies remain intact; the new tooling/contract
  artifacts do not ship.
- **Verification & Enforcement**: The gate is the verification. It runs identically in CI and
  locally through a single documented project command (Principle IX, no environment-dependent
  outcome) and is wired into the merge-required aggregate check so a dishonest distributed surface
  cannot reach the default branch. It also runs in the release pipeline so a release cannot publish
  a drifted surface. The exact mechanism is selected in `/speckit-plan`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST provide an automated gate that computes (a) the **actual published
  file set** — the files `npm pack` would include for the package — and (b) the **declared
  entry-point targets** (every `exports` subpath's `types`/`import`/`require` file, plus
  `main`/`module`/`types`).
- **FR-002**: The gate MUST **fail closed** when any declared entry-point target does **not**
  resolve to a file present in the published file set (a missing or unshipped `exports`/entry
  target).
- **FR-003**: The gate MUST **fail closed** when the published file set contains a file **outside
  the documented distributed surface** — anything beyond the declared `files` plus npm's mandatory
  metadata (`package.json`, `README`, `LICENSE`) — i.e., an undocumented or stray inclusion.
- **FR-004**: The gate MUST **fail closed** when the set of `exports` subpath keys does not equal
  the **documented set of public subpaths** (`.`, `./testing`, `./transport-beacon`,
  `./transport-otlp`, and any future documented subpath): an undocumented subpath added, or a
  documented subpath missing from `exports`.
- **FR-005**: A **documented surface contract** (enumerating the public subpaths and the expected
  published surface, including the resolution-support file categories) MUST exist as the source of
  truth, and the gate MUST enforce the **same** enumeration — encoded in the check and kept in sync
  with the contract — so "docs match what ships" is mechanically verified. (Because the contract is
  prose, the gate carries an encoded copy of the enumeration; an `exports`/subpath change fails the
  gate, forcing the encoded enumeration and the contract to be updated together.)
- **FR-006**: The gate MUST treat legitimate **resolution-support files** within the declared
  surface (source maps, `.d.cts` declarations, shared declaration chunks) as in-surface, not stray,
  per the documented contract — so it does not produce false positives on normal build output.
- **FR-007**: The gate MUST run **identically in CI and locally** via a single documented project
  command, producing the same pass/fail verdict and the same drift list for the same source state,
  with no environment-dependent outcome (Principle IX).
- **FR-008**: The gate MUST be wired into the **merge-required check set** (the `ci-success`
  aggregate) so a pull request that drifts the distributed surface cannot merge, **and** into the
  **release pipeline** so a release cannot publish a drifted surface.
- **FR-009**: On failure, the gate MUST emit an **actionable message** that names each specific
  drift — missing/unshipped target, stray packaged file, or undocumented/missing subpath — and the
  remediation.
- **FR-010**: `CONTRIBUTING.md` MUST **document the gate and point to its enforcement mechanism**
  (command, CI job name, contract identifier) so a contributor can trace the rule from its
  statement to its check (Principle X discoverability). The constitution's existing Principle X
  discoverability clause is satisfied by this reference; a constitution edit is an optional
  patch-level refinement, not required by this feature.
- **FR-011**: Disabling or removing the gate MUST be treated as **relaxing a documented contract**
  — subject to the constitution's amendment/justification process — not as a routine change, and
  this discipline MUST be documented in `CONTRIBUTING.md` alongside the gate.
- **FR-012**: The gate, its documented surface contract, and its outputs MUST be **secure by
  default**: they MUST contain only file paths and packaging metadata and MUST NOT introduce,
  embed, or print secrets, tokens, or consumer data into the repository, CI logs, or artifacts.

### Key Entities *(include if feature involves data)*

- **Published File Set**: The set of files `npm pack` would include for the package — the declared
  `files` (`dist`) plus npm's mandatory metadata. The actual shipped surface the gate inspects.
- **Declared Entry-Point Targets**: Every file path named by the `exports` map (each subpath's
  `types`/`import`/`require`) plus `main`/`module`/`types`. Each must resolve into the Published
  File Set.
- **Surface Contract** *(canonical term; also "documented surface contract" / "source of truth")*:
  The authoritative enumeration of the **public-subpath set** and the expected published surface
  (including in-surface resolution-support categories). This spec uses **"surface contract"** for
  this document and **"public-subpath set"** for the four `exports` keys.
- **Public Subpath**: One `exports` key (`.`, `./testing`, `./transport-beacon`,
  `./transport-otlp`) — must match the documented set one-to-one.
- **Parity Verdict**: The result of comparing the actual surface to the documented contract —
  pass, or fail with the list of drifts (missing target, stray file, undocumented/missing subpath).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to merge or release a distributed surface where an `exports`/entry
  target does not resolve to a shipped file are blocked by the gate (fails closed).
- **SC-002**: 100% of attempts to package a file outside the documented surface (stray/undocumented
  inclusion) are blocked by the gate.
- **SC-003**: For the same source state, the gate yields an **identical** verdict (pass/fail and
  drift list) when run locally and in CI — zero environment-dependent divergence.
- **SC-004**: Every documented public subpath (`.`, `./testing`, `./transport-beacon`,
  `./transport-otlp`) is verified to resolve to a shipped file on every gate run; a subpath added
  to `exports` without matching documentation (or removed from docs) fails the gate.
- **SC-005**: A contributor can locate the gate's enforcement mechanism from the documented rule in
  `CONTRIBUTING.md` in a single hop.
- **SC-006**: In 100% of gate failures, the output names every specific drift and its remediation
  — no opaque or unattributed failures.

## Assumptions

- **Published set = `npm pack` inclusion.** The "actual published file set" is what `npm pack`
  would include — the declared `files` (`dist`) plus npm's always-included `package.json`,
  `README`, and `LICENSE`. The gate derives it from the package's own packaging configuration, not
  a hand-maintained list.
- **"Documented distributed surface" is bounded by `files` + the entry-point targets.** A file is
  *in surface* if it is under the declared `files` (`dist`) or is npm-mandatory metadata; *stray*
  means outside that boundary (e.g., a `src/`, `tests/`, or root config file packaged by accident).
  This avoids false positives on legitimate `dist/` build output (maps, `.d.cts`, shared chunks)
  that no `exports` key names directly.
- **Builds on, does not duplicate, the existing shape check.** `tests/contract/dependency-pins.test.ts`
  already locks the `exports` map *shape* (the four keys and each `types/import/require` triple).
  This feature adds the orthogonal dimensions that audit found missing: every target actually ships
  (pack resolution), no stray file ships, and the subpath set matches the documented public set.
  The plan decides whether to extend that test or add a dedicated check; the spec fixes the outcome.
- **Investigation outcome (issue's first step).** The existing bundle-shape audit does **not** cover
  `exports`↔packaged-files↔docs parity (only shape + vendor-neutrality + size), so a new fail-closed
  check is required; the documenting-only resolution is insufficient.
- **Declared-surface scope, not registry state.** The gate verifies the surface the package *would*
  publish from the current source/build; it does not query the live npm registry (kept network-free
  and reproducible, Principle IX). Provenance/attestation of the actual publish remains covered by
  the existing release pipeline.
- **No `src` / runtime / `exports` / `files` change.** This feature adds the check, a documented
  surface contract, CI/release wiring, and docs only; the shipped package, its `exports`, and its
  `files` are unchanged, and the new artifacts do not ship.
- **Existing CI/release machinery is reused.** The gate plugs into the established `ci-success`
  aggregate and the release pipeline (alongside `bundle-invariance`, `dependency-pins`,
  `changelog-validate`, `api-surface`) rather than introducing a parallel pipeline.
