# Feature Specification: Enforce Deprecate-Before-Remove for the Public API

**Feature Branch**: `011-deprecate-before-remove`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #5 — "Enforce deprecate-before-remove for public API (constitution Principle II / X)"

> **Why this exists.** Constitution **v1.4.0** (PR #4) added a deprecation-discipline
> clause to **Principle II — Stable Consumer API**: an incompatible public-contract
> change MUST first ship **deprecated** — replacement available, migration path
> documented, signaled in types/`@deprecated`/changelog — for **at least one minor
> release** before removal. **Principle X — Mechanical Enforcement of Documented
> Contracts** requires every documented gate to have a machine-executable enforcement
> path. This gate currently has none, so it was filed (issue #5) as the named,
> time-bound remediation task Principle X itself mandates. This feature closes that gap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An undeprecated breaking removal cannot merge (Priority: P1)

A maintainer opens a pull request that deletes a public symbol (or changes its
declared signature incompatibly) without it having shipped `@deprecated` in a prior
published release. An automated gate detects the breaking change against the last
published public surface, **fails closed**, and blocks the merge until the change
either ships as a deprecation first or is reverted.

**Why this priority**: This is the entire point of the feature and the MVP. Without
the fail-closed detection, Principle II's deprecation rule remains "advice in a
costume" (Principle X) — silently breakable. Everything else (local reproduction,
documentation) is supporting machinery around this one gate.

**Independent Test**: On a throwaway branch, delete a known-exported symbol that is
present-and-not-deprecated in the latest published surface; run the gate; confirm it
exits non-zero and names the removed symbol. Restore the symbol; confirm the gate
passes. Deliverable value: the deprecation contract is now enforced, not just
written down.

**Acceptance Scenarios**:

1. **Given** a public symbol present and **not** `@deprecated` in the last published
   surface, **When** a change removes it (or changes its declared signature
   incompatibly), **Then** the gate fails closed and the change cannot merge to the
   default branch.
2. **Given** the same symbol but carrying `@deprecated` in the last published surface,
   **When** a change removes it, **Then** the gate passes (the one-minor deprecation
   window was honored).
3. **Given** a change that only **adds** a new public symbol, **When** the gate runs,
   **Then** it passes (additive changes are backward-compatible).

---

### User Story 2 - A contributor reproduces the verdict locally before pushing (Priority: P2)

Before opening a PR, a contributor runs a single documented project script and gets
the **same** pass/fail verdict the CI gate will produce, so they discover an
undeprecated breaking change at their desk rather than from a red pipeline.

**Why this priority**: Principle IX (Reproducible Verification) requires identical
local and CI outcomes for the same source state. A gate that can only be evaluated
in CI wastes round-trips and erodes trust in the check. Valuable, but only once the
P1 gate exists.

**Independent Test**: Run the documented script locally against a branch with an
undeprecated removal and against a clean branch; confirm the verdict matches what CI
reports for the identical commits.

**Acceptance Scenarios**:

1. **Given** a source state, **When** the gate is run locally and in CI, **Then** both
   produce the identical pass/fail verdict and the same offending-symbol list.
2. **Given** a fresh clone with dependencies installed, **When** the contributor runs
   the single documented script, **Then** no extra environment-specific setup is
   required to reproduce the CI result.

---

### User Story 3 - The rule is traceable to its check and failures are actionable (Priority: P3)

A contributor who reads the deprecation rule in `CONTRIBUTING.md` / the constitution
can follow a reference straight to the enforcing mechanism (script / CI job / contract
ID). When the gate fails, the message names the offending symbol(s) and states exactly
how to proceed (ship `@deprecated` with a replacement and migration note for one minor
release, or revert).

**Why this priority**: Principle X requires enforcement paths be discoverable and
Principle II requires the deprecation be signaled where consumers and contributors
encounter it. This turns a cryptic failure into a self-service fix, but the gate
delivers its core protection without it.

**Independent Test**: From the documented rule, confirm a reference resolves to the
enforcement mechanism; trigger a failure and confirm the message identifies the
symbol and the remediation steps.

**Acceptance Scenarios**:

1. **Given** the deprecation rule as documented, **When** a contributor looks for its
   enforcement, **Then** the documentation references the concrete mechanism
   (script/CI job/contract identifier).
2. **Given** a gate failure, **When** the contributor reads the output, **Then** it
   names each offending symbol and the remediation (deprecate-first or revert).

---

### Edge Cases

- **No prior baseline (first checked release)**: with no recorded published surface to
  compare against, the gate has nothing to break and passes, establishing the initial
  baseline rather than failing.
- **Add-then-remove within one unreleased cycle**: a symbol introduced and removed
  before it was ever published was never part of a published contract — the gate must
  not flag it (it compares against the *published* surface, not intermediate commits).
- **Deprecate and remove in the same release**: deprecating a symbol and deleting it in
  the same change does **not** satisfy the one-minor window — the gate fails.
- **Major version bump**: a major bump does not exempt a removal; the deprecation
  window ("deprecated in a prior published minor") still applies, since Principle II
  treats removing a deprecated contract as itself a breaking change.
- **Whole entry point removed**: deleting an `exports` subpath removes all of its public
  symbols — the gate treats each as a removal subject to the same rule.
- **Backward-compatible widening** (e.g., an added optional parameter, a widened return
  type): a compatible change must not trip the gate; only incompatible changes do.
- **Gate self-removal**: disabling or deleting the gate is treated as relaxing a
  documented contract (constitution amendment discipline), not a routine edit.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature adds enforcement
  tooling, a recorded public-surface baseline, CI wiring, and documentation. It does
  not add, remove, or alter any exported symbol of `@tallyrow/safesignal`.
- **Compatibility Impact**: Backward compatible / additive (project tooling only). It
  *protects* the existing consumer contract rather than changing it.
- **Migration Notes**: None for consumers. For maintainers/contributors: removing or
  incompatibly changing a public symbol now requires a prior-release `@deprecated`
  step; the new gate documents this at point of failure.
- **Deprecation & Migration**: No package contract is deprecated or removed by this
  feature. (The feature *is* the machinery that governs future deprecations.)
- **Host/Module Usage Impact**: None. No runtime, `Logger`, transport, or `exports`
  behavior changes; host apps and federated modules are unaffected.
- **Security & Privacy Considerations**: No runtime behavior change, so no change to
  what data is captured, serialized, or transmitted. The recorded public-surface
  baseline contains only public type/symbol information (no secrets, no consumer data);
  no secret material is introduced into the repo, CI logs, or artifacts.
- **Log Integrity Considerations**: No impact. No event production, sampling, batching,
  ordering, or transformation behavior is touched.
- **Runtime Scale & Federated Deployment Impact**: No impact. No per-`Logger` cost,
  shared-resource, or duplicate-package-copy behavior changes; the feature touches only
  build/CI/docs, never `src/`.
- **Supply-Chain / Distribution Impact**: Adds a release-time step that records the
  published public surface as the next comparison baseline. The distributed surface
  (entry points, `exports` map, packaged `files`) is unchanged. Attested publishing,
  signed tags, DCO attribution, and pinned/screened dependencies remain intact; the
  new baseline artifact ships through the same reviewed, gated path as other repo
  files.
- **Verification & Enforcement**: The gate is the verification. It runs identically in
  CI and locally through a single documented project script (Principle IX, no
  environment-dependent outcome) and is wired into the merge-required aggregate check
  so an undeprecated breaking change cannot reach the default branch. The exact
  mechanism (CI job name / script path / contract ID) is selected in `/speckit-plan`
  and recorded so the documented rule references its check (Principle X).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST provide an automated gate that detects, for the current
  source state, whether any public API symbol has been **removed** or **changed
  incompatibly** relative to the recorded public surface of the most recent published
  release.
- **FR-002**: The gate MUST **fail closed** (block the change) when a removal or
  incompatible change is **not** accompanied by a `@deprecated` signal that was present
  on that symbol in the baseline published surface — i.e., the one-minor deprecation
  window was not honored.
- **FR-003**: The gate MUST **pass** a removal or incompatible change when the affected
  symbol carried a `@deprecated` annotation in the baseline published surface (the
  prior release line), satisfying the "deprecated for at least one minor release before
  removal" requirement of Principle II.
- **FR-004**: The monitored public surface MUST cover **every entry point declared in
  the package `exports` map** (`.`, `./testing`, `./transport-beacon`,
  `./transport-otlp`, and any future subpath) and the exported value and type symbols
  reachable from each entry point's type declarations.
- **FR-005**: A change that **only adds** new public symbols MUST NOT cause the gate to
  fail (pure additions are backward-compatible and need no deprecation step and no
  acknowledgment). A backward-compatible **signature change** to an existing symbol MUST
  NOT be forced through the deprecate-before-remove path either; but because v1 does not
  yet auto-prove compatibility (see Assumptions and the deferred follow-up), such a change
  MUST be cleared by a one-time **reviewed acknowledgment** rather than passing silently.
  The gate MUST NOT demand a deprecation cycle for a change a reviewer has attested is
  compatible.
- **FR-006**: The comparison baseline MUST be an authoritative record of the **most
  recent published release's** public surface (including each symbol's deprecation
  status), so that "was it deprecated in a prior published minor?" is mechanically
  decidable.
