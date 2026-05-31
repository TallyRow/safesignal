# Quickstart: Outbound `traceparent` Header Injection

**Feature 009** lets the `./transport-otlp` transport tag its delivery request with a W3C
`traceparent` header when a flushed batch all belongs to one trace — so a backend,
collector, or proxy can join the ingest request to its trace. It is **off by default** and
purely additive: existing deliveries are unchanged unless you opt in.

> Prerequisite: your events already carry trace context via Feature 008 — supplied through
> the existing context path (`configureLogging` context / `withContext()` / the per-emit
> `correlation()` hook) or `parseTraceparent(...)`. This feature carries that context onto
> the request header; it never mints trace ids.

## Enable it

```ts
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

const transport = createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  headers: { authorization: `Bearer ${token}` }, // sent only on the wire
  injectTraceparent: true, // ← opt in
});
```

That's the whole API change: one optional boolean on `OtlpTransportOptions`.

## What you get

When a batch is flushed and **every event in it shares one valid trace context**, the
delivery request carries:

```http
POST /v1/logs HTTP/1.1
content-type: application/json
authorization: Bearer …
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
tracestate: vendor1=opaque,vendor2=opaque        # only if uniform across the batch
```

- `traceparent` is the standard `00-<traceId>-<spanId>-<flags>` form, built from the
  events' `context.trace` (flags default to `00` when `traceFlags` is absent).
- `tracestate` is added **only** when every event in the batch carries the same
  `traceState` (within the 512-char W3C bound); otherwise just `traceparent` is sent.
- The event payload bodies and OTLP `LogRecord` trace fields are **unchanged** — the
  header is purely additive to the request.

## What it deliberately does NOT do

| Situation | Result |
|-----------|--------|
| `injectTraceparent` not set / `false` | No `traceparent` header — request byte-identical to before. |
| Batch spans two or more different traces | No header (no arbitrary "representative" event). |
| Batch mixes traced and untraced events | No header. |
| Empty batch | No header. |
| Malformed / partial trace input | Dropped fail-closed upstream → no header; the batch still ships; nothing throws. |
| A consumer header already named `traceparent` | Your header wins — injection never overwrites `options.headers`. |
| `./transport-beacon` | Out of scope — `navigator.sendBeacon` can't set custom request headers. |

## Why batch-level (not per-event)

A single delivery request is one HTTP request and a `traceparent` header describes exactly
one trace/span. SafeSignal injects the header only when the **whole batch** uniformly
belongs to one trace, so the request-level claim is never misleading. If you want
finer-grained correlation, the **payload-level** trace fields from Feature 008 already give
you per-`LogRecord` `traceId`/`spanId` regardless of batching.

## Safety & security notes

- **Carry-only**: SafeSignal never generates trace/span ids.
- **Fail-safe**: header construction can never throw into a logging call or block delivery.
- **Secure**: the header carries only trace identifiers + bounded `tracestate`; it never
  overwrites, duplicates, or exposes your auth/secret headers, and never appears in
  payloads, diagnostics, or the bundle.
- **Vendor-neutral**: pure W3C Trace Context; the `./transport-otlp` bundle stays
  `@opentelemetry`-free and within its size budget.
