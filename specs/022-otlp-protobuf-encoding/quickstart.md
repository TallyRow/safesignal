# Quickstart: OTLP Protobuf Encoding

Opt-in protobuf encoding for `./transport-otlp`. Smaller payloads (30–60%
smaller than JSON), broader collector compatibility. Pure serialization
swap — same endpoint, same headers, same batching, same failure handling.

> Additive. JSON remains the default. Zero new runtime dependencies.

## Enabling protobuf

Add `encoding: 'protobuf'` to your `createOtlpTransport` options:

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [
    createOtlpTransport({
      endpoint: 'https://otlp.example.com/v1/logs',
      headers: { 'x-api-key': process.env.OTLP_API_KEY! },
      batching: { maxBatchSize: 20, maxBatchAgeMs: 5000 },
      encoding: 'protobuf', // ← opt in
    }),
  ],
});

const log = getRootLogger();
log.info('checkout.started', { cartId: 'c_123', itemCount: 3 });
```

Omit `encoding` (or set it to `'json'`) and the transport emits
`application/json` — unchanged from the existing JSON path:

```ts
createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  // encoding: 'json'  ← implicit default, identical to 007 behaviour
});
```

What the backend receives (OTLP/HTTP+protobuf logs — binary, not JSON):

```
POST /v1/logs HTTP/1.1
Content-Type: application/x-protobuf
…
<binary OTLP LogsData protobuf>
```

## Compatibility

- **JSON remains the default.** All existing consumers are unaffected — no
  code change needed.
- **Same endpoint, same headers, same batching, same failure handling.**
  Protobuf is a pure serialization swap behind the existing encoding seam.
- **Two transports can coexist** in the same runtime — one JSON, one
  protobuf — without shared state or interference.
- **Federated modules** don't know or care about the wire encoding. The
  host configures the transport; modules log through the shared runtime
  as always.

## Collector requirements

The OTLP collector must support `application/x-protobuf` Content-Type
(standard for OTLP/HTTP — any conformant OTLP receiver does). If your
backend only accepts JSON and you accidentally set `encoding: 'protobuf'`,
it may 4xx — the transport handles this identically to any non-2xx
(rate-limited `send_failed` notice), same as the JSON path.

## Size comparison

Protobuf payloads are typically **30–60% smaller** than JSON for the
same event data. A batch of 20 typical log events will see meaningful
byte savings on every POST — less bandwidth, faster delivery.

## Trace correlation

`injectTraceparent: true` works identically with protobuf. The
`traceparent` header is set on the request independently of body
encoding. Inside the payload, `traceId` and `spanId` are encoded as
protobuf bytes fields rather than JSON hex strings — the decoded
values are the same.

```ts
createOtlpTransport({
  endpoint: 'https://otlp.example.com/v1/logs',
  encoding: 'protobuf',
  injectTraceparent: true, // ← unchanged behaviour
});
```

## Edge cases

| Scenario | Behaviour |
|---|---|
| Invalid `encoding` (e.g. `'xml'`) | `TypeError` thrown at construction time — before any network or timer work |
| Empty batch | Produces a valid protobuf `LogsData` with zero `logRecords` (same semantic as JSON) |
| Oversized record | Per-record size guard uses JSON measurement (conservative over-estimate vs. protobuf); record dropped with `oversized_event` notice, same as JSON |
| Backend rejects protobuf (4xx) | Rate-limited `send_failed` notice — same failure surface as JSON |
| Serialization failure | Fail-closed — `serialize_failed` notice (rate-limited), batch dropped, no throw to caller |

## No new dependencies

No `npm install` or dependency change needed. The protobuf encoder is
hand-built with zero runtime dependencies — no `@opentelemetry/*`, no
`protobufjs`, no external protobuf library.