- **FR-007**: The release flow MUST record/update the published public surface as the
  baseline for future comparisons, so that **every published version** leaves behind an
  authoritative surface record and no release ships without one.
- **FR-008**: The gate MUST run **identically in CI and locally** via a single
  documented project script, producing the same pass/fail verdict and the same
  offending-symbol list for the same source state, with no environment-dependent
  outcome (Principle IX).
- **FR-009**: The gate MUST be wired into the **merge-required check set** (the
  aggregate that gates the default branch) so that a pull request containing an
  undeprecated breaking removal/change cannot merge.
- **FR-010**: On failure, the gate MUST emit an **actionable message** that names each
  offending symbol and states the remediation: ship the symbol `@deprecated` with a
  working replacement and a documented migration path for at least one minor release,
  or revert the breaking change.
- **FR-011**: `CONTRIBUTING.md` MUST **document the gate and point to its enforcement
  mechanism** (entrypoint, CI job name, and contract identifier) so a contributor can
  trace the rule from its statement to its check (Principle X discoverability). The
  constitution's existing Principle X discoverability clause is satisfied by this
  reference; updating the constitution to name the mechanism is an optional patch-level,
  non-semantic refinement (not an amendment) and is not required by this feature.
- **FR-012**: Disabling or removing the gate MUST be treated as **relaxing a documented
  contract** — subject to the constitution's amendment/justification process — not as a
  routine change. The gate's existence and required status MUST themselves be
  documented as an enforced invariant in `CONTRIBUTING.md` alongside the gate.
