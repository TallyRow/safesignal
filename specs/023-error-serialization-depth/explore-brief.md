# Explore Brief — Structured Error Serialization Depth

**Date**: 2026-06-10
**Session**: /speckit-clarify

## Scope Boundaries

- **In scope**: Opt-in deep serialization of the error logged with an event:
  flat ordered `cause`-chain capture, AggregateError member capture (recursive
  through members only), DOMException legacy `code`, value-filtered own
  enumerable extra fields on any error node; truncation indicators; extension
  of the sanitize and redact pipeline stages to cover all new nested error
  fields; suppression of the feature-016 `safesignal.errorCauses` attribute
  while enabled (FR-014); a targeted amendment to the 001 sanitization
  contract; a minimal justified default-entry size-lock bump.
- **Out of scope**: Stack text on nested nodes (FR-013); any change to how
  Error instances inside *attributes* are sanitized (type-tagged, never
  recursed — unchanged); an allowlist mechanism for extra fields; deprecation
  or removal of feature 016's cause capture; a new exports subpath; changes to
  stack normalization (feature 017); RUM-style capture.

## Decisions Made

- **Q**: Extra-field capture policy? → **A**: Value-filtered (own enumerable
  JSON-safe properties; redaction rules are the privacy control). —
  *Rationale*: identical posture to event attributes, which already carry
  arbitrary developer data through the same redactor; zero consumer setup.
  *Rejected*: allowlist-only (high adoption friction, most errors would yield
  nothing) and value-filter+optional-allowlist (larger API/test surface for
  marginal benefit; can be added later additively).
- **Q**: Bundle-size posture for the locked default entry? → **A**: A minimal,
  justified ceiling increase in the size-lock test is acceptable; number set at
  plan time, rationale recorded in the test. — *Rationale*: the lock exists to
  catch accidental subpath leakage, not to forbid deliberate core features.
  *Rejected*: hard no-bump (would force scope cuts) and a new subpath (new
  distributed surface, 3 hardcoded subpath lists, clunkier opt-in).
- **Q**: Config surface shape? → **A**: One config key accepting `true` (safe
  defaults) or an options object tuning limits. — *Rationale*: one-line opt-in
  for the common case, tunable for the rest. *Rejected*: object-only (verbose
  opt-in) and boolean+sanitizerLimits (mixes error-capture bounds into the
  attribute-sanitization contract).
- **Q**: Wire shape? → **A**: Flat chain + recursive members — every node has
  a flat, ordered cause-chain array; aggregate nodes also carry a members
  array of nodes that recurse the same way. — *Rationale*: linear chains
  render and query best flat (matches 016's mental model and ecosystem
  precedent); recursion only where the structure genuinely branches.
  *Rejected*: fully recursive cause-in-cause tree (awkward for backends) and
  fully flat node list with parent indices (human-hostile, no precedent).

## Deferred Items

- Exact serialization-limit numbers (defaults/clamps listed in spec Key
  Entities as intended values) — *Why deferred*: confirmed at plan time
  against real payload measurements; spec values are the starting point.
- Exact new field names on the error payload — *Why deferred*: design-time
  check against then-current OTel exception semantic conventions (spec
  Standards Alignment) before locking the contract.
- Exact size-lock ceiling bump — *Why deferred*: measured after
  implementation; must be minimal and justified in the size-lock test.
- Allowlist mode for extra fields — *Why deferred*: additive future option if
  consumers ask for stricter capture; redaction suffices for v1.

## Terminology

- **Serialized Error Node** = the structured representation of one error
  (name, message, optional flat cause chain, optional members, optional extra
  fields, truncation indicators).
- **Node budget** = the binding outer limit on total nodes per event; depth
  and member-count limits are subordinate inner bounds (never additive).
- **Deep error serialization** = this feature's opt-in capture mode (avoid
  "error enrichment", which collides with breadcrumb enrichment in the
  dispatcher).

## Key Context for Reviewers

- The pipeline's sanitize/redact stages today cover only the error payload's
  flat name/message/stack fields; extending them to the new nested fields is
  an explicit requirement (FR-008), not an incidental detail — round-1 spec
  review caught this as a blocker.
- Feature 016's `extractCauseChain` writes `safesignal.errorCauses` into
  attributes pre-dispatch, gated on the breadcrumbs flag; FR-014 deliberately
  uses the race-free form "never populated while 023 is enabled" rather than
  "suppressed when a chain was produced".
- Extraction reads the raw error only at event construction (event-builder
  stage); after that, only plain structured data exists. The attribute
  sanitizer's type-tag-don't-recurse rule for Error values inside attributes
  is intentionally unchanged.
- Opt-in default was decided (consistent with features 016/017) partly to
  keep SC-005 (unchanged shape when disabled) testable as a locked-contract
  check.
