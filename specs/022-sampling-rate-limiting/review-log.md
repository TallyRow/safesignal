# Review Log — Opt-In Sampling / Rate-Limiting

## Round 1 — spec.md

**Date**: 2026-06-07 17:30 CDT

### 🔴 Remaining Issues

- **Silent drops when `onDrop` is not configured** (`spec.md: FR-006, Log Integrity Considerations, US3`): The `onDrop` callback is described as optional ("a sampler with `onDrop` configured"), but Principle VII (Log Integrity) requires that every drop is documented and observable. If a consumer configures sampling without providing `onDrop`, drops become silent — violating the constitution's prohibition on undocumented event loss and the issue's explicit requirement of "no silent drops." **Why it blocks**: A production incident investigation where sampling was configured but `onDrop` was forgotten would have no visibility into dropped events. The consumer would unknowingly lose log data with zero evidence. **Fix**: Make `onDrop` a required field of `SamplerConfig` (if you opt into sampling, you MUST supply a drop handler). Alternatively, provide a default drop path — emit a drop-count metric through the existing `onInternalError` mechanism when no `onDrop` is configured.

### 🟡 Should Fix

- **SC-005 "zero per-event overhead" is overstated** (`spec.md: SC-005`): "No allocation, no function call beyond the existing dispatch path" is misleading. When sampling is off, the dispatcher still must check whether a sampler wrapper exists (a branch). Rephrase to "zero additional allocation and zero per-event state mutation beyond a single branch when sampling is off" for accuracy.

- **DropNotification timestamp format unspecified** (`spec.md: Key Entities → DropNotification`): The `timestamp` field is listed but its format is never specified. The `LogEvent.timestamp` uses milliseconds since epoch (as defined in the existing event pipeline). DropNotification should explicitly state it matches that format for consistency with downstream monitoring.

- **Sampler decision function shouldn't inspect attributes** (`spec.md: Security & Privacy`): The spec says "redaction happens before the sampler sees the event" but doesn't state that the sampler's decision function does NOT read attribute values. While head-based and rate-limit sampling don't need attributes, a future sampler type might. The spec should include a requirement that the sampler's decision function receives only the subset of the event it needs (level, timestamp, message — not attributes, context, or error objects). This closes a future security gap.

### 💡 Suggestions

- **Default drop notification as internal log event** (`spec.md: US3`): Consider having `onDrop` default to logging a structured drop notification at debug level through the existing pipeline (not just a callback), so drops are automatically observable in the log stream itself. This would make "forgot to configure `onDrop`" less catastrophic.

- **FR-006 should include `samplerName` field** (`spec.md: FR-006`): The Key Entities section lists `samplerName` in `DropNotification`, but FR-006 only mentions `level`, `message`, `timestamp`, and `reason`. Add `samplerName` to FR-006 for consistency — it matters when multiple transports have different samplers.

## Round 2 — spec.md (PASSED)

**Date**: 2026-06-07 17:35 CDT
**Result**: No blocking issues. Spec frozen.

### Changes Applied in Round 1

- 🔴 **Silent drops → onDrop required**: FR-006 now requires `onDrop` when sampling is configured. SamplerConfig shows `onDrop` as non-optional. US3 adds acceptance scenario 4: configuring sampling without `onDrop` is rejected. Log Integrity section updated. Principle VII satisfied.
- 🟡 **SC-005 wording**: Rephrased to "zero additional allocation and zero per-event state mutation beyond a single branch."
- 🟡 **DropNotification timestamp**: Now explicitly "milliseconds since epoch, matching LogEvent.timestamp format" in both Key Entities and FR-006.
- 🟡 **Sampler decision function isolation**: Added FR-007a: sampler decision function MUST NOT inspect attribute values, context, or error objects. Security section updated.
- 💡 **samplerName in FR-006**: Added to the field list for multi-sampler attribution.

## Round 1 — plan.md (PASSED)

**Date**: 2026-06-07 18:05 CDT
**Result**: No blocking issues. Plan frozen.

### Review Findings

- ✅ All 14 FRs addressed in plan, research, data-model, and contracts
- ✅ Constitution Check verifies all 11 principles with specific evidence
- ✅ Sampler wrapping order correct: `SafeTransport(Sampler(ConsumerTransport))` — belt-and-suspenders fail-open
- ✅ No new dependencies, no new subpath (core export keeps config-level approach import-free)
- ✅ Token bucket uses `performance.now()` — monotonic, no backward jumps, documented
- ✅ `Math.random()` for head sampling — justified as statistical, not cryptographic
- ✅ All enforcement mechanisms listed with specific test file paths
- ✅ Project structure follows existing patterns (`src/sampler/`, matching `src/transport/`)
- 🟡 Quickstart shows HeadSampler as named export — plan's Source Code section confirms `src/index.ts` exports sampler factories. The public API types (`src/api/types.ts`) must also export `SamplerConfig` and `DropNotification` alongside the factories. Verified in plan structure.


