# Quickstart — Deep Error Serialization (Feature 023)

## Enable with safe defaults

```ts
import { configureLogging, createLogger } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout' },
  environment: 'production',
  serializeErrors: true, // off by default; true = bounded safe defaults
});

const log = createLogger('payment');

try {
  await submitOrder();
} catch (err) {
  log.error('order submission failed', { orderId }, err);
}
```

With a wrapped error like
`new Error('checkout failed', { cause: new TypeError('payment API timeout', { cause: 'ECONNRESET' }) })`,
the emitted event's error payload carries the whole story:

```jsonc
{
  "error": {
    "name": "Error",
    "message": "checkout failed",
    "stack": "Error: checkout failed\n  at ...",
    "causes": [
      { "name": "TypeError", "message": "payment API timeout" },
      { "name": "NonError", "message": "ECONNRESET" }
    ]
  }
}
```

`AggregateError` members land under `members`; custom subclass data (e.g.
`HttpError.status`) lands under `fields` — after the same redaction rules as
event attributes. Nested entries never include stack text.

## Tune the bounds

```ts
configureLogging({
  serializeErrors: {
    maxCauseDepth: 4, // default 8,  clamp [1, 16]
    maxMembers: 5,    // default 10, clamp [1, 100]
    maxFields: 8,     // default 16, clamp [0, 64]
    maxNodes: 25,     // default 50, clamp [1, 256] — binding outer budget
  },
});
```

Out-of-range values clamp to the nearest bound and emit one
`onInternalError` notice. Truncation is always visible on the payload
(`causesTruncated`, `membersTotal`, `fieldsTruncated`, `budgetExhausted`).

## Privacy notes

- Everything captured (names, messages, fields) passes the sanitize →
  URL-scrub → redact pipeline before any transport; redaction fails closed.
- Field capture is value-filtered (JSON-safe own enumerable properties only);
  functions and prototype properties are never serialized. Do not stash
  secrets on Error objects — redaction key rules apply, but omission beats
  redaction.
- While enabled, the breadcrumbs cause-chain attribute
  (`safesignal.errorCauses`) is not additionally populated — one chain, one
  place.

## Verify

```sh
npm run verify   # build + typecheck + lint + format + tests + api surface
```
