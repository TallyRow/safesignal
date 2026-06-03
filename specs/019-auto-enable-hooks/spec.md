# Feature Specification: Auto-Enabled Local Quality Hooks + One-Command `verify` Gate

**Feature Branch**: `019-auto-enable-hooks`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Auto-enabled local quality git hooks + one-command verify gate. Activate the
repo's existing local hooks automatically (currently opt-in and never wired, which let a format and a
DCO failure reach CI); add an auto-append sign-off so DCO is kept but frictionless; add an
`npm run verify` one-command gate and a pre-push hook that runs it. No new dependency, no constitution
change, no CI workflow change."

> **Why this exists.** The repo already ships local git hooks (`scripts/hooks/pre-commit` runs Biome
> lint+format on staged files; `scripts/hooks/commit-msg` enforces the DCO sign-off) and documents
> enabling them via `git config core.hooksPath scripts/hooks`. But that wiring is **manual and opt-in**,
> so in practice the hooks were never active — which let a **formatting** miss and a **missing DCO
> sign-off** sail straight to CI and fail the required gate (a wasted force-push round-trip on a recent
> PR). This feature closes the gap by making the existing fail-closed hooks **activate automatically**,
> making sign-off **frictionless** (auto-added, never a manual flag), and adding a **single `verify`
> command + pre-push gate** so test/typecheck/build regressions are caught locally too — moving
> enforcement to the earliest possible point (Principle X — mechanical enforcement). It is
> contributor-facing tooling only: **no published package surface, constitution, or CI workflow
> change.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hooks activate automatically on install (Priority: P1)

A contributor (human or an automated agent acting as one) clones the repo and runs the standard
dependency install. From that moment, the existing local quality hooks are active with **zero manual
setup**: a commit with a lint/format problem in staged files is blocked locally, before it can reach
CI.

**Why this priority**: This is the core fix and the MVP. The hooks and their checks already exist and
already mirror CI; the entire failure was that they were never turned on. Auto-activation alone
prevents the class of "green locally-ish, red on CI" round-trips for formatting/lint. Everything else
builds on this.

**Independent Test**: In a fresh clone, run install; confirm the hook path is now configured and a
commit touching a deliberately mis-formatted staged file is rejected locally with an actionable
message — without anyone having run a manual enable step.

**Acceptance Scenarios**:

1. **Given** a fresh clone with no manual hook setup, **When** the contributor runs the dependency
   install, **Then** the local hook path is configured automatically.
2. **Given** hooks are auto-enabled, **When** a commit includes a mis-formatted staged source file,
   **Then** the commit is blocked locally with a message naming the fix.
3. **Given** hooks are auto-enabled, **When** the contributor re-runs install, **Then** wiring is
   idempotent (no error, no duplication).

---

### User Story 2 - DCO sign-off is kept but frictionless (Priority: P2)

A contributor commits normally, without remembering any sign-off flag. The DCO `Signed-off-by` trailer
is added **automatically** using their configured identity, so the required DCO gate is always
satisfied and never produces a CI surprise — while the existing blocking check remains as a backstop
for commit paths that bypass the auto-add.

