# Logging Safely

> **Status**: scaffold. This document is filled in by **T050** (US3 docs
> update). All sections below are placeholders that satisfy T004's
> "section placeholders matching quickstart.md" acceptance.

## Logging safely

Mirror the DO / DON'T patterns from
`specs/001-structured-logging-core/quickstart.md` and expand each with
package-specific rationale. To be authored in T050.

### DO

(Filled in by T050.)

### DON'T

(Filled in by T050.)

## What the package does for you automatically

(Filled in by T050. Will enumerate the pipeline order
`Sanitize → URLScrub → Redact → ControlCharGuard → Freeze(dev)` from
`contracts/sanitization.md` and `contracts/redaction.md`.)

## Customizing redaction and sanitization

(Filled in by T050. Will cover `createRedactor()` composition,
`scrubUrl()` usage, and tightening `sanitizerLimits`.)

## Transport-boundary security requirements

Consumer transports MUST follow `contracts/transport.md` clauses
T-S1..T-S5. These rules exist because URLs leak through more channels
than most teams realize — proxy access logs, CDN edge logs, browser
history, the `Referer` header, third-party analytics scripts that scrape
the address bar, and APM dashboards that index by path. The package's
pipeline does no good if you then funnel its output through a query
string.

### The five rules

| ID | Rule | Why it matters |
|----|------|----------------|
| T-S1 | **No event data in URLs.** No part of a `LogEvent` may appear in the URL path, query string, or fragment. | URLs are the most leaked surface in browser HTTP traffic. Even `/log?event=...` ends up in CDN logs and the page's `Referer` header. |
| T-S2 | **Body-only delivery.** Use `navigator.sendBeacon(url, blob)` with a JSON `Blob`, or `fetch(url, { method: 'POST' \| 'PUT' \| 'PATCH', body, keepalive: true })`. | The body of a same-origin POST is not logged by intermediate proxies the way URLs are. |
| T-S3 | **HTTPS for cross-origin.** Absolute URLs MUST use `https://`. Same-origin relative URLs inherit the page's scheme. | A `Mixed Content` warning is the *symptom*. The *cause* is that an `http://` log endpoint exposes every event in plain text to every network hop. |
| T-S4 | **Treat events as immutable.** Don't mutate the `LogEvent` the transport receives. | Multi-transport delivery and the `__DEV__` freeze rely on this — a mutating transport corrupts events for the next transport in the chain. |
| T-S5 | **Idempotent `flush()` / `shutdown()`.** Both are optional and safe to call more than once. | Reconfigure-then-shutdown and SPA navigation both call these hooks more than once; non-idempotent implementations leak resources or throw. |

### The canonical sample

`examples/shared/beacon-transport.ts` is the body-only beacon reference
both example projects use. It demonstrates the safe shape end-to-end:
prefer `sendBeacon` with a JSON `Blob`, fall back to `fetch` with
`keepalive: true` and a JSON body, reject non-HTTPS cross-origin
endpoints at construction time, and treat the received event as
immutable.

```ts
import type { LogEvent, Transport } from '@your-org/frontend-logging-sdk';

export function makeBeaconTransport(opts: { endpoint: string }): Transport {
  return {
    name: 'beacon',
    send(event: LogEvent) {
      const body = JSON.stringify(event);
      if (typeof navigator?.sendBeacon === 'function') {
        if (navigator.sendBeacon(opts.endpoint, new Blob([body], { type: 'application/json' }))) return;
      }
      void fetch(opts.endpoint, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        credentials: 'same-origin',
      });
    },
  };
}
```

### Verify with `assertTransportContract`

The package's `./testing` subpath ships a contract-test helper that
exercises T-S1..T-S5 against any consumer-supplied transport. Use it in
your own test suite — never in production code:

```ts
// my-transport.test.ts
import { assertTransportContract } from '@your-org/frontend-logging-sdk/testing';
import { makeBeaconTransport } from '../shared/beacon-transport.js';

test('my transport satisfies the security contract', async () => {
  await assertTransportContract(
    makeBeaconTransport({ endpoint: 'https://logs.example.com/ingest' }),
  );
});
```

The helper intercepts `globalThis.fetch` and `navigator.sendBeacon` for
the duration of each check, drives several probe events through the
transport, and asserts the bad shapes T-S1..T-S5 forbid. It throws on
the first violation with a diagnostic message naming the failing
clause. The probe events include `makeSecretFixture()` values
(passwords, JWTs, bearer tokens, session IDs, etc.) so a transport that
encodes attributes into a URL leaks them and the check catches it.

### Failure-mode contract

Even when a transport passes the contract above, it's still wrapped in
the package's internal `SafeTransport`. The wrapper guarantees:

- A synchronous throw from `send()` is caught (no escape to the emit
  call site). One `onInternalError` notice per transport per session.
- A rejected `Promise` from `send()` is swallowed. No unhandled
  rejection. Same per-session notice budget.
- Repeated failures from the same transport are silent after the first
  notice — no log spam.
- A failing transport never prevents siblings in the same `transports`
  list from receiving the event.

See `contracts/failure-safety.md` (FS-1..FS-17) and the test in
`tests/contract/failure-safety.contract.test.ts` for the full battery.

### Anti-patterns to avoid

- **Don't** put event data in the URL. `fetch('https://x/log?evt=' +
  JSON.stringify(event))` leaks the entire event into proxy logs.
- **Don't** use `GET` for log delivery. Even an empty `?` becomes a
  surface the next "developer" will reach for. Reject GET at the
  transport boundary.
- **Don't** add tokens or session IDs as query params. Auth belongs in
  the request body or in headers, never in the URL.
- **Don't** mutate the event to add a delivery timestamp or sequence
  number. Wrap your payload in an envelope object during serialization
  instead.
- **Don't** install global `unhandledrejection` listeners as a backstop.
  The package's `SafeTransport` already catches everything; a global
  listener silently masks consumer-code bugs unrelated to logging.

## Documented drops, transforms, and bounded behavior

(Filled in by T050 — satisfies Principle VI's requirement to enumerate every
behavior that drops or transforms events. Will list level-filter drops,
redactor-fail drops, sanitizer truncation markers, URL-scrubber replacements,
control-char escaping, `NoopTransport` swallowing, and the v1 no-batching /
no-sampling stance.)

## Diagnostics

(Filled in by T050. Will document `onInternalError` behavior and the
"once per transport per session" rule.)
