# Research: Sampling / Rate-Limiting

**Feature**: 022-sampling-rate-limiting
**Date**: 2026-06-07

## 1. Existing Transport Wrapping Pattern

The codebase already has a transport wrapper: `SafeTransport` (`src/transport/safe-transport.ts`).
It wraps any `Transport`, catching synchronous throws and rejected Promises from
`send()`, `flush()`, and `shutdown()`. Failures route through `onInternalError`
exactly once per transport per session (FS-12 invariant).

**Key design elements to replicate:**
- Wraps `Transport` — implements `Transport` interface itself, delegates to inner
- Has a `name` property (passes through inner transport's name)
- Constructor receives inner transport + error callback
- `safeNotify` / `wrapAsPackageError` for structured error reporting
- `notified` flag for once-per-session error budget

**Sampler-specific differences:**
- Sampler has a DECISION (pass/drop) before delegation, not just error isolation
- Sampler exposes `onDrop` callback (consumer-facing, not internal error)
- Sampler fail-OPEN (passes event through on error) vs SafeTransport's error-isolation
- Sampler doesn't need flush/shutdown wrapping (delegates directly)

## 2. Config Normalization Pattern

`normalizeConfig()` in `src/config/config.ts` transforms `LoggerConfig` → `NormalizedConfig`.
Transport factories are invoked once here. Sanitizer limits are resolved and clamped.

**Integration point for sampling:**
- Add `sampling?: SamplerConfig` to `LoggerConfig` (public API)
- Normalize sampling in `normalizeConfig` (validate rate bounds 0.0–1.0, reject if no `onDrop`)
- No `sampling` field in `NormalizedConfig` — instead, samplers are applied in
  `buildConfiguredRuntime` when wrapping transports

## 3. Transport Wrapping in buildConfiguredRuntime

`buildConfiguredRuntime()` in `src/runtime/configured-runtime.ts` wraps every consumer
transport in `SafeTransport`. The sampler wrapper should be applied BEFORE SafeTransport:

```
ConsumerTransport → Sampler(inner, config) → SafeTransport(sampledInner, onInternalError)
```

**Why Sampler inside SafeTransport:**
- SafeTransport is the outermost error boundary — catches any residual throw from the sampler
- Sampler catches its own decision errors (fail-open) and `onDrop` errors (never-throw)
- SafeTransport provides belt-and-suspenders for catastrophic sampler bugs

**Sampling OFF path:**
When `sampling` is not configured, skip sampler wrapping entirely. The dispatcher
already iterates `config.transports` — no sampler means no per-event overhead
beyond the existing dispatch loop (SC-005: single branch to check).

## 4. Token Bucket Algorithm

**Algorithm**: Standard token bucket with configurable refill interval.

- **State**: `tokens: number` (current token count), `lastRefill: number` (performance.now() timestamp)
- **Capacity**: Equal to the configured rate (allowing one burst of the full rate per refill interval)
- **Refill interval**: Default 1 second, configurable
- **Refill logic**: On each `send()` call, calculate elapsed time since `lastRefill`,
  add `elapsed * rate` tokens (capped at capacity), update `lastRefill`
- **Decision**: If `tokens >= 1`, consume 1 token and pass through. Otherwise, drop.
- **Clock**: `performance.now()` — monotonic, high-resolution, no backward jumps

**Tab throttling behavior**: `performance.now()` continues advancing when a tab is
backgrounded (unlike `setTimeout`). Tokens refill during background. When tab regains
focus, the bucket may be full — but no burst beyond capacity. When system sleeps,
`performance.now()` pauses — tokens do NOT refill (correct: no events were emitted).

**Testability**: `performance.now()` is mockable via `vi.useFakeTimers()` in Vitest.

## 5. Randomness Approach

**Algorithm**: `Math.random()` for head sampling decision.

All modern browsers implement xorshift128+ for `Math.random()`, which provides
sufficient uniformity for statistical sampling at the target precision
(±5% at 99% confidence, SC-001).

**Why not crypto.getRandomValues():**
- Adds allocation (Uint32Array per call)
- Statistical sampling, not cryptographic — uniformity needs are modest
- Keeps the head sampler synchronous and allocation-free

## 6. Error Handling Design

| Error Scenario | Behavior | Enforcement |
|---|---|---|
| Sampler decision logic throws | Event passes through (fail-open) | try/catch in sampler's `send()` |
| `onDrop` callback throws | Error caught, routed to `onInternalError` once per session | try/catch around `onDrop()` call, `notified` flag |
| `Math.random()` / `performance.now()` fails | Not possible in spec-compliant browsers; if somehow throws, fail-open | Same try/catch as decision logic |
| Configuration without `onDrop` | `configureLogging()` rejects at normalize time | Validation in `normalizeConfig` or `buildConfiguredRuntime` |

## 7. TypeScript & Build Considerations

- New types in `src/api/types.ts`: `SamplerConfig`, `DropNotification`, `SamplerType`
- New source files in `src/sampler/`: head-sampler.ts, rate-limit-sampler.ts, types.ts
- Samplers exported from `src/index.ts` (core entry — no separate subpath needed
  for the config-level approach to work without extra imports)
- tsup config: no change needed (samplers are part of the core `index` entry)
- Bundle-size budget: ≤ 2 KB gzipped over baseline (SC-007)

## 8. Test Strategy

| Test File | What It Verifies |
|---|---|
| `tests/contract/sampler-contract.test.ts` | Implements `Transport` interface, passes `assertTransportContract` |
| `tests/unit/sampler/head-sampler.test.ts` | Distribution accuracy, fail-open, extremes (0%, 100%) |
| `tests/unit/sampler/rate-limit-sampler.test.ts` | Token bucket accuracy, refill behavior, clock mocking |
| `tests/unit/sampler/drop-callback.test.ts` | Callback fires per drop, callback failure isolation, `notified` flag |
| `tests/security/sampler-no-leak.security.test.ts` | `onDrop` never receives attributes/context/error objects |
| `tests/integration/sampler-config.integration.test.ts` | `configureLogging()` with sampling, per-transport override |
