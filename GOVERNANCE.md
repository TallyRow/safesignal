# Governance

This document describes **how decisions about SafeSignal get made**.
It complements the [constitution](.specify/memory/constitution.md),
which describes **what SafeSignal's code must do**. The constitution
is the binding technical standard; this document is the
human-decision-making process for amending and applying it.

## Current state

SafeSignal is currently maintained by a **single maintainer**:

- **John Goure** (GitLab handle: `johng`), under the
  [TallyRow](https://gitlab.com/tallyrow) namespace.

The single-maintainer state is a **transitional default**, not a
design goal. As regular contributors join, the governance below is
expected to evolve toward shared decision-making (see § Evolution
path).

## Constitution authority

The constitution at
[`.specify/memory/constitution.md`](.specify/memory/constitution.md)
is the **binding technical standard** for package decisions. Its
seven principles are non-negotiable in their current form:

1. Stable Consumer API & Clear Boundaries
2. Browser-First Runtime Resilience
3. Framework-Neutral Structured Observability
4. Secure & Privacy-Safe Logging by Default *(non-negotiable per
   the constitution itself)*
5. Testable, Minimal, Maintainable Package Design
6. Log Integrity & Monitoring Suitability
7. Lightweight Logger Instances & Federated Runtime Discipline

Work that violates a principle requires either:

- a documented, named, time-bound exception with a remediation
  plan; or
- an explicit constitution amendment (see § Decision authority —
  constitution amendments).

This GOVERNANCE document does NOT itself override the constitution.
If a conflict arises between this document and the constitution,
the constitution wins.

## Decision authority

### MR approval

- **Currently**: the maintainer reviews and approves all merge
  requests against `master` (the current default branch — a
  rename to `main` is planned in a subsequent feature). No MR is
  merged without their explicit approval.
- **Required checks**: every MR must pass the project's CI checks
  (see Feature 006 when shipped), satisfy the Spec Kit workflow if
  applicable, and follow the contributor expectations in
  [CONTRIBUTING.md](CONTRIBUTING.md) (including DCO sign-off on
  every commit).
- **Future state**: once 2+ regular contributors are active, a
  CODEOWNERS file will gate review for sensitive paths
  (`src/pipeline/**` for redaction/sanitizer/URL-scrubber,
  `src/transport-beacon/**` for the transport security contract,
  `.specify/memory/constitution.md` for governance changes).

### Constitution amendments

- **Process**: an amendment proposal is authored as a Spec Kit
  feature (`/speckit-specify` → `/speckit-clarify` →
  `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` →
  `/speckit-implement`). The feature spec MUST identify which
  principle(s) are being amended, why, and what the new wording
  looks like.
- **Versioning**: the constitution uses its own semantic-versioning
  policy (documented in the constitution's Governance section):
  - **MAJOR** for removing or redefining a governing principle in
    a materially incompatible way
  - **MINOR** for adding a new principle or materially expanding
    governance requirements
  - **PATCH** for wording clarifications, typo fixes, or
    non-semantic refinements
- **Currently**: the maintainer ratifies amendments after the
  Spec Kit workflow lands; constitution version + Last Amended
  date bump accordingly. Synced templates in
  `.specify/templates/` update in the same change set.
- **Future state**: with 2+ regular contributors, amendments
  require majority approval among active maintainers; with a
  formal steering group, the steering group's documented quorum
  rules apply.

### npm publish authority

- **Currently**: the maintainer holds publish rights on the
  `@tallyrow/` npm scope.
- **Account protections**: 2FA is enforced on the npm account.
  Long-lived publish tokens are NOT stored anywhere.
- **CI-mediated publish**: planned via Feature 006 (CI/CD
  pipeline). The intended setup is GitLab CI/CD using npm's OIDC
  trusted-publisher mechanism — no long-lived token in CI
  variables; publishes are tied verifiably to a specific GitLab
  CI workflow run via npm provenance.
- **Manual publish fallback**: if the OIDC pipeline is unavailable,
  the maintainer may publish manually from a development machine
  after running `npm test && npm run build` and verifying the
  package contents (`npm pack --dry-run`).

### Security triage

- **Inbound channel**: `security@tallyrow.com` (vulnerability
  reports) and `conduct@tallyrow.com` (Code-of-Conduct reports).
  Both route to the maintainer-owned inbox.
- **Triage**: the maintainer triages every report. For security
  issues, the response-time and disclosure policies in
  [SECURITY.md](SECURITY.md) are binding (72h acknowledgement, 7d
  initial assessment, 90d default embargo).
- **Future state**: a "security@" team-level alias may be
  established once 2+ regular contributors exist; the SECURITY.md
  policy will be updated to reflect any new triage structure.

### Release decisions (cutting a new version)

- **Currently**: the maintainer decides when to cut a release
  based on (a) accumulated user-facing changes, (b) security
  patches landing, (c) any consumer-impacting bugs.
- **Convention**: SemVer. Major for breaking consumer API changes
  (including import-string renames); minor for additive features;
  patch for bug fixes and security patches.
- **Release notes**: documented in [`CHANGELOG.md`](CHANGELOG.md)
  before publish.

## Evolution path

Governance scales with contributor count. The following thresholds
are **suggestions**, not rules — adjusted as the project evolves.

- **1 contributor (current)**: single maintainer holds all
  authority. Decisions documented here and in commit history.
- **2+ regular contributors**: adopt CODEOWNERS for review
  enforcement on sensitive paths. Constitution amendments require
  majority approval among active maintainers.
- **5+ regular contributors**: formalize a steering group with a
  documented member list, quorum rules, conflict-resolution
  process, and a chair-rotation schedule. The steering group
  ratifies constitution amendments and major release decisions.
- **Anything beyond**: organizational governance (foundation,
  working groups, etc.) — out of scope for this document until it
  matters.

"Regular contributor" here means someone with multiple merged MRs
over a sustained period (e.g., 5+ MRs across 3+ months) — not a
formal designation, just a useful heuristic.

## Conflict resolution

In the current single-maintainer state, conflicts are resolved by
the maintainer's judgment, anchored to the constitution. Reporters
who disagree with a decision can:

1. Open a discussion issue with the **Feature** template, citing
   the relevant constitutional principle.
2. Propose a constitution amendment via Spec Kit if they believe
   the principle itself needs to change.
3. Fork the project (the MIT license permits this — see
   [LICENSE](LICENSE)).

When governance evolves to multiple contributors, formal
conflict-resolution rules will be added here (vote weighting,
appeal process, etc.).

## Cross-references

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow,
  Spec Kit phases, DCO sign-off requirement
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure policy
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant
  2.1
- [`LICENSE`](LICENSE) — MIT License
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md)
  — binding technical standard (v1.2.0)
- [`CHANGELOG.md`](CHANGELOG.md) — version-by-version release notes
