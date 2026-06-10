# Research — Structured Error Serialization Depth (Phase 0)

**Date**: 2026-06-10. No NEEDS CLARIFICATION markers remained after
/speckit-clarify; this phase resolves the design-level unknowns the spec and
clarify session explicitly deferred.

## R1 — Field naming vs. open standards

**Decision**: Extend `ErrorInfo` with `causes` (flat ordered array), `members`
(AggregateError constituents), `fields` (extra own enumerable data), plus
truncation markers. Keep existing `name`/`message`/`stack` untouched.

**Rationale**: OpenTelemetry semantic conventions (logs/exceptions) define only
flat `exception.type` / `exception.message` / `exception.stacktrace`; there is
no published structured cause-chain or aggregate-member convention to conform
to (spec §Standards Alignment, re-checked against OTel semconv as of knowledge
cutoff). The names mirror the platform vocabulary (`Error.cause`,
`AggregateError.errors` "members", own-property "fields") and read naturally
in JSON viewers.

**Alternatives considered**: `exception.*`-prefixed keys (rejected: those are
OTel *attribute* names for a different transport shape, not `ErrorInfo`
fields; the OTLP transport mapping can translate later if a convention
emerges); `cause`/`errors` literal platform names (rejected: `cause` implies
single nested node — our shape is a flattened chain; `errors` is ambiguous in
a logging payload).

## R2 — DOMException legacy `code`

**Decision**: Special-case DOMException-like errors: read `.code` explicitly
(guarded, typeof number, > 0) and store it as `fields.code`. Detection by
structural check (`name`/`message` strings + numeric `code` present) — never
`instanceof DOMException` alone.

**Rationale**: `DOMException.code` is a **prototype getter**, not an own
enumerable property — generic own-property capture (FR-005) would miss it,
which is exactly why the spec calls it out. `instanceof` fails cross-realm and
in non-DOM environments (SSR import-safety); the structural check works
everywhere and degrades to a harmless no-op.

**Alternatives considered**: capture all prototype getters by allowlist
(rejected: opens the side-effectful-getter surface FR-005 forbids; `code` is
the only spec-mandated prototype field); skip `code` entirely (rejected: spec
FR-005/US3 requires it).

## R3 — Cross-realm and error-like values

**Decision**: A value is "error-like" when it is a non-null object with string
`name` and string `message` own-or-inherited properties. Error-like values are
serialized structurally (name, message, then deep capture); everything else in
a cause position is coerced to `{ name: 'NonError', message: String(value) }`
(matching `reduceError`/016 precedent). The top-level value keeps today's
`reduceError` behavior when it is not error-like.

**Rationale**: `instanceof Error` fails across realm boundaries (iframes,
workers) — spec Edge Cases requires structural serialization. The
name+message check is the same shape `extractCauseChain` effectively relies
on and is cheap and side-effect-free (property reads guarded by try/catch).

**Alternatives considered**: `Object.prototype.toString.call(v) === '[object
Error]'` (rejected as the sole check: misses subclass-tagged exotics in some
engines and plain error-shaped objects; kept as a fast-path hint only if
useful at implement time).

## R4 — Extraction location

**Decision**: Extraction runs inside `buildLogEvent` (event-builder): when the
normalized config carries serialization limits, `event.error` is produced by
`serializeError(errorValue, limits)` (new `src/errors/serialize-error.ts`)
instead of `reduceError(errorValue)`; the call is wrapped in try/catch with
fallback to `reduceError` + `onInternalError` notification
(`error_serialize_failed`). Prerequisite first step when source work begins:
extend the `PackageErrorCode` union in
`src/internal/errors/internal-errors.ts` with `'error_serialize_failed'` —
`safeNotify` accepts only `PackageError`, so nothing else type-checks before
this lands.

**Rationale**: Event-builder is the single place the raw error value is
reduced today (`reduceError`, event-builder.ts:55) and the only stage that
sees the raw value — satisfying FR-005's "extraction reads the raw error at
event construction time". The logger already threads per-runtime config to
dispatch; passing the normalized limits into `BuildLogEventInput` is a
two-line change. Placing it in logger.ts (like the 016 attribute write) would
duplicate the reduce path; placing it in the dispatcher would require the
dispatcher to hold the raw error, violating the "transports never see the
original Error" invariant boundary.

**Alternatives considered**: above. Also a separate pipeline stage (rejected:
stages operate on `LogEvent` post-build, where the raw error no longer
exists).

## R5 — Truncation indicator shape

**Decision**: Optional, absent-when-clean markers:
- `causesTruncated?: true` on the node whose chain was clipped (depth or
  budget);
- `membersTotal?: number` on an aggregate node when members were omitted
  (records the original count per FR-003);
