# Phase 0 Research: Living-Docs Focus Cleanup

A documentation-only change; the only open decisions are editorial. **Decision / Rationale /
Alternatives.**

## R1 — Where to place the "lead with shipped value" highlights

- **Decision**: Add a new `## What you get` block immediately after the intro paragraph and **before**
  the existing `## Why SafeSignal` quality-attributes list. Lead with the ⭐ `./capture` silent-error
  capture; each highlight is a one-line benefit that links to the feature's existing section anchor.
- **Rationale**: First-screenful real estate should answer "what do I get?" (visible developer value)
  before "how is it safe?" (quality attributes). Keeping `Why SafeSignal` as the follow-on preserves
  the existing, accurate framing without duplication. Reuses the per-feature sections that already
  exist (no rewrite) — minimal, DRY (memory: lead with visible developer value).
- **Alternatives**: Replace `Why SafeSignal` outright (rejected — loses the secure-by-default framing
  adopters also need); a separate top-level "Features" page (rejected — README is the landing page, the
  value must be in it); a comparison table (rejected — over-engineered for this change).

## R2 — How to remove the future-product content without leaving dangling references

- **Decision**: Delete the `./rum-*` RUM-features roadmap bullet and the `safesignal-server` paragraph
  from the Roadmap section; **keep** the section header + the OTLP/protobuf bullet; add a sharpened
  present-tense focus/boundary line where the removed content was. Reframe the two prior "see Roadmap"
  pointers — the lightweight-bullet one (top) points to the shipping `./capture` subpath; the
  `./capture` "errors only" note becomes "(that is RUM — out of scope)".
- **Rationale**: Removing the content alone would leave two dangling "see Roadmap" cross-references and
  a header with thin content. Reframing the pointers and adding the boundary line keeps the docs
  coherent and states the narrow scope positively (FR-003/FR-004). The OTLP/protobuf item is a
  logging-transport follow-on (in scope), so it stays (FR-005).
- **Alternatives**: Remove the whole Roadmap section (rejected — the OTLP item is legitimate and worth
  signalling); leave a "RUM is out of scope" *roadmap* bullet (rejected — keep the boundary in the
  focus line, not as a roadmap item, to avoid re-implying a future).

## R3 — Which files are "living docs" (in scope) vs. historical (out)

- **Decision**: Edit only `README.md` and `CHANGELOG.md`. Leave all `specs/**` and
  `docs/safe-logging.md` unchanged.
- **Rationale**: `specs/**` are point-in-time records — editing them would falsify history.
  `docs/safe-logging.md`'s matches are `dd-rum` (a **forbidden** dependency name in the pins audit) and
  "downstream monitoring" (Principle VII log-integrity prose) — neither is future-product scope creep
  (FR-010). Confirmed by reading the actual match contexts.
- **Alternatives**: Sweep every `*.md` (rejected — would rewrite history and remove legitimate
  dependency-exclusion / log-integrity language).

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Highlights placement | new `## What you get` after intro, before `## Why SafeSignal`; ⭐ capture first; links to existing sections (R1) |
| Avoid dangling refs | delete RUM bullet + server paragraph, keep OTLP item, reframe 2 pointers, add boundary line (R2) |
| Living vs historical | edit only README + CHANGELOG; specs/** and docs/safe-logging.md untouched (R3) |
