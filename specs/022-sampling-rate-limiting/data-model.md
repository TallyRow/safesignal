# Data Model: Sampling / Rate-Limiting

**Feature**: 022-sampling-rate-limiting
**Date**: 2026-06-07

## Entities

### Sampler (abstract — implements `Transport`)

A `Transport` wrapper that decides whether each `LogEvent` reaches the inner
transport. Implements the `Transport` interface positioned between the
`SafeTransport` wrapper and the consumer's transport.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | `"sampler({inner.name})"` — stable diagnostic identifier |
| `send(event)` | `(event: LogEvent) => void` | Decide pass/drop, delegate to inner on pass, fire `onDrop` on drop |
| `flush()` | `() => Promise<void>` | Delegates to inner transport's `flush()` if it exists |
| `shutdown()` | `() => Promise<void>` | Delegates to inner transport's `shutdown()` if it exists |

**Invariants:**
- `send()` is synchronous (never returns a Promise)
- Decision logic runs in a try/catch — any throw → pass through (fail-open)
- `onDrop` callback runs in a try/catch — any throw → route to `onInternalError` once per session
- Does NOT inspect `event.attributes`, `event.context`, or `event.error` (FR-007a)

### HeadSampler

Probability-based sampler. Each event is independently sampled with probability `rate`.

| Field | Type | Description |
|---|---|---|
| `rate` | `number` | Probability (0.0–1.0) that an event is allowed through. 0.0 = drop all, 1.0 = pass all |
| `onDrop` | `(drop: DropNotification) => void` | Required drop handler |

**Decision function**: `Math.random() < rate` → pass, else drop.

**Edge cases**: rate=0 → drop all events (still fires onDrop for each). rate=1 → pass all events (never fires onDrop).

### RateLimitSampler

Token-bucket rate limiter. Events are dropped when the rate exceeds the configured
threshold.

| Field | Type | Description |
|---|---|---|
| `rate` | `number` | Maximum events per second |
| `refillInterval` | `number` | Token refill interval in milliseconds (default: 1000) |
| `capacity` | `number` | Maximum tokens (default: `rate`, allowing one burst of the full rate) |
| `tokens` | `number` | Current token count (internal state) |
| `lastRefill` | `number` | `performance.now()` timestamp of last token refill (internal state) |
| `onDrop` | `(drop: DropNotification) => void` | Required drop handler |

**Decision function**: Refill tokens based on elapsed time, capped at capacity.
If `tokens >= 1`, consume 1 token → pass. Else → drop.

**Invariants:**
- Token count never exceeds `capacity`
- Token refill uses `performance.now()` (monotonic)
- `tokens` and `lastRefill` are initialized at construction time

### SamplerConfig

Declarative configuration for the config-level approach (US2). Added to `LoggerConfig`.

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'head' \| 'rateLimit'` | Yes | Sampling strategy |
| `rate` | `number` | Yes | Rate: 0.0–1.0 for head, events/second for rate-limit |
| `onDrop` | `(drop: DropNotification) => void` | Yes | Drop handler (no silent drops) |
| `refillInterval` | `number` | No | For rate-limit: refill interval in ms (default: 1000) |

**Validation:**
- `rate` must be ≥ 0 (for both types) and ≤ 1 (for head type)
- `onDrop` must be a function — rejected at `configureLogging()` time if missing
- `refillInterval` must be > 0 if provided

### Per-Transport Sampler Override

Individual transports can override the global `sampling` config:

```typescript
// Opt out — no sampling for this transport
{ sampling: false }

// Override — different sampler config for this transport
{ sampling: { type: 'rateLimit', rate: 100, onDrop: myDropHandler } }
```

### DropNotification

Structured metadata emitted to `onDrop` for every dropped event.

| Field | Type | Description |
|---|---|---|
| `level` | `LogLevel` | Event severity level at time of drop |
| `message` | `string` | Event message at time of drop |
| `timestamp` | `number` | Milliseconds since epoch (matches `LogEvent.timestamp`) |
| `reason` | `'head_sample' \| 'rate_limited'` | Why the event was dropped |
| `samplerName` | `string` | Diagnostic name of the sampler that dropped the event |

**Security invariant**: DropNotification contains ONLY metadata — no `attributes`,
`context`, `error`, or any other potentially sensitive fields from the `LogEvent`.

## Relationships

```
LoggerConfig
  └── sampling?: SamplerConfig     ← global default (US2)

configureLogging()
  └── buildConfiguredRuntime()
        └── per transport:
              ConsumerTransport
                → Sampler(inner, config)        ← if sampling configured
                → SafeTransport(sampled, onErr)  ← always applied
```

```
LogEvent (enters sampler)
  │
  ├─ [decision: pass] → inner.send(event)
  │
  └─ [decision: drop] → onDrop({ level, message, timestamp, reason, samplerName })
```

## State Lifecycle

- Sampler instances are created once at `buildConfiguredRuntime()` time
- `HeadSampler` has no mutable state beyond the `notified` flag (for onDrop error dedup)
- `RateLimitSampler` has mutable state (`tokens`, `lastRefill`) — this state lives
  at the transport level in the shared runtime, NOT per-`Logger`
- When `configureLogging()` is called again (reconfiguration), old sampler instances
  are garbage collected along with the old runtime
