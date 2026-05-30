# Quickstart: `./transport-otlp`

Ship SafeSignal logs to any OTLP-compatible backend (Datadog, Honeycomb,
Grafana, an OpenTelemetry Collector, ClickHouse, …) as OTLP/HTTP+JSON logs.

> Additive subpath. No change to the default entry, `./testing`, or
> `./transport-beacon`. Zero new runtime dependencies.

## Configure at the runtime level (once)

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [
    createOtlpTransport({
      endpoint: 'https://otlp.example.com/v1/logs', // full OTLP logs URL, HTTPS
      headers: { 'x-api-key': process.env.OTLP_API_KEY! }, // sent only on the wire
      batching: { maxBatchSize: 20, maxBatchAgeMs: 5000 },
    }),
  ],
});

// Loggers are cheap handles over the shared runtime — create freely.
const log = getRootLogger();
log.info('checkout.started', { cartId: 'c_123', itemCount: 3 });
```

What the backend receives (OTLP/HTTP+JSON logs):

```json
{
  "resourceLogs": [{
    "resource": { "attributes": [
      { "key": "service.name", "value": { "stringValue": "checkout-web" } },
      { "key": "service.version", "value": { "stringValue": "4.2.0" } },
      { "key": "deployment.environment", "value": { "stringValue": "production" } }
    ]},
    "scopeLogs": [{
      "scope": { "name": "@tallyrow/safesignal" },
      "logRecords": [{
        "timeUnixNano": "1748500000000000000",
        "observedTimeUnixNano": "1748500000000000000",
        "severityNumber": 9, "severityText": "INFO",
        "body": { "stringValue": "checkout.started" },
        "attributes": [
          { "key": "cartId", "value": { "stringValue": "c_123" } },
          { "key": "itemCount", "value": { "intValue": "3" } }
        ]
      }]
    }]
  }]
}
```

## Federated module usage

A federated module logs through the **host-configured** runtime; it does not
call `configureLogging` (the host owns the runtime). The module's identity rides
the merged context:

```ts
import { getRootLogger } from '@tallyrow/safesignal';
const log = getRootLogger().withContext({ module: { name: 'recommendations', version: '1.1.0' } });
log.warn('reco.fallback_used', { reason: 'cache_miss' });
// → module.name / module.version attributed per-LogRecord (service.* /
//   environment ride the shared OTLP Resource)
```

Duplicate-package-copy behavior: **isolated** — each configured transport
instance owns its own buffer and never cross-affects another copy.

## Safety properties (what you get by default)

- **Fail-safe**: a down/slow/erroring backend never throws into your code and
  never breaks the page. Failed batches are dropped (no retry) with at most one
  diagnostic notice per failure class.
- **Secure**: events are already sanitized + redacted before the transport sees
  them; auth headers are sent only on the request and never appear in payloads,
  diagnostics, or the bundle.
- **HTTPS-only**: non-HTTPS endpoints are refused at construction (loopback HTTP
  only via explicit `allowInsecureLoopback: true`).
- **Vendor-neutral**: standard OTLP — switch backends by changing the endpoint;
  no code changes.

## Verify a custom transport

```ts
import { assertTransportContract } from '@tallyrow/safesignal/testing';
import { createOtlpTransport } from '@tallyrow/safesignal/transport-otlp';

await assertTransportContract(
  createOtlpTransport({ endpoint: 'https://otlp.example.com/v1/logs' }),
); // throws on any T-S1..T-S5 violation
```

## Local development against a collector

```ts
createOtlpTransport({
  endpoint: 'http://localhost:4318/v1/logs',
  allowInsecureLoopback: true, // required for http:// loopback only
});
```

## Roadmap

- **OTLP/HTTP+protobuf** encoding (this feature ships JSON only, behind an
  internal encoding seam so protobuf is additive — see spec FR-015).
