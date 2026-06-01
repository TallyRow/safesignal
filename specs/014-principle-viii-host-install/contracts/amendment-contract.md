# Contract: the Principle VIII amendment (G1)

The "interface" this feature changes is **governing text**. This contract specifies the exact clauses
and wording the amendment MUST satisfy, so the implementation is mechanical and the review is a
checklist. Proposed wording is given; the implementer MAY refine phrasing but MUST preserve every
required element and invariant below.

## C1 — Principle VIII gains an explicit host-level-install allowance (FR-001, FR-003, FR-007)

Add a clause to **Principle VIII** (after the "configured **once at the runtime/package level**"
paragraph). It MUST contain every element marked **[req]**:

> **Explicit host-level global install (opt-in).** Distinct from per-`Logger` construction, the
> package MAY provide a **single, explicit, host-installed, runtime-level** integration that attaches
> a global handler (for example, a global uncaught-error / unhandled-rejection capturer) — analogous
> to configuring a transport at the runtime level. Such an install is permitted **only** when it is:
>
> - **[req] opt-in** — never a side effect of `createLogger()` or any per-instance lifecycle, and
>   never installed by default;
> - **[req] host-owned (single owner)** — installed by the host that owns the configured runtime;
>   federated modules MUST NOT install it;
> - **[req] explicitly named** — reached only through a dedicated, documented API/subpath, never
>   ambient or implicit;
> - **[req] fail-safe** — it MUST NOT throw into, or otherwise break, the page (Principle III); and
> - **[req] fail-closed** — captured data routes through the existing secure pipeline so secrets are
>   redacted/sanitized before any transport receives it (Principle V).
>
> **[req]** The per-`Logger` prohibitions in this principle and in § Logger construction constraints
> are **unchanged**: a `Logger` still MUST NOT attach global listeners or patch globals.

## C2 — Construction-constraints scope note (FR-002, FR-004)

Append a scope note to **§ Logger construction constraints** (Package Architecture Standards). It MUST
state both elements:

> **[req]** These prohibitions are scoped to `Logger`-instance creation and per-instance lifecycle.
> **[req]** They do **not** forbid a single, explicit, **host-level** runtime install that attaches a
> global handler through a dedicated documented API (see Principle VIII, "Explicit host-level global
> install") — that is a host-owned, opt-in runtime-configuration step, not a per-`Logger` side effect.

The enumerated banned items (global event listener; patching `console`/`fetch`/`XMLHttpRequest`/
`navigator.sendBeacon`/`window.onerror`/`window.onunhandledrejection`/history; ambient reads; network;
unbounded memory) MUST remain **listed and banned for the per-instance case** — none removed (SC-006).

## C3 — README reframe (FR-005)

Two spots in `README.md` MUST be reframed away from a blanket "no global listeners" claim to the
core-vs-opt-in-host distinction:

- **Feature bullet (≈ line 17)** — currently "…no global listeners, no ambient state reads, no
  per-instance backend init." MUST convey: **[req]** the core and `createLogger()` install no global
  listeners and read no ambient state, **[req]** while noting an opt-in host subpath may install a
  single global handler.
- **"What this package does NOT do" entry (≈ lines 51–53)** — currently "Install global listeners or
  singletons (RUM-style automatic error capture, view tracking, web vitals, network instrumentation
  are forward-looking…)." MUST be reframed so it: **[req]** states the core never installs global
  listeners or reads ambient state; **[req]** carves the **one opt-in exception** — a host may install
  a single global **error** capturer via a dedicated subpath (Roadmap), routed through the secure
  pipeline; **[req]** keeps view tracking / web vitals / network instrumentation **out of scope**
  (SafeSignal is not a RUM product).

## C4 — Amendment process & versioning (FR-006)

- **[req]** Version line bumped **1.4.0 → 1.5.0** (MINOR — see research R1) and **Last Amended** date
  updated.
- **[req]** **Sync Impact Report** (top comment block) updated with: the version change, the modified
  principle (VIII — added host-install allowance + constraints scope note), the **synced-artifact
  list** (constitution.md + README.md edited; plan/spec/tasks templates reviewed-consistent, no edit),
  and the **follow-up** (boundary enforced by #13 / V1) **with a stated deadline** — Principle X
  requires a *named, time-bound* remediation: the enforcing test lands with the `./capture` subpath
  (no release ships `./capture` without it), **target 2026-09-01**.
- **[req]** All edits land in the **same change set / PR** (Governance: amendments self-document and
  keep dependent artifacts in sync).

## C5 — Invariants the amendment MUST NOT break (FR-007, FR-009, SC-005, SC-006)

- **[req]** **No `src`/`exports`/runtime/build/test change** — the code diff outside governance/docs
  files is empty; the installed package is byte-unchanged.
- **[req]** Every **per-`Logger` prohibition is preserved verbatim** — no item removed or weakened for
  the per-instance case.
- **[req]** **No security/privacy/integrity/federation guarantee weakened** — the allowance stays
  opt-in, additive, fail-closed, fail-safe, host-owned; it does not become a default.

## Verification (review checklist → SC mapping)

| Check | Satisfies |
|-------|-----------|
| Principle VIII contains the C1 allowance clause **and** the retained per-`Logger` ban | SC-001 |
| A #13 Constitution Check can cite the allowance with no contradiction | SC-002 |
| README makes no unqualified "no global listeners" claim; states core-vs-opt-in-host | SC-003 |
| Version bumped 1.4.0→1.5.0; Sync Impact Report lists reason + synced artifacts | SC-004 |
| `git diff` shows zero changes outside `constitution.md` + `README.md` | SC-005 |
| Per-`Logger` banned list unchanged for the per-instance case | SC-006 |
