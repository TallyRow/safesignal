# Feature Specification: Clarify Principle VIII — Explicit Host-Level Global Install Is Allowed

**Feature Branch**: `014-principle-viii-host-install`

**Created**: 2026-06-01

**Status**: Draft

**Input**: GitHub issue #12 — "docs/governance: clarify Principle VIII — explicit host-level global install is allowed" (roadmap code **G1**, the governance prerequisite for **V1** global error capture, #13)

> **Why this exists.** The roadmap's headline V1 feature (#13, opt-in `./capture` global error
> capture) needs to install **one** explicit, host-level global handler
> (`addEventListener('error')` / `addEventListener('unhandledrejection')`). But the constitution's
> **Principle VIII** and its "Logger construction constraints" currently list `window.onerror` /
> `window.onunhandledrejection` / global listeners among forbidden side effects — written to ban
> them **at `Logger` creation**, yet phrased blankly enough that an *explicit host-level install*
> looks prohibited too. The README compounds this by stating the package "does **not** install
> global listeners" without qualification. This governance feature (roadmap **G1**) removes that
> ambiguity: it amends Principle VIII to distinguish the **banned per-`Logger` global side effect**
> from a **permitted single, explicit, host-installed, runtime-level global handler** (opt-in, one
> owner), and reframes the README to match — so V1 (#13) rests on a clear constitutional footing.
> No package code, API, or runtime behavior changes; this is a governance + documentation change.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Governance unblocks the V1 global-capture feature (Priority: P1)

A maintainer scoping the global error-capture feature (#13) runs its Constitution Check against
Principle VIII. After this amendment, the principle **explicitly permits** a single, explicit,
host-installed, runtime-level global handler (opt-in, analogous to configuring a transport) while
**still banning** per-`Logger` global side effects — so the check passes cleanly instead of
hand-waving an apparent contradiction.

**Why this priority**: This is the entire purpose of the feature and the MVP. Without it, #13 (the
marquee V1 value) is built on a principle that appears to forbid the very thing it must do. The
README and process work hardens and publishes this clarification, but the governing-text change is
what unblocks the roadmap.

**Independent Test**: Read Principle VIII (and the Logger construction constraints) after the
amendment; confirm a reader can point to (a) the retained ban on per-`Logger`/per-instance global
side effects, and (b) an explicit clause permitting a single host-level runtime install. Trace the
#13 Constitution Check and confirm it can cite (b) without contradiction.

**Acceptance Scenarios**:

1. **Given** the amended Principle VIII, **When** a contributor looks for whether a host may install
   one global error handler, **Then** the text explicitly says yes — opt-in, host-owned, one owner.
2. **Given** the amended principle and the Logger construction constraints, **When** a contributor
   looks for whether `createLogger` may attach global listeners, **Then** the text still explicitly
   says no (the per-`Logger`/per-instance prohibition is unchanged).
3. **Given** the amendment, **When** the #13 Constitution Check is written, **Then** it cites the
   host-install allowance without an unresolved Principle VIII conflict.

---

### User Story 2 - Public docs state the honest stance (Priority: P2)

A consumer reading the README's "What this package does NOT do" understands the package's actual
position: the **core never touches globals** (no global listeners at logger creation, no ambient
reads), but an **opt-in subpath may**, with **explicit host ownership** (exactly one owner; modules
never install). The blanket "does not install global listeners" claim — which contradicts the
published roadmap — is replaced by this precise distinction.

**Why this priority**: The README is the front door; leaving it asserting something the roadmap
openly contradicts erodes trust and confuses consumers about whether global capture is supported.
Important, but it follows the governing-text change (the README mirrors the principle).

**Independent Test**: Read the README "What this package does NOT do" section and the related
feature bullet after the change; confirm they state the core-vs-opt-in-host distinction and no
longer make an unqualified "no global listeners" claim.

**Acceptance Scenarios**:

1. **Given** the updated README, **When** a consumer reads the "does NOT do" list, **Then** it
   distinguishes "the core never touches globals" from "an opt-in subpath may, with explicit host
   ownership," rather than blanket-denying global listeners.
2. **Given** the updated README, **When** a consumer cross-references the roadmap, **Then** there is
   no contradiction between the stated stance and the planned opt-in capture subpath.

---

### User Story 3 - The amendment is itself compliant and traceable (Priority: P3)

The change follows the constitution's own governance process: a documented reason, a semantic
version bump per policy, and every affected template/guidance artifact synced in the **same change
set**, with the Sync Impact Report at the top of the constitution updated to record the change.

**Why this priority**: The constitution mandates that amendments be self-documenting and keep
dependent artifacts in sync (Principle I / Governance). A clarification that itself skipped the
amendment process would undermine the document it edits. Necessary for correctness, but it is the
discipline around the change rather than the change's substance.

**Independent Test**: After the change, confirm the constitution version was bumped per its
versioning policy, the Sync Impact Report records the reason and lists synced artifacts, and no
referenced template/doc still contradicts the amended principle.

**Acceptance Scenarios**:

1. **Given** the amended constitution, **When** a reviewer checks the version line and Sync Impact
   Report, **Then** the version is bumped per policy and the report states the reason and the synced
   artifacts.
2. **Given** the change set, **When** a reviewer scans the dependent templates/docs (plan/spec
   templates, README), **Then** none still asserts the pre-amendment blanket prohibition.

---

### Edge Cases

- **Apparent weakening of a guardrail**: the amendment must not read as "globals are now generally
  allowed." It permits exactly one explicit, host-owned, opt-in runtime-level install — every other
  global side effect (and all per-`Logger` ones) stays banned. The wording must make the narrowness
  unmistakable.
- **Enforcement gap**: permitting the host install introduces a boundary ("only an explicit
  host-level install may attach global handlers"). The amendment must not leave that boundary
  unenforced — it names the dependent feature (#13/V1) as where the boundary is mechanically tested
  (Principle X), rather than silently relaxing enforcement now.
- **Version-level ambiguity**: the change permits a new behavior class, so it is a governance
  expansion (MINOR), not a mere wording fix (PATCH); the exact level is set per the constitution's
  versioning policy when the amendment lands.
- **Template drift**: the plan/spec/tasks templates echo Principle VIII guardrails; any that
  restate the blanket prohibition must be reconciled in the same change set so they don't contradict
  the amended principle.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No public API change.** This feature edits governance text
  (`constitution.md`) and documentation (`README.md`, affected templates). No exported symbol,
  `exports` subpath, type, config, or runtime behavior is added, removed, or altered.
- **Compatibility Impact**: Backward compatible / governance-and-docs only. No consumer code is
  affected; nothing in the installed package changes.
- **Migration Notes**: None. The amendment *enables* a future opt-in capability (#13) but ships no
  behavior itself.
- **Deprecation & Migration**: No contract is deprecated or removed. A previously-blanket
  prohibition is **clarified and narrowed in wording**, not a runtime contract change.
- **Host/Module Usage Impact**: Clarifies the federation ownership model in governing text: the host
  owns the single permitted global install; federated modules never install it; per-`Logger`
  behavior is unchanged. No code enforces anything new in this feature (the enforcement lands with
  #13).
- **Security & Privacy Considerations**: The amendment MUST NOT weaken any security/privacy/
  integrity/federation guarantee. The permitted host install is explicitly **opt-in and additive**,
  and remains bound (in the governing text) to fail-closed redaction and fail-safe (never break the
  page) — it does not become a default and does not relax the secure-by-default posture.
- **Log Integrity Considerations**: No impact. No event production, shape, or transport behavior is
  touched.
- **Runtime Scale & Federated Deployment Impact**: No runtime impact. The per-`Logger`
  lightweight/side-effect-free contract is preserved verbatim; the amendment only adds an explicit
  carve-out for a single host-level runtime install distinct from per-instance creation.
- **Supply-Chain / Distribution Impact**: None. No change to the published package, `exports`,
  `files`, dependencies, or build; only repo governance/docs files change, which do not ship.
- **Verification & Enforcement**: This feature adds **no new machine-checkable code invariant** — it
  is a governing-text clarification. It explicitly names the dependent feature (#13/V1) as the place
  where the new boundary ("only an explicit host-level install attaches global handlers; per-`Logger`/
  module code may not") becomes a mechanically-enforced test, so Principle X is satisfied by a
  **named, time-bound** follow-on (deadline **2026-09-01**; the test lands with the `./capture`
  subpath — see FR-008) rather than an unenforced gate. The existing per-`Logger` prohibitions remain
  whatever they are today (unchanged).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: **Principle VIII** MUST be amended to explicitly distinguish two cases: (a) per-`Logger`
  global side effects at creation or per-instance lifecycle — **banned (unchanged)**; and (b) a
  **single, explicit, host-installed, runtime-level** global handler — **allowed, opt-in**,
  analogous to configuring a transport.
- **FR-002**: The amendment MUST preserve every existing per-`Logger` construction constraint
  unchanged (no global listeners, no `console`/`fetch`/`window.onerror`/`window.onunhandledrejection`
  patching, no ambient-state reads, no network/I/O, at `Logger` creation or per-instance lifecycle).
- **FR-003**: The amendment MUST state **single-owner** semantics: the host owns the one permitted
  global install; federated modules MUST NOT install it; the install is opt-in, not a default.
- **FR-004**: The **"Logger construction constraints"** enumeration (Package Architecture Standards)
  MUST be reconciled so its global-listener / `window.onerror` / `window.onunhandledrejection`
  prohibitions are explicitly scoped to **per-`Logger` creation / per-instance lifecycle**, and do
  not read as forbidding an explicit host-level runtime install.
- **FR-005**: The **README** MUST be updated so its "What this package does NOT do" entry and the
  related "no global listeners" feature bullet state the precise stance — *the core never touches
  globals; an opt-in subpath may, with explicit host ownership (exactly one owner; modules never
  install)* — replacing the unqualified "does not install global listeners" claim that contradicts
  the roadmap.
- **FR-006**: The amendment MUST follow the constitution's own **governance/amendment process**: a
  documented reason for the change, a semantic version bump per the constitution's versioning policy,
  and all affected templates/guidance artifacts synced in the **same change set**, with the **Sync
  Impact Report** updated to record the change and the synced artifacts.
- **FR-007**: The amendment MUST NOT weaken any security, privacy, integrity, scalability, or
  federation guarantee: the permitted host install MUST remain, in the governing text, opt-in,
  additive, fail-closed (redaction) and fail-safe (never break the page), and host-owned — not a
  default and not a general relaxation of the no-globals posture.
- **FR-008**: The amendment MUST keep the new allowance **enforceable, not merely permitted**: it
  MUST name where the boundary ("only an explicit host-level install attaches global handlers;
  per-`Logger`/module code may not") is mechanically enforced — the dependent global-capture feature
  (#13 / V1) — **with a stated deadline** (Principle X requires a *named, time-bound* remediation with
  an explicit deadline): the enforcing test MUST land in the same change set that adds the `./capture`
  subpath — i.e., **no release may ship `./capture` without it** — target **2026-09-01**. So no
  documented gate is left unenforced.
- **FR-009**: This feature MUST make **no `src`/`exports`/runtime/build change** — it is a governance
  and documentation change only; the installed package is byte-unchanged.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the change, Principle VIII contains **both** an explicit clause permitting a
  single host-level runtime-level global install **and** the retained per-`Logger` prohibition — a
  reader can cite each in one pass.
- **SC-002**: A Constitution Check for the global-capture feature (#13) can cite Principle VIII's
  host-install allowance with **zero** unresolved contradiction (the apparent conflict is gone).
- **SC-003**: The README makes **no** unqualified "does not install global listeners" claim; it
  states the core-vs-opt-in-host distinction, and there is no contradiction with the roadmap.
- **SC-004**: The constitution's version line is bumped per its versioning policy and the Sync Impact
  Report records the reason and lists every synced artifact (100% of touched templates/docs
  enumerated).
- **SC-005**: **Zero** `src`/`exports`/runtime/build changes ship with this feature (verifiable by an
  empty code diff outside governance/docs files).
- **SC-006**: The per-`Logger` global-side-effect prohibitions are **unchanged** — a reviewer
  confirms no item in the banned per-instance list was removed or weakened.

## Assumptions

- **Governance + docs only.** This feature edits `constitution.md`, `README.md`, and any
  Principle-VIII-echoing templates; it ships no package code, tests, or build change. The dependent
  *feature* work (the actual global install + its enforcement tests) is #13 (V1), specified
  separately.
- **Version level = MINOR → 1.4.0 → 1.5.0.** Permitting a new behavior class materially expands
  governance, so the constitution bump is **MINOR** (not a PATCH wording fix), per the constitution's
  stated versioning policy (*"MINOR for … materially expanding governance requirements"*) — resolved
  in planning (research R1). It is not MAJOR (no principle removed or redefined incompatibly).
- **Enforcement is time-bound, not skipped.** The boundary the amendment introduces ("only an
  explicit host-level install touches globals") is mechanically enforced by #13's tests; #12
  documents the rule and names #13 as its enforcement with a stated deadline (**2026-09-01**; the
  test lands with the `./capture` subpath), consistent with Principle X's "named, time-bound
  remediation" allowance rather than leaving an unenforced gate.
- **No new prohibition is relaxed beyond the single host-install carve-out.** Every other global
  side effect — and all per-`Logger` ones — remain banned; the amendment's wording makes the
  narrowness explicit.

## Dependencies

- **This feature is the roadmap's G1 governance prerequisite** for **V1** global error capture
  (#13). #13's spec carries an open dependency marker on G1 that this feature resolves; the roadmap
  (#28) sequences **G1 (#12) before V1 (#13)**.
- **Related but independent**: #19 (roadmap **C1**, RUM scope-creep docs cleanup) touches adjacent
  README wording about forward-looking RUM features; it is a separate change and not a hard
  dependency of #12, though the two should remain consistent.
- **No upstream code dependency** — this is a foundational governance change with no prerequisite
  feature.
