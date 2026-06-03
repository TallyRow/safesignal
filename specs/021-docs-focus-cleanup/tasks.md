# Tasks: Living-Docs Focus Cleanup (`021-docs-focus-cleanup`)

**Feature**: issue #19 · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) ·
**Quickstart/verify**: [quickstart.md](./quickstart.md)

Documentation-only. **No tests, no code** (spec FR-010; the change is editorial prose). All README edits
touch the **single file `README.md`**, so they are **sequential** (no `[P]` among them); `CHANGELOG.md`
is a separate file. Story labels: `[US1]` lead-with-value (P1), `[US2]` remove-scope-creep (P1, co-equal).

---

## Phase 1: Setup

- [ ] T001 Baseline the current state: `rg -n "safesignal-server|\./rum-|see Roadmap" README.md` and note the exact line ranges of the RUM-features roadmap bullet, the `safesignal-server` paragraph, the two "see Roadmap" pointers, and the anti-feature line — so the edits target the right spots.

## Phase 2: Foundational

_None — no shared prerequisite; the two stories both edit `README.md` and are sequenced by file, not by a blocking dependency._

---

## Phase 3: User Story 1 — Lead with shipped developer value (P1) 🎯

**Goal**: The README's first screenful headlines the six shipped developer-facing features (⭐
`./capture` first), each linking to its existing section; the quality-attributes list stays as the
follow-on.

**Independent test**: Rendered README's top names all six wins led by ⭐ silent-error capture; every
highlight link resolves to an existing section anchor.

- [ ] T002 [US1] In `README.md`, sharpen the intro (~L3–9): add one present-tense, visible-value sentence — SafeSignal catches the errors users actually hit (uncaught exceptions, unhandled rejections, React/Vue component crashes) and ships them securely to any backend — keeping the existing secure-by-default framing. (FR-003 partial / FR-006 lead-in)
- [ ] T003 [US1] In `README.md`, add a `## What you get` highlights block immediately after the intro and before `## Why SafeSignal`: a short bulleted list of the six shipped features, **led by the ⭐ `./capture` "catch the silent errors" win** (uncaught exceptions + unhandled rejections), then dev-mode console rendering, error breadcrumbs, readable source-mapped error stacks, the React error boundary + hook, and the Vue errorHandler adapter. Each bullet is a one-line benefit linking to its existing section anchor: `#catch-uncaught-errors--capture-subpath`, `#pretty-dev-logs--dev-console-subpath`, `#error-breadcrumbs--recent-event-context-on-errors`, `#readable-error-stacks--stacks-subpath`, `#catch-react-errors--framework-react-subpath`, `#catch-vue-errors--framework-vue-subpath`. (FR-006/FR-007)
- [ ] T004 [US1] In `README.md`, confirm `## Why SafeSignal` (the quality-attributes list) remains intact as the follow-on (FR-008) — no deletion, just now preceded by `## What you get`.

**Checkpoint**: top-of-README value framing complete; all six anchors resolve.

---

## Phase 4: User Story 2 — Remove future server/RUM scope creep (P1) 🎯

**Goal**: No `safesignal-server` paragraph and no `./rum-*` RUM-features roadmap remain; the boundary is
stated positively; the legitimate OTLP/protobuf roadmap item stays; no dangling references.

**Independent test**: `rg "safesignal-server|\./rum-" README.md` → nothing; the focus/boundary line and
the OTLP/protobuf item are present; no "see Roadmap" pointer dangles.

- [ ] T005 [US2] In `README.md` Roadmap section (~L697–718): **remove** the entire "RUM features" bullet (Web Vitals / view tracking / network instrumentation / automatic page capture / `./rum-*`) and the entire `safesignal-server` paragraph; **keep** the `## Roadmap` header, its intro line, and the OTLP/HTTP+protobuf encoder bullet. (FR-001/FR-002/FR-005)
- [ ] T006 [US2] In `README.md`, add the sharpened present-tense **focus/boundary line** where the removed content was (or just below the OTLP item): SafeSignal captures your errors (explicit `log.error`, framework boundaries, opt-in global capture) and ships them securely to any backend; it is **not** a RUM/monitoring product (no Web Vitals, view tracking, network instrumentation, or server backend) and is not planned to become one. (FR-003)
- [ ] T007 [US2] In `README.md`, reframe the two dangling "see Roadmap" pointers: (a) the lightweight bullet near the top (~L17) → point to the shipping `./capture` subpath instead of Roadmap; (b) the `./capture` "errors only" note (~L270–271) → `(that is RUM — out of scope)`. (FR-004)
- [ ] T008 [US2] In `README.md`, lightly sharpen the anti-feature line (~L57–59) to also name the server/monitoring backend (e.g. "…remain out of scope — SafeSignal is not a RUM/monitoring product or server backend."), consistent with the focus line. (FR-003 reinforcement)

**Checkpoint**: future-product scope creep gone; boundary stated; no dangling refs; OTLP item retained.

---

## Phase 5: Polish & Verification

- [ ] T009 [P] In `CHANGELOG.md`, add a `### Docs — …` entry under the existing `## [Unreleased]` describing both halves: (1) the README now leads with the shipped developer-value features (⭐ `./capture` silent-error capture, dev-console, breadcrumbs, readable stacks, `./framework-react`, `./framework-vue`); (2) removed the forward-looking `./rum-*` roadmap and `safesignal-server` paragraph, sharpening product focus. Note: historical spec records left as point-in-time documents; no code/API/`exports` change; reference issue #19. (FR-009)
- [ ] T010 Run the verification recipe from `quickstart.md`: `rg "safesignal-server|\./rum-" README.md CHANGELOG.md` → no matches (SC-001); confirm the six highlight anchors resolve (SC-003); the boundary line + OTLP item present (SC-004/SC-005); then `npm run verify` green (SC-007, nothing regressed) and `git diff --name-only main` shows only `README.md`, `CHANGELOG.md`, `specs/021-*`.

---

## Dependencies & Execution Order

- **T001** (baseline) → first.
- **US1 (T002–T004)** and **US2 (T005–T008)** both edit `README.md` → run **sequentially** in one pass
  (no `[P]` among README tasks); order US1 then US2 (or interleave) — they touch different regions so
  there is no logical dependency, only the same-file serialization.
- **T009** (CHANGELOG, separate file) is `[P]` with the README work.
- **T010** (verify) → last, after all edits.

## Implementation Strategy

Single small editorial pass over `README.md` + a `CHANGELOG.md` note, then verify. Both P1 stories are
co-equal halves of one reframe and ship together in one PR on `021-docs-focus-cleanup`, gated by
`ci-success`. No MVP split is meaningful — the value (lead-with-wins) and the honesty (remove
scope-creep) belong in the same commit.
