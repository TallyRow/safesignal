# Contract — Deep Error Serialization (Feature 023)

Consumer-facing guarantees of `serializeErrors`, each paired with its
machine-executable enforcement (Constitution X). Shapes are defined in
[data-model.md](../data-model.md); requirement IDs reference
[spec.md](../spec.md).

| ID | Guarantee | Spec | Enforced by |
|----|-----------|------|-------------|
| ES-1 | With `serializeErrors` enabled, an error's `cause` chain appears as `error.causes`: flat, ordered outermost-first, each entry `{ name, message, ... }`; absent when no cause. Chain-entry nodes never carry a populated `causes` of their own (flatness asserted: `entry.causes === undefined`). | FR-001 | `tests/contract/error-serialization.contract.test.ts` |
| ES-2 | Cyclic cause chains terminate; no hang/overflow; non-error causes coerce to `name: 'NonError'`. Cycle termination does NOT set `causesTruncated` (a cycle is an end, not a clip — asserted explicitly). | FR-002, US1.3 | `tests/unit/errors/serialize-error.test.ts` |
| ES-3 | Chains longer than `maxCauseDepth` are clipped with `causesTruncated: true`. | FR-002 | contract test (above) |
| ES-4 | `AggregateError` members appear as `error.members` (original order), clipped to `maxMembers` with `membersTotal` recording the original count; members recurse (own causes/members/fields). | FR-003 | contract test |
| ES-5 | Total nodes per event never exceed `maxNodes` regardless of input shape (nesting direction, combination); `budgetExhausted: true` on the payload when the budget clipped anything. Inner limits subordinate to the budget. | FR-004 | `tests/unit/errors/serialize-error.test.ts` (pathological inputs per SC-006) |
| ES-6 | `error.fields` captures only own enumerable JSON-safe properties (value-filtered); never functions, symbols, or prototype properties; clipped to `maxFields` with `fieldsTruncated`. DOMException's legacy numeric `code` is captured as `fields.code` (sole prototype special case). | FR-005, US3 | unit + contract tests |
| ES-7 | Nested nodes never carry stack text; top-level `stack` behavior unchanged. | FR-013 | contract test |
| ES-8 | Extraction failure (throwing getter, exotic object) never throws into the host and never drops the event: payload falls back to `{ name, message, stack? }` and `onInternalError` receives `PackageError('error_serialize_failed')`. | FR-006, SC-003 | `tests/unit/errors/serialize-error-failsafe.test.ts` |
| ES-9 | Every node `name`/`message` and every `fields` entry passes sanitize (string/depth bounds), URL-scrub, and redaction (shape rules + key rules) before any transport; redaction failure keeps the existing fail-closed drop. | FR-008, SC-004 | `tests/security/error-serialization.security.test.ts` |
| ES-10 | With `serializeErrors` absent/false (default), `event.error` is exactly `{ name, message, stack? }` — no new fields, no new attributes. | FR-009, SC-005 | security test (shape lock) |
| ES-11 | While `serializeErrors` is enabled, `attributes['safesignal.errorCauses']` is never populated; with it disabled, feature-016 behavior is byte-for-byte unchanged. | FR-014 | security test |
| ES-12 | Default-entry size-lock ceilings change at most once, by the measured delta (rounded up to 50 B), with a dated rationale comment naming this feature. | Supply-chain §, clarify Q2 | `tests/security/transport-beacon-bundle-shape.security.test.ts` (constants + comment reviewed in PR) |
| ES-13 | `serializeErrors` config: `true` = defaults (maxCauseDepth 8, maxMembers 10, maxFields 16, maxNodes 50); object keys clamp to documented ranges with one `onInternalError` notice per clamped key. | Key Entities | `tests/unit/config/serialize-errors-config.test.ts` |

## Contract amendments

- `specs/001-structured-logging-core/contracts/sanitization.md` — targeted,
  versioned amendment (required by FR-005): document that when feature 023 is
  enabled the **error payload** may carry `causes`/`members`/`fields` whose
  every string is bounded by `maxStringLength` and whose `fields` values pass
  the attribute-value sanitizer; the existing rule that Error instances
  encountered **inside attributes** are type-tagged and never recursed is
  explicitly unchanged.
- `ErrorInfo` extension is additive; api-extractor (`npm run api:check`)
  locks the new public surface.
