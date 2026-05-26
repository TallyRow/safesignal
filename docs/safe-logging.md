# Logging Safely

> **Status**: scaffold. This document is filled in by **T050** (US3 docs
> update). All sections below are placeholders that satisfy T004's
> "section placeholders matching quickstart.md" acceptance.

## Logging safely

Mirror the DO / DON'T patterns from
`specs/001-structured-logging-core/quickstart.md` and expand each with
package-specific rationale. To be authored in T050.

### DO

(Filled in by T050.)

### DON'T

(Filled in by T050.)

## What the package does for you automatically

(Filled in by T050. Will enumerate the pipeline order
`Sanitize → URLScrub → Redact → ControlCharGuard → Freeze(dev)` from
`contracts/sanitization.md` and `contracts/redaction.md`.)

## Customizing redaction and sanitization

(Filled in by T050. Will cover `createRedactor()` composition,
`scrubUrl()` usage, and tightening `sanitizerLimits`.)

## Transport-boundary security requirements

(Filled in by T029 and T050. Will cover body-only delivery, HTTPS
requirement, the prohibition on event data in URLs, and
`assertTransportContract()` usage.)

## Documented drops, transforms, and bounded behavior

(Filled in by T050 — satisfies Principle VI's requirement to enumerate every
behavior that drops or transforms events. Will list level-filter drops,
redactor-fail drops, sanitizer truncation markers, URL-scrubber replacements,
control-char escaping, `NoopTransport` swallowing, and the v1 no-batching /
no-sampling stance.)

## Diagnostics

(Filled in by T050. Will document `onInternalError` behavior and the
"once per transport per session" rule.)