- **FR-013**: The gate, its baseline artifact, and its outputs MUST be **secure by
  default**: they MUST contain only public API/type information and MUST NOT introduce,
  embed, or print secrets, tokens, or consumer data into the repository, CI logs, or
  artifacts.

### Key Entities *(include if feature involves data)*

- **Public API Surface**: The set of value and type symbols exported from the package's
  `exports` entry points at a given version, with each symbol's name, kind, declared
  signature/shape, and deprecation status. The unit the gate compares.
- **Surface Baseline** *(canonical term; also seen as "published snapshot" / "frozen baseline")*:
  The authoritative recorded Public API Surface of the most recent published release; the
  reference the current surface is diffed against. This spec uses **"baseline"** for this frozen
  record and **"surface"** for any freshly extracted set.
- **Public Symbol**: A single exported value or type reachable from an `exports`
  subpath. Attributes: name, kind, signature/shape, `deprecated?` flag.
- **Deprecation Signal**: A `@deprecated` annotation on a symbol that is visible in the
  published types/tooling and recorded in the baseline; the marker that authorizes a
  later removal.
- **Gate Verdict**: The result of comparing the current surface to the baseline —
  pass, or fail with the list of undeprecated removed/incompatibly-changed symbols.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts to merge an undeprecated public-symbol removal or
  incompatible change to the default branch are blocked by the gate (it fails closed,
  zero false negatives in the acceptance test set).
