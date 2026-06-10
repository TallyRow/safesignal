# Review Log — Structured Error Serialization Depth

## Round 1 — spec.md
**Date**: 2026-06-10

### 🔴 Remaining Issues

- **Placement of new error fields not resolved — ErrorInfo extension vs. attributes has contract implications** (`spec.md:§Assumptions` / `§Key Entities`): Spec deferred field placement to design phase while FR-008 required pipeline coverage the flat error payload does not fully have today. **Fix applied**: Placement decided in spec (error payload, additive); FR-008 now explicitly requires extending the sanitize and redact stages to traverse all nested error-node fields; Security & Privacy section states current stages cover only the three flat fields and that extension is a requirement of this feature. (Reviewer note: verified against source — sanitizer/redactor do process `event.error`'s flat name/message/stack today; the gap is nested-field coverage only.)

- **Feature 016 reconciliation / deduplication left entirely to design with no constraint** (`spec.md:§Assumptions`): No required outcome for the both-enabled overlap case. **Fix applied**: New FR-014 — when deep serialization is enabled and produces a chain, the 016 `safesignal.errorCauses` attribute is not additionally populated; 016 behavior completely unchanged when the feature is disabled. Assumption updated to "decided".

- **Sanitizer behavior for Error subclasses is already defined and conflicts with FR-005** (`spec.md:FR-005` / `contracts/sanitization.md`): Sanitizer contract type-tags Error instances in attributes and never recurses into own properties. **Fix applied**: FR-005 now states extraction reads the raw error at event construction (before the pipeline), produces plain structured data only, leaves the attribute-sanitizer no-recursion rule unchanged, and requires a targeted, versioned amendment to the documented sanitization contract.

### 🟡 Should Fix (addressed)

- SC-005 "byte-identical to previous release" untestable → restated as locked error-payload shape contract test; matching edge-case bullet updated.
- FR-009 untestable documentation clause → moved into SC-007 (explicitly marked review-checklist, not machine-enforced).
- No concrete defaults/clamps for Serialization Limits → intended defaults and clamp ranges added to Key Entities (chain depth 8 [1,16]; members 10 [1,100]; extra fields 16 [0,64]; node budget 50 [1,256]; value depth/string length reuse sanitizer limits), exact values confirmed at plan time.
- Nested-stack scope only an assumption → promoted to FR-013 (nested nodes never capture stack text).
- DOMException name/message duplication ambiguity → US3 scenario 3 clarified: only legacy `code` is new.
- SC-006 underspecified → cross-referenced to Serialization Limits; clarified size bound, not wall-clock.
- Principle IV standards alignment unaddressed → Standards Alignment bullet added to Consumer Impact (OTel exception conventions kept for flat fields; deeper structure additive; naming checked at design time).

### 💡 Suggestions (partially addressed)

- SC-003 now names its verification mechanism (fault-injection unit tests).
- Opt-in hedge removed — marked decided (off by default, consistent with 016/017).
- US3 §4 / Edge Cases overlap left as-is (harmless emphasis).

---

## Round 2 — spec.md (PASSED)
**Date**: 2026-06-10
**Result**: No blocking issues. All three round-1 🔴 issues verified genuinely resolved (reviewer cross-checked against `sanitizer.ts`, `redactor.ts`, `logger.ts`, and the 001 sanitization contract). Spec frozen.

Post-pass cleanups applied (round-2 🟡 + 💡, all low-risk wording tightenings, no semantic change to frozen requirements):
- FR-005 names the amendment target file (`specs/001-structured-logging-core/contracts/sanitization.md`).
- FR-014 simplified to the race-free form: when 023 is enabled, `safesignal.errorCauses` is never populated.
- FR-004 names the node budget as the binding outer limit (inner limits subordinate, not additive).
- SC-007 files the Constitution-X obligation: tasks phase must include a named documentation-review task.
- US1 scenario 3 pins the existing `NonError` labelling convention.

---

## Round 1 — plan.md (PASSED)
**Date**: 2026-06-10
**Result**: No blocking issues. Reviewer verified all claimed code anchors
against source (reduceError, 016 cause block, sanitizeErrorInfo, redactor
error handling, size-lock constants) and cross-checked FR-001..FR-014 +
SC-001..SC-007 coverage across plan/research/data-model/contracts. Plan
frozen.

🟡 fixes applied post-pass:
- ES-2 now locks cycle termination NOT setting `causesTruncated` (explicit
  assertion required).
- ES-1 now locks chain flatness (`entry.causes === undefined` asserted).
- R4 explicitly names extending `PackageErrorCode` with
  `'error_serialize_failed'` as the first source-touching step.

💡 fixes applied: R8 line anchor corrected to logger.ts:221–238; R9 notes the
walker is a pure throw-free iterator (sanitizer-never-throws preserved) and
documents the url-scrubber name-exclusion parity precisely.

---

