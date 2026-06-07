# Explore Brief — Opt-In Sampling / Rate-Limiting

**Date**: 2026-06-07
**Session**: /speckit-clarify

## Scope Boundaries

- **In scope**: Head-based sampling (probability 0.0–1.0), rate-limit sampling (token bucket, events/second), `Transport` wrapper pattern, declarative `sampling` config section in `LoggerConfig`, `onDrop` callback for observable drops, per-transport sampling opt-out/override, fail-open on sampler errors, never-throw boundary preservation.
- **Out of scope**: Global/cross-transport sampling (each transport samples independently), event transformation or batching, sampling decisions based on event content (attributes, context, error objects are NOT inspected per FR-007a), cryptographic randomness, async `onDrop` callbacks, configurable bucket capacity (fixed at rate for now).

## Decisions Made

- **Q**: How should the rate-limit time window work? → **A**: Token bucket with configurable refill interval. *Rationale*: Industry standard (AWS, GCP, every API gateway). Smooth under burst — no fixed-window boundary double-counting. Naturally handles tab throttling (tokens accumulate during idle). Rejected: fixed window (boundary bursts), sliding window (higher memory cost for no practical benefit in this use case).

- **Q**: Can individual transports override the global `sampling` config? → **A**: Global with opt-out per transport. *Rationale*: Matches existing composable transport model. The easy path is one setting for everything; advanced consumers can exempt specific transports (`sampling: false`) or override per transport. Rejected: uniform-only (too rigid — would force consumers to wrap transports manually to get per-transport behavior), per-transport-only (loses the "safe path is the easy path" benefit of global config).

- **Q**: Should `onDrop` support async (Promise-returning) callbacks? → **A**: Sync only — `(drop: DropNotification) => void`. *Rationale*: Keeps `send()` predictable — no microtask injection, no unhandled rejections from consumer code. Consumers who need async delivery push to their own queue in the sync callback. Rejected: async support (adds complexity, gates event flow on consumer handler, risk of unhandled rejections in the sampler pipeline).

- **Q**: Is `Math.random()` acceptable as the sampling randomness source? → **A**: Yes — `Math.random()` is sufficient. *Rationale*: Sampling is statistical, not cryptographic. All current browsers implement xorshift128+ which provides uniformity well within the target precision (±5% at 99% confidence). No `crypto.getRandomValues()` dependency needed — keeps the head sampler fast and synchronous. Rejected: crypto-required (adds weight for negligible statistical benefit), crypto-with-fallback (adds complexity without a demonstrated need).

- **Q**: What clock source should the rate-limit sampler use? → **A**: `performance.now()`. *Rationale*: Monotonic — no backward jumps from NTP sync or manual clock changes. High-resolution. Tokens correctly do NOT refill during system sleep (no events were emitted). Easy to mock in tests via `vi.useFakeTimers()`. Rejected: `Date.now()` (vulnerable to clock skew causing incorrect token counts).

## Deferred Items

- **Configurable bucket capacity**: The token bucket capacity defaults to the rate. Allowing consumers to set capacity independently (e.g., rate=10/s but capacity=50 for larger bursts) is deferred to a future iteration. The default behavior (capacity = rate) is sensible and sufficient for v1.
- **`onDrop` as default log event**: Having the sampler emit drop notifications through the normal logging pipeline (at debug level) as a default when no explicit `onDrop` is provided was suggested during spec review but deferred — the `onDrop`-required approach is simpler and makes drops explicitly visible. This can be reconsidered if consumers report friction.

## Terminology

- **Head sampling** = Probability-based sampling where each event is independently dropped with probability (1 - rate). Also called "head-based sampling."
- **Rate-limit sampling** = Token-bucket-based sampling where events exceeding the configured rate (events/second) are dropped. Also called "rate limiting."
- **Sampler** = A `Transport` wrapper that implements either head or rate-limit sampling.
- **Drop** = A sampler decision to not pass an event to the inner transport. Always fires `onDrop`.
- **Fail-open** = When the sampler's own logic errors, the event passes through (not dropped). "Better to ship an event than silently swallow it."

## Key Context for Reviewers

- The sampler is SafeSignal's first feature that **intentionally drops events**. Principle VII (Log Integrity) is the critical constitution gate — every drop must be observable. This is why `onDrop` is required (not optional) and configuration without it is rejected.
- The sampler does NOT inspect event attributes, context, or error objects (FR-007a). This was a security requirement identified during spec review — prevents a future sampler type from accidentally creating a sensitive-data exposure path.
- The `SafeTransport` wrapper pattern (existing in the codebase) is the model for the sampler wrapper — same lifecycle, same fail-safety invariants.
- Per-transport sampling (not global) is by design: two transports with the same sampler config operate independently. This means a consumer could sample ConsoleTransport at 10% and ship BeaconTransport at 100% — they're separate sampler instances.