- **SC-002**: A removal or change of a symbol that was `@deprecated` in the prior
  published surface passes the gate with **no manual override**.
- **SC-003**: For the same source state, the gate yields an **identical** verdict
  (pass/fail and offending-symbol list) when run locally and in CI — zero
  environment-dependent divergence across the acceptance runs.
- **SC-004**: Every published release leaves an updated, authoritative public-surface
  baseline usable for the next comparison (no release ships without one).
- **SC-005**: A contributor can locate the gate's enforcement mechanism starting from
  the documented rule in `CONTRIBUTING.md` / the constitution in a single hop (a direct
  reference to the script/CI job/contract ID is present).
- **SC-006**: In 100% of gate failures, the output names every offending symbol and the
  required remediation — no opaque or unattributed failures.

## Assumptions

- **Baseline = last published release surface.** "Deprecated for at least one minor
  release before removal" is evaluated against the most recently published release's
  recorded surface; if a removed/changed symbol carried `@deprecated` there, the window
  is satisfied. (Chosen because the published surface is the contract consumers actually
  depend on, and it makes the rule decidable without reconstructing full version
  history.)
- **"Public symbol" = exported declarations reachable from the `exports` map.** Internal
  modules, non-exported helpers, and `devDependencies`-only types are out of scope; only
  what a consumer can import via a documented entry point counts.
- **Deprecation signal = `@deprecated`.** Consistent with Principle II's requirement to
  signal in types/`@deprecated`/changelog; the gate keys on the `@deprecated` annotation
  because it is the machine-readable signal that surfaces in consumer tooling.
- **Declared-surface scope, not runtime behavior.** The gate governs the *declared* API
  surface (symbols and their type signatures). Purely behavioral breaking changes that
  leave the declared surface identical remain governed by code review and the existing
  test suites, not by this mechanical gate (and are documented as such).
- **Conservative incompatibility default.** When the gate cannot prove a signature change
  is backward-compatible, it withholds an automatic pass (fail-closed bias), favoring a false
  alarm that a maintainer clears with a one-time **reviewed acknowledgment** (an
  `api/surface-allow.json` entry) over a silently shipped break. A genuinely compatible change is
  cleared by that acknowledgment, **not** forced through a deprecation cycle (see FR-005); the
  deferred follow-up replaces the manual acknowledgment with automated compatibility
  classification.
- **Approach selected in planning.** The two candidate mechanisms in issue #5
  (API-snapshot diff in CI vs. a release-checklist gate) are an implementation choice for
  `/speckit-plan`; this spec fixes the required *outcome* (fail-closed detection of
  undeprecated breaking changes), not the mechanism.
- **No `src/` / runtime / `exports` change.** This feature adds tooling, a baseline
  artifact, CI wiring, and docs only; the shipped package code and entry points are
  untouched, and the host-neutral `scripts/ci/*.sh` convention is reused.
- **Existing release & CI machinery is reused.** The gate plugs into the established
  `ci-success` aggregate and the manual-CHANGELOG-first release flow (alongside
  `changelog-validate`, `bundle-invariance-check`, `provenance-verify`) rather than
  introducing a parallel pipeline.
