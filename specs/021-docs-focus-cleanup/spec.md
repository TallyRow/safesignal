# Feature Specification: Living-Docs Focus Cleanup — Remove Future Scope Creep, Lead with Shipped Value

**Feature Branch**: `021-docs-focus-cleanup`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Living-docs focus cleanup for SafeSignal (issue #19): remove the future server/RUM scope creep from README and lead the docs with the shipped developer-value features. Docs-only — no code, API, exports, dependency, or constitution change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A newcomer immediately sees what SafeSignal does for them (Priority: P1)

A developer evaluating SafeSignal opens the README. Within the first screenful they should understand
the concrete, visible wins they get today — above all, that SafeSignal **catches the silent errors**
their users hit (uncaught exceptions, unhandled rejections, framework component crashes) and ships them
securely — rather than wading through quality-attribute prose first or being misled by
forward-looking features that will never ship.

**Why this priority**: First impressions decide adoption. Leading with shipped, developer-facing value
is the headline goal; it is independently valuable even if nothing else changed.

**Independent Test**: Open the rendered README; confirm the first screenful names the shipped wins
(led by the ⭐ silent-error capture) and that each highlight links to a real section further down.

**Acceptance Scenarios**:

1. **Given** the README, **When** a reader views the top (intro + the highlights block), **Then** they
   see a concise list of the six shipped developer-facing capabilities, led by the ⭐ `./capture`
   "catch the silent errors" win, each linking to its existing detailed section.
2. **Given** each highlight link, **When** followed, **Then** it resolves to an existing in-page
   section (no dead anchors).
3. **Given** the existing "Why SafeSignal" quality-attributes list, **When** the reframe lands, **Then**
   it remains as the follow-on (the "how it stays safe" detail after the "what you get" headline).

---

### User Story 2 - The docs make an honest, narrow promise (no future product) (Priority: P1)

A prospective adopter (or contributor wary of scope creep) reads the README and should find a **clear,
present-tense boundary**: SafeSignal is a browser error-logging library, not a RUM/monitoring product
and not a server. The README must not advertise a future `safesignal-server` backend or `./rum-*`
features the maintainer has decided against.

**Why this priority**: An honest, narrow scope is what the open-source community trusts; advertising
abandoned future products erodes that trust and invites scope-creep pressure. Co-equal P1 with US1 —
the removal and the value-framing are two halves of one reframe.

**Independent Test**: Search the living docs (README, CHANGELOG); confirm no mention of
`safesignal-server` or `./rum-*`/RUM-as-future-product remains, while the boundary statement (SafeSignal
is not a RUM/monitoring product) is present and the legitimate logging-transport roadmap item is intact.

**Acceptance Scenarios**:

1. **Given** the README, **When** searched, **Then** there is **no** `safesignal-server`
   monitoring-backend paragraph and **no** `./rum-*` RUM-features roadmap item.
2. **Given** the README, **When** read, **Then** it carries a sharpened present-tense focus line stating
   SafeSignal captures errors and ships them securely to any backend and is **not** a RUM/monitoring
   product (no Web Vitals, view tracking, network instrumentation, or server backend), with no promise
   to become one.
3. **Given** the previous "see Roadmap" cross-references that pointed at the deleted RUM content,
   **When** read, **Then** they are reframed to non-dangling text (point at the shipping `./capture`
   subpath, or simply state "out of scope").
4. **Given** the legitimate **OTLP/HTTP+protobuf encoder** roadmap item (a logging-transport
   follow-on), **When** the cleanup lands, **Then** it is **retained**.

---

### Edge Cases

- **Historical records**: `specs/**` contain point-in-time mentions of the abandoned future product;
  these are **not** edited — rewriting historical specs would falsify the record. Only **living** docs
  change.
- **False-positive matches**: `docs/safe-logging.md` mentions `dd-rum` (the Datadog RUM package, named
  as a **forbidden** dependency) and "downstream monitoring" (Principle VII log-integrity prose).
  Neither is future-product scope creep; that file is **not** changed.
- **Unrelated stale facts**: e.g. a stale constitution version reference elsewhere in the README is a
  separate concern and is **out of scope** for this change.
- **Changelog discipline**: the change is recorded as a docs note under `[Unreleased]`.

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**: **No change.** Documentation only.
- **Compatibility Impact**: None — no code, types, config, events, `exports`, or behavior change.
- **Migration Notes**: None.
- **Deprecation & Migration**: No contract deprecated or removed. (Removing a *future, never-shipped*
  README promise is not an API deprecation.)
- **Host/Module Usage Impact**: None.
- **Security & Privacy Considerations**: None — no data path changes. Docs continue to model safe
  logging (no new examples that dump objects or disable redaction).
- **Log Integrity Considerations**: None — no event production changes.
- **Runtime Scale & Federated Deployment Impact**: None.
- **Supply-Chain / Distribution Impact**: None — packaged files (`["dist"]`), `exports`, dependency
  set, publish path, and signed/attested release flow are all unchanged. README is not packaged into
  the runtime artifact but is the npm/GitHub landing page; this sharpens it.
- **Verification & Enforcement**: This change adds **no** new automated quality gate (it is editorial
  prose). It is verified by (1) a text search proving the removed content is gone and the boundary
  statement + highlights are present, and (2) the existing `npm run verify` and `changelog-validate`
  CI job confirming nothing regressed. Stated explicitly: no new test/CI/lint rule is introduced.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (remove RUM roadmap)**: The README MUST NOT contain the forward-looking "RUM features"
  roadmap item (Web Vitals, view tracking, network instrumentation, automatic page-level capture, or
  `./rum-*` subpaths).
- **FR-002 (remove server paragraph)**: The README MUST NOT contain the `safesignal-server`
  monitoring-backend paragraph or any reference to a planned server/monitoring backend product.
- **FR-003 (sharpened focus line)**: The README MUST state, in present tense, that SafeSignal captures
  errors (explicit `log.error`, framework boundaries, and opt-in global capture) and ships them
  securely to any backend, and that it is **not** a RUM/monitoring product and is not planned to become
  one.
- **FR-004 (no dangling references)**: Any cross-reference that previously pointed at the removed RUM
  roadmap MUST be reframed so no "see Roadmap"-style pointer dangles.
- **FR-005 (retain legitimate roadmap)**: The README MUST retain the OTLP/HTTP+protobuf encoder roadmap
  item (a logging-transport follow-on, not RUM/server).
- **FR-006 (value-first highlights)**: The README MUST present, near the top (after the intro, before
  or alongside the existing quality-attributes list), a concise highlights block of the shipped
  developer-facing features, led by the ⭐ `./capture` "catch the silent errors" win, covering also:
  dev-mode console rendering, error breadcrumbs, readable source-mapped error stacks, the React error
  boundary + hook, and the Vue errorHandler adapter.
- **FR-007 (working anchors)**: Each highlight MUST link to its existing in-README section; all such
  links MUST resolve (no dead anchors).
- **FR-008 (retain quality attributes)**: The existing "Why SafeSignal" quality-attributes content MUST
  remain (as the follow-on to the new highlights), not be deleted.
- **FR-009 (changelog note)**: `CHANGELOG.md` MUST gain a docs entry under `[Unreleased]` describing
  both the value-first reframe and the removal of the future server/RUM scope.
- **FR-010 (living docs only)**: `specs/**` historical records and `docs/safe-logging.md` MUST NOT be
  edited; no code, test, CI, `exports`, dependency, or constitution change is made.

### Key Entities

- **README highlights block**: the new near-top "what you get" list of shipped capabilities, led by the
  ⭐ silent-error capture, each linking to its detailed section.
- **README focus/boundary statement**: the sharpened present-tense sentence delimiting SafeSignal as an
  error-logging library, explicitly not a RUM/monitoring product or server.
- **Changelog `[Unreleased]` docs note**: the record of this editorial change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A text search of the living docs (`README.md`, `CHANGELOG.md`) returns **zero** matches
  for `safesignal-server` and for `./rum-*` as a future feature; matches remain only in `specs/**`.
- **SC-002**: The README's first screenful (intro + highlights) names **all six** shipped
  developer-facing features, with the ⭐ `./capture` silent-error capture first.
- **SC-003**: **100%** of the highlight links resolve to an existing README section anchor (no dead
  links).
- **SC-004**: The README contains exactly one clear, present-tense boundary statement that SafeSignal
  is not a RUM/monitoring product or server.
- **SC-005**: The legitimate OTLP/protobuf roadmap item is still present.
- **SC-006**: `CHANGELOG.md` `[Unreleased]` contains a docs note covering both halves; the
  `changelog-validate` check passes.
- **SC-007**: No source/test/config file changes — `npm run verify` passes unchanged and the diff is
  limited to `README.md`, `CHANGELOG.md`, and this feature's `specs/021-*` artifacts.

## Assumptions

- **Living docs = `README.md` + `CHANGELOG.md`.** `specs/**` are immutable historical records;
  `docs/safe-logging.md` needs no change (its matches are a forbidden-dependency name and log-integrity
  prose, not scope creep).
- **The six shipped features already have README sections** (capture, dev-console, breadcrumbs, stacks,
  framework-react, framework-vue); this feature surfaces them up top and links to them — it does not
  rewrite the per-feature sections.
- **The OTLP/protobuf encoder roadmap item stays** — it is a logging-transport follow-on, not RUM.
- **No constitution change**; this aligns with Principle II (clear consumer boundaries) and VI (focused
  surface). The standing scope line holds: error capture is in-scope logging; RUM/server is a different
  product.
- **Editorial change, no new enforcement gate** — verification is text-search + existing CI; no test is
  added (consistent with a docs-only change).