**Why this priority**: The DCO requirement stays (it is part of the project's provenance posture), but
for a solo-maintainer repo it should cost nothing. Auto-adding the trailer removes the exact friction
that caused the recent CI failure, without weakening the gate. It depends on US1's auto-activation to
take effect.

**Independent Test**: With hooks auto-enabled, make a commit with **no** manual sign-off flag and
confirm the resulting commit message carries a well-formed `Signed-off-by` trailer; separately confirm
that a commit which still lacks the trailer (auto-add bypassed) is blocked.

**Acceptance Scenarios**:

1. **Given** auto-enabled hooks, **When** a commit is made without a manual sign-off flag, **Then** the
   commit carries a valid `Signed-off-by: Name <email>` trailer.
2. **Given** a trailer is already present, **When** the commit is made, **Then** it is not duplicated.
3. **Given** a commit somehow reaches the message-validation step without a trailer, **When** it is
   evaluated, **Then** it is blocked (backstop preserved).

---

### User Story 3 - One-command local gate + pre-push safety net (Priority: P3)

A contributor runs a single documented command to reproduce the high-frequency CI checks
(build, typecheck, lint, format-check, test, API-surface) locally, and a pre-push check runs that same
gate automatically so build/typecheck/test/API regressions are caught before the CI round-trip —
with a documented emergency bypass.

**Why this priority**: The pre-commit hook only sees staged files for lint/format; it does not catch a
broken build, a type error, or a failing test. A one-command gate plus a pre-push run extends local
prevention to those, but the format/DCO fixes (US1/US2) already address the specific failure that
prompted this work, so this is valuable hardening rather than the core fix.

**Independent Test**: Run the single gate command on a clean tree and confirm it exercises the
high-frequency checks with the same verdict CI would give; introduce a failing check and confirm a push
is blocked locally, and that the documented bypass still allows an intentional push.

**Acceptance Scenarios**:

1. **Given** a clean source tree, **When** the contributor runs the one-command gate, **Then** it runs
   the documented high-frequency checks and reports the same pass/fail verdict CI would for that state.
2. **Given** a failing check, **When** the contributor pushes, **Then** the push is blocked locally
   before reaching CI.
3. **Given** an intentional/emergency push, **When** the contributor uses the documented bypass,
   **Then** the push proceeds.

---

### Edge Cases

- **Not a git repository / git unavailable** (e.g., vendored source, an unusual CI image): auto-wiring
  MUST no-op safely and MUST NOT fail the dependency install.
- **Downstream consumer install**: installing the *published package* MUST NOT trigger the wiring or
  any hook behavior (no consumer-facing effect).
- **Install lifecycle triggered by tooling** (e.g., the packaging/parity gate runs a pack/dry-run that
  fires install lifecycle scripts): the wiring MUST be silent and harmless so it cannot corrupt that
  tooling's output.
- **Continuous-integration install**: when CI installs dependencies the wiring runs but is inert (CI
  never commits/pushes); it MUST NOT change CI behavior.
- **Cross-platform**: hooks and wiring MUST work on both Windows and POSIX shells.
- **Merge / squash / amend commits**: sign-off handling MUST behave predictably (no malformed or
  duplicated trailers).
- **Already-wired clone / pre-existing configuration**: re-running install MUST stay idempotent.

## Consumer Impact & Compatibility *(internal tooling — no package surface change)*

This feature is **contributor-facing developer tooling**. It adds no exported symbol, no runtime code,
no packaged file, and no behavior visible to consumers of the published package.

- **Public API Surface**: No public API change.
- **Compatibility Impact**: None for consumers; backward compatible for contributors (manual hook
  enabling continues to work).
- **Security & Privacy Considerations**: No change to runtime data handling. Auto-adding a sign-off
  trailer records only the committer's already-configured git identity. No secrets involved.
- **Supply-Chain / Distribution Impact**: **No** change to the published surface, the `exports` map, the
  packaged files, the dependency set (no new dependency), attested publishing, or signed tags. The DCO
  provenance posture (Principle XI / the `dco-check` gate) is **retained**, only made frictionless. The
  install lifecycle gains a wiring step that is inert for consumers and harmless to packaging tooling.
- **Verification & Enforcement**: Each new gate (auto-activation, auto-sign-off, pre-push verify) is
  verified by an automated test or is itself the enforcement mechanism; the `verify` command produces
  the same verdict locally and in CI for the same source state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Local git hooks MUST become active **automatically** as part of the standard dependency
  install in a git working copy, requiring **no** manual per-clone enable step.
- **FR-002**: Auto-activation MUST be **idempotent** and MUST **fail safe** — if the working copy is not
  a git repository or git is unavailable, it MUST NOT error or break the dependency install.
- **FR-003**: Auto-activation MUST NOT run for **downstream consumers** installing the published
  package (it affects only development clones of this repository). This holds **inherently** — package
  managers do not run a dependency's `prepare` script for consumers installing the published tarball —
  so it is a documented property of the chosen mechanism, not a separately tested gate.
- **FR-004**: On commit, staged source files MUST be checked for lint and formatting problems and the
  commit MUST be blocked on any problem, with an actionable fix message (reuses the existing
  staged-file check).
- **FR-005**: On commit, a DCO `Signed-off-by` trailer MUST be ensured: when absent, it MUST be
  **added automatically** using the committer's configured identity, so sign-off requires no manual
  flag; when already present it MUST NOT be duplicated.
- **FR-006**: A **blocking** sign-off validation MUST remain as a backstop for commit paths that bypass
  the auto-add step, so no un-signed commit can be created.
- **FR-007**: A **single documented command** MUST run the high-frequency quality checks — build,
  typecheck, lint, format-check, test, and API-surface — in one invocation, producing the **same
  pass/fail verdict locally and in CI** for the same source state (Principle IX).
- **FR-008**: A **pre-push** check MUST run that one-command gate and block the push on failure, with a
  **documented emergency bypass**.
- **FR-009**: The feature MUST add **no new runtime or development dependency**.
- **FR-010**: The feature MUST NOT modify the constitution, the CI workflow definition, or the
  published package surface; the DCO gate and provenance posture MUST be **retained**.
- **FR-011**: Auto-activation and hooks MUST work **cross-platform** (Windows and POSIX) and MUST NOT
  corrupt tooling that triggers install lifecycle scripts (e.g., the packaging/parity gate's
  pack/dry-run).
- **FR-012**: Contributor documentation MUST be updated to state that hooks are **auto-enabled**, to
  document the one-command gate and the pre-push behavior, and to note the emergency bypass.

### Key Entities

- **Hook wiring step**: The install-time action that points the working copy's git hook path at the
  repository's committed hook directory; idempotent and fail-safe.
- **Auto-sign-off hook**: The commit-time step that appends a `Signed-off-by` trailer when missing.
- **`verify` gate**: The single command that runs the high-frequency quality checks; reused by the
  pre-push hook.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a fresh dependency install in a clone, the `pre-commit` hook is **active** (its
  presence + wiring are verified by an automated structural test) and a commit including a
  mis-formatted staged file is blocked locally — **0** such commits reach CI (the live block is
  exercised by the quickstart dogfood and by CI's own format gate).
- **SC-002**: A commit made with **no** manual sign-off flag carries a valid `Signed-off-by` trailer
  **100%** of the time (and the trailer is never duplicated when already present).
- **SC-003**: The one-command gate reproduces the high-frequency CI pass/fail verdict for the same
  source state with **no** environment-dependent divergence.
- **SC-004**: A push with a failing gate is blocked locally before reaching CI; the documented bypass
  still allows an intentional push. (The `pre-push` wiring — present, executable, invokes the `verify`
  gate — is verified by an automated test; the live abort is exercised by the quickstart dogfood.)
- **SC-005**: `npm install`, `npm ci`, and the packaging/parity pack-dry-run all **succeed** with the
  wiring present — including in a non-git context — with no lifecycle breakage.
- **SC-006**: **0** new dependencies appear in the install graph, and there are **0** changes to the
  published package surface, the CI workflow definition, and the constitution.

## Assumptions

- **Contributors run a standard dependency install.** Auto-activation rides the normal install
  lifecycle; a contributor who never installs dependencies is out of scope (they could not build/test
  anyway).
- **Auto-adding the sign-off is acceptable here.** For this solo-maintainer repository the DCO is
  retained but treated as frictionless ceremony — auto-appending the committer's own identity is the
  agreed behavior, not dropping or loosening the gate.
- **The existing committed hooks are correct and reused.** The staged-file lint/format check and the
  DCO blocking check already exist and already mirror CI; this feature wires them on and adds the
  auto-sign-off + pre-push pieces around them rather than rewriting them.
- **The `verify` gate covers the high-frequency checks only.** Gates that require external state —
  base-commit bundle comparison, container-based secret scanning, and full coverage runs — remain
  CI-side and are intentionally excluded from the one-command local gate (documented).
- **Emergency bypass exists by design.** Standard git `--no-verify` (and equivalent) remains available
  for intentional overrides; the gates are guardrails, not locks.

## Dependencies

- **Existing committed hooks** (`scripts/hooks/pre-commit`, `scripts/hooks/commit-msg`) and the
  existing CI quality scripts (build / typecheck / lint / format-check / test / api-check) — reused.
- **Existing CI `dco-check` gate and CONTRIBUTING DCO documentation** — retained; this feature makes
  satisfying them automatic, and updates the contributor docs accordingly.
