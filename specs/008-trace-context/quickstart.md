# Quickstart: W3C Trace-Context Propagation

Correlate frontend logs with backend traces by supplying a **W3C Trace Context**
to SafeSignal. It is carried on every event and surfaced on OTLP `LogRecord`s.

> Additive. Events without trace context are unchanged. Zero new runtime deps.
> SafeSignal is **carry-only** — it never mints trace ids.

## Supply trace context (three equivalent paths)

### 1. From a `traceparent` string (e.g. SSR-injected)

```ts
import { configureLogging, parseTraceparent } from '@tallyrow/safesignal';
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

const trace = parseTraceparent(
  document.querySelector('meta[name="traceparent"]')?.content ?? '',
);

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  context: trace ? { trace } : {},
  transports: [createOtlpTransport({ endpoint: 'https://otlp.example.com/v1/logs' })],
});
```

### 2. Dynamic, per-emit — via the `correlation()` hook (recommended for SPAs)

```ts
import { configureLogging } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web' },
  environment: 'production',
  // Called cheaply on every emit — return the currently-active trace.
  correlation: () => {
    const span = myTracer.activeSpan(); // your tracer
    return span
      ? { trace: { traceId: span.traceId, spanId: span.spanId, traceFlags: 1 } }
      : {};
  },
});
```

### 3. Per-logger — via `withContext()`

```ts
const opLog = getRootLogger().withContext({
  trace: { traceId, spanId, traceFlags: 1 },
});
opLog.info('payment.authorized', { amount: 4200 });
```

## What the OTLP backend receives

```json
{
  "resourceLogs": [{
    "resource": { "attributes": [/* service.name, … */] },
    "scopeLogs": [{
      "scope": { "name": "@tallyrow/safesignal" },
      "logRecords": [{
        "timeUnixNano": "1748500000000000000",
        "severityNumber": 9, "severityText": "INFO",
        "body": { "stringValue": "payment.authorized" },
        "attributes": [{ "key": "amount", "value": { "intValue": "4200" } }],
        "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
        "spanId": "00f067aa0ba902b7",
        "flags": 1
      }]
    }]
  }]
}
```

The backend joins the log to its trace via the standard `traceId` / `spanId`.

## Safety properties

- **Carry-only**: SafeSignal never generates trace ids. No supplied context ⇒ no
  trace fields (no misleading correlation).
- **Fail-safe**: a malformed `traceparent`, wrong-length/all-zero id, or oversized
  `tracestate` is dropped fail-closed — the event still ships, no throw.
- **Secure**: trace ids are identifiers, not secrets; `tracestate` is bounded;
  existing redaction of attributes/context/errors is unaffected.
- **Vendor-neutral**: pure W3C; works with any tracer; the `./transport-otlp`
  bundle stays `@opentelemetry`-free.
- **Lightweight**: no per-`Logger` trace work; resolves through the existing
  cheap context-merge precedence (root → logger chain → `correlation()`).

## Other transports

Transports that predate trace fields (e.g. `./transport-beacon`) still receive
the structured `context.trace` in the event payload — nothing breaks; only the
OTLP transport maps it to standard top-level trace fields.
