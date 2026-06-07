# Contract: Sampler Transport Interface

**Feature**: 022-sampling-rate-limiting
**Date**: 2026-06-07

## S1: Sampler implements Transport

Both `HeadSampler` and `RateLimitSampler` MUST conform to the `Transport` interface
as verified by `assertTransportContract` (from `@tallyrow/safesignal/testing`).

### S1.1: name

- **Given** a sampler wrapping a transport with `name: "my-transport"`
- **When** `sampler.name` is read
- **Then** it returns `"sampler(my-transport)"` — the inner name wrapped for attribution

### S1.2: send()

- **Given** a sampler wrapping any transport
- **When** `sampler.send(event)` is called during a "pass" decision
- **Then** the inner transport's `send()` is called with the same event
- **And** the call returns `void` (not `Promise<void>`)

### S1.3: send() during drop

- **Given** a sampler with an `onDrop` callback
- **When** `sampler.send(event)` is called and the sampler decides "drop"
- **Then** the inner transport's `send()` is NOT called
- **And** `onDrop` is called exactly once with a `DropNotification`
- **And** `sampler.send()` returns `void`

### S1.4: flush() delegation

- **Given** a sampler wrapping a transport that implements `flush()`
- **When** `sampler.flush()` is called
- **Then** the inner transport's `flush()` is called exactly once
- **And** the returned Promise resolves when the inner flush resolves

### S1.5: flush() when inner has no flush

- **Given** a sampler wrapping a transport without `flush()`
- **When** `sampler.flush()` is called
- **Then** the returned Promise resolves immediately (no-op)

### S1.6: shutdown() delegation

- **Given** a sampler wrapping a transport that implements `shutdown()`
- **When** `sampler.shutdown()` is called
- **Then** the inner transport's `shutdown()` is called exactly once

## S2: Sampler fail-open (FR-007)

### S2.1: Decision logic throws → pass through

- **Given** a sampler configured to always throw in its decision function
- **When** `sampler.send(event)` is called
- **Then** the inner transport's `send()` is called with the event (fail-open)
- **And** `onDrop` is NOT called
- **And** the error is reported to `onInternalError` exactly once per session

### S2.2: Sampler construction with invalid rate → clamp

- **Given** a head sampler constructed with `rate: 1.5` (>1.0)
- **When** `sampler.send(event)` is called
- **Then** the rate is clamped to 1.0 (100% pass through)
- **And** `onInternalError` fires exactly once with a clamp notice

## S3: Drop callback contract (FR-006)

### S3.1: Callback fires per drop

- **Given** a head sampler with rate 0.0 (drop all) and a counting `onDrop`
- **When** `sampler.send(event)` is called 5 times
- **Then** `onDrop` is called exactly 5 times
- **And** each call receives a `DropNotification` with `reason: "head_sample"`

### S3.2: Callback fields

- **Given** a sampler dropping a `warn`-level event with message `"test"`
- **When** `onDrop` is called
- **Then** `drop.level` is `"warn"`
- **And** `drop.message` is `"test"`
- **And** `drop.timestamp` is a number (milliseconds since epoch)
- **And** `drop.reason` is one of `"head_sample"` or `"rate_limited"`
- **And** `drop.samplerName` matches the sampler's `name`

### S3.3: Callback failure isolation

- **Given** a sampler with an `onDrop` that always throws
- **When** `sampler.send(event)` is called (resulting in a drop)
- **Then** `sampler.send()` does NOT throw (never-throw boundary)
- **And** the first throw fires `onInternalError` exactly once
- **And** subsequent drops do NOT fire `onInternalError` again (once per session)

### S3.4: DropNotification does not contain sensitive data

- **Given** a sampler receiving a `LogEvent` with `attributes: { token: "secret", userId: "123" }`
- **When** the event is dropped
- **Then** the `DropNotification` has NO `attributes` field
- **And** the `DropNotification` has NO `context` field
- **And** the `DropNotification` has NO `error` field
- **And** the string `"secret"` does not appear in any `DropNotification` field

## S4: Configuration rejection (FR-004, FR-005, FR-006)

### S4.1: Sampling off by default

- **Given** `configureLogging()` called without `sampling`
- **When** events are emitted
- **Then** no events are dropped by sampling
- **And** no `onDrop` callbacks fire
- **And** no sampler instances are created

### S4.2: Sampling without onDrop rejected

- **Given** `configureLogging()` called with `sampling: { type: 'head', rate: 0.5 }` (no `onDrop`)
- **When** configuration is processed
- **Then** configuration is rejected with a clear error message
- **And** the message includes "onDrop is required"

### S4.3: Per-transport opt-out

- **Given** `configureLogging()` with global `sampling` and one transport with `sampling: false`
- **When** events are emitted
- **Then** the opt-out transport receives 100% of events (no sampling)
- **And** other transports sample according to the global config

### S4.4: Per-transport override

- **Given** `configureLogging()` with global head sampling at 10% and one transport overriding to rate-limit at 50/s
- **When** events are emitted
- **Then** the overriding transport uses rate-limit, not head sampling
- **And** its `onDrop` fires with `reason: "rate_limited"`
