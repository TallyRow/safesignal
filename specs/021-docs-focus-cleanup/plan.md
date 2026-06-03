# Implementation Plan: Living-Docs Focus Cleanup (`021-docs-focus-cleanup`)

**Branch**: `021-docs-focus-cleanup` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-docs-focus-cleanup/spec.md`

## Summary

A **documentation-only** reframe of SafeSignal's living docs (issue #19), in two halves: **(A)** remove
the future server/RUM scope creep from `README.md` — delete the `./rum-*` "RUM features" roadmap bullet
and the `safesignal-server` monitoring-backend paragraph, reframe the two dangling "see Roadmap"
pointers, keep the legitimate OTLP/protobuf encoder roadmap item, and add a sharpened present-tense
focus line; **(B)** lead with shipped developer value — sharpen the intro and add a near-top "What you
get" highlights block headlining the six already-shipped features (⭐ `./capture` silent-error capture
first), each linking to its existing section. Add a `CHANGELOG.md` `[Unreleased]` docs note. **No code,
test, CI, `exports`, dependency, or constitution change.** `specs/**` (historical) and
`docs/safe-logging.md` (false-positive matches) are untouched.

## Technical Context

**Language/Version**: Markdown prose only (`README.md`, `CHANGELOG.md`). No TypeScript/runtime change.

**Primary Dependencies**: None. No `package.json`, `src/`, `tests/`, or build/config change.

**Storage**: N/A.

**Testing**: No new tests. Verification is (1) a text search proving removal + presence of the boundary
statement and highlights with resolving anchors, and (2) the existing `npm run verify` +
`changelog-validate` CI confirming nothing regressed (a docs change must not alter any code gate).

**Target Platform**: The npm/GitHub README landing page + the changelog.

**Project Type**: Repository documentation / editorial.

**Performance Goals**: N/A.

**Constraints**: Living docs only; `specs/**` immutable; `docs/safe-logging.md` unchanged; the diff is
limited to `README.md`, `CHANGELOG.md`, and this feature's `specs/021-*` artifacts; no new enforcement
gate; constitution not amended.

**Scale/Scope**: `README.md` (intro sharpen + "What you get" block + Roadmap removals + 2 pointer
reframes + 1 anti-feature tweak), `CHANGELOG.md` (one `[Unreleased]` docs note).

## Constitution Check

> **Constitution version**: in-tree **v1.5.0**. This feature makes **no** constitution change.

- **Spec-Driven Development (I)** — ✅ Spec → this plan → tasks → implement; routed through the full
  lifecycle though docs-only.
- **Stable Consumer API & Deprecation (II)** — ✅ **Central, positive.** No API/type/behavior change.
  Sharpens the documented consumer boundary; removing a *never-shipped future* README promise is not a
  contract deprecation. Nothing real is removed or deprecated.
- **Browser Resilience & Failure Safety (III)** — ✅ N/A (no runtime).
- **Framework-Neutral (IV)** — ✅ N/A (no code); docs still describe framework adapters as opt-in peers.
- **Secure & Privacy-Safe by Default (V)** — ✅ Docs continue to model safe logging; no new example
  dumps objects or disables redaction.
- **Testable, Minimal, Maintainable (VI)** — ✅ **Central.** Sharpening focus and surfacing shipped
  value supports a small, clear, honest surface. No dependency, no new code.
- **Log Integrity (VII)** — ✅ N/A.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ N/A.
- **Reproducible Verification (IX)** — ✅ `npm run verify` + `changelog-validate` run identically local
  and CI; this change touches no code so their verdict is unchanged. No environment-dependent outcome.
- **Mechanical Enforcement (X)** — ✅ The feature documents **no new build-failing gate** (it is
  editorial prose), so none is owed an enforcement mechanism. Existing gates (changelog-validate,
  format/link checks if any) continue to apply unchanged.
- **Supply-Chain Integrity & Provenance (XI)** — ✅ No change to packaged files (`["dist"]`), `exports`,
  dependencies, publish path, or signed/attested release. README/CHANGELOG are repository docs, not
  runtime artifacts. DCO sign-off applies to the commits.

**Result: PASS** (constitution v1.5.0; no amendment). Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/021-docs-focus-cleanup/
├── spec.md, plan.md, research.md, quickstart.md
└── checklists/requirements.md
```

> No `data-model.md` and no `contracts/` — this feature exposes **no API/data surface** (the
> Phase-1 contract step is explicitly skipped for a purely-editorial change).

### Repository files affected

```text
README.md       # Part B: sharpen intro (~L3–9) + add "## What you get" highlights block (~after L9/L11).
                # Part A: Roadmap section (~L697–718) — remove the RUM-features bullet + safesignal-server
                #   paragraph, keep the OTLP/protobuf bullet, add the sharpened focus line; reframe the two
                #   "see Roadmap" pointers (~L17, ~L270–271); lightly sharpen the anti-feature line (~L57–59).
CHANGELOG.md    # Add a "### Docs — …" entry under the existing "## [Unreleased]".

Unchanged (explicitly): specs/** (historical), docs/safe-logging.md, the constitution, CI, src/, tests/,
package.json, exports, dist/.
```

**Structure Decision**: Pure editorial edit of two living-doc files. Keep every shipped per-feature
README section as-is; only add a near-top highlights block that links into them, remove the abandoned
future-product content, and record the change in the changelog.

## Complexity Tracking

> No Constitution Check violations. Complexity Tracking is empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