- `fieldsTruncated?: true` on a node whose field set was clipped;
- `budgetExhausted?: true` on the **top-level** error payload when the node
  budget cut anything anywhere.

**Rationale**: FR-002/FR-003/FR-010 require explicit machine-readable
truncation with the original member count; optional-absent keeps the
no-empty-placeholder acceptance (US1 scenario 2) and the disabled/clean shapes
minimal.

**Alternatives considered**: a single nested `truncated: {...}` object per
node (rejected: deeper shape for no added information, heavier on the wire);
global-only flag (rejected: loses which list was clipped, hurting forensic
interpretation).

## R6 — Config & limits normalization

**Decision**: `LoggerConfig.serializeErrors?: boolean | SerializeErrorsOptions`
with `SerializeErrorsOptions = { maxCauseDepth?, maxMembers?, maxFields?,
maxNodes? }`. Defaults/clamps (from spec Key Entities, confirmed):
maxCauseDepth 8 [1,16]; maxMembers 10 [1,100]; maxFields 16 [0,64]; maxNodes
50 [1,256]. Value depth and string length reuse the event's
`sanitizerLimits` (no new knobs). Normalization in `config.ts` follows the
existing clamp-and-notify pattern (one `onInternalError` notice per clamped
key, reusing the `sanitizer_limit_clamped`-style flow with a serialization
limit code); defaults exported from `env-defaults.ts` alongside
`DEFAULT_SANITIZER_LIMITS`.

**Rationale**: identical ergonomics to `breadcrumbs: boolean | options`
(types.ts:279) per clarify Q3; clamp bounds keep pathological configs bounded
(Constitution III/V); reusing sanitizer limits for value depth/string length
avoids contract overlap (clarify Q3 rejected option C for good reason — these
two knobs genuinely are sanitizer concerns).

## R7 — Default-entry size lock

**Decision**: Implement, measure `dist/index.mjs`/`.cjs` gzip deltas, then
raise `DEFAULT_ENTRY_MJS_GZ_MAX` / `DEFAULT_ENTRY_CJS_GZ_MAX` in
`tests/security/transport-beacon-bundle-shape.security.test.ts` by the
**measured delta rounded up to the next 50 bytes**, with a dated rationale
comment naming this feature. Estimated growth ≤ ~1.0 KB gzipped (serializer
~2–3 KB source + pipeline-stage additions); treat > 1.5 KB gzip growth as a
design smell requiring simplification before bumping.

**Rationale**: clarify Q2 decided a minimal justified bump; the lock's job
(catching accidental beacon-code leakage) is preserved because the ceiling
stays tight to the measured value.

**Alternatives considered**: pre-committing a number now (rejected: must be
measured, not guessed).

## R8 — FR-014 suppression mechanism

**Decision**: In `logger.ts`, the existing 016 cause-attribute block
(logger.ts:221–238) gains one additional condition: it runs only when
serializeErrors is **not** enabled in the normalized config. No change to
breadcrumb trail capture (`safesignal.breadcrumbs`), which is unrelated to
cause chains.

**Rationale**: matches FR-014's race-free "never populated while enabled"
form; one-line, mechanically testable (ES-11).

## R9 — Pipeline extension strategy

**Decision**: Each affected stage extends its existing error handling in
place, sharing one exported node-walk iterator from `serialize-error.ts`
(`forEachErrorNode(error, cb)` visiting the payload + every chain/member
node):
- `sanitizer.ts` `sanitizeErrorInfo`: bound `name`/`message` of every node and
  every string inside `fields` to `maxStringLength`; `fields` values pass
  through the existing attribute-value sanitizer (depth-bounded, type-tagged)
  — guaranteeing the same uncontrolled-serialization protections.
- `url-scrubber.ts`: scrub node `message` and `fields` strings exactly as it
  scrubs the flat error fields today.
- `redactor.ts`: apply shape rules to every node's `name`/`message` (parity
  with redactor.ts:138–156) and key-based redaction rules to `fields` entries
  (parity with attribute redaction); any throw keeps the existing fail-closed
  `redactor_failed` drop behavior.

**Rationale**: FR-008 demands parity, not new machinery; a shared walker keeps
the three stages structurally incapable of disagreeing about which nodes
exist. The walker is a pure, throw-free data iterator over already-extracted
plain objects (it never touches a raw Error), preserving the
sanitizer-never-throws invariant. Stage order and dispatcher are untouched.
URL-scrub parity note: the scrubber today scrubs error `message`/`stack` but
not `name` — node coverage mirrors that exactly (messages and `fields`
strings; names excluded).

**Alternatives considered**: flattening nodes into attributes pre-pipeline to
reuse attribute handling wholesale (rejected by clarify Q4/spec placement
decision — data lives on the error payload); a new dedicated pipeline stage
(rejected: would duplicate redaction logic and add ordering risk).
