# Quickstart & Acceptance Walkthroughs: Global Error Capture (`./capture`)

These walkthroughs are the feature's acceptance tests, mapping to the spec User Stories / Success
Criteria and the `contracts/capture-api.md` guarantees (CAP-1..CAP-10). Runnable locally and in CI.

## Prerequisites

```bash
npm ci && npm run build
```

## Everyday use (host app)

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createBeaconTransport } from '@tallyrow/safesignal/transport-beacon';
import { installGlobalErrorCapture } from '@tallyrow/safesignal/capture';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' })],
});

// Opt in — host only. Returns a disposer.
const dispose = installGlobalErrorCapture(getRootLogger());

// later, e.g. on teardown:
dispose();
```

A federated **module** never calls `installGlobalErrorCapture` — it only does
`createLogger({ module })`.

---

## Walkthrough 1 — Uncaught exception becomes a redacted log (US1 / SC-001, SC-003 / CAP-1, CAP-3)

1. Configure a capturing transport; `installGlobalErrorCapture(getRootLogger())`.
2. Dispatch an `error` event whose error message contains a secret fixture value.
3. **Expect**: one `error`-level event reaches the transport, `message: 'Uncaught exception'`,
   `error.name/message/stack` populated, **the secret redacted**, and the source attributes present.

✅ Pass: previously-silent uncaught error is delivered, fail-closed.

---

## Walkthrough 2 — Unhandled rejection becomes a log (US1 / SC-002 / CAP-2)

1. With capture installed, dispatch an `unhandledrejection` event with a rejection `reason`.
2. **Expect**: an `error`-level event, `message: 'Unhandled promise rejection'`, the reason reduced
   into `error`, source marker `unhandled-rejection`.

✅ Pass: unhandled rejections are captured the same way.

---

## Walkthrough 3 — Never breaks the page; chains existing handlers (US2 / SC-004, SC-005 / CAP-4..CAP-6)

1. Register a pre-existing `error` listener on the target; install capture; make the configured
   transport throw on `send`.
2. Dispatch an `error` event.
3. **Expect**: (a) the pre-existing handler still fired; (b) **no** exception propagated to the page
   (the transport throw was swallowed → `onInternalError`); (c) no capture loop occurred.

✅ Pass: additive, fail-safe, loop-safe.

---

## Walkthrough 4 — Disposer stops capture (US2 / SC-006 / CAP-7)

1. Install capture; call the returned disposer; dispatch an `error` event; call the disposer again.
2. **Expect**: no event captured after dispose; the second disposer call is a no-op (no throw).

✅ Pass: clean, idempotent teardown.

---

## Walkthrough 5 — `createLogger` attaches no global listeners (US3 / SC-007 / boundary test)

1. Spy on `addEventListener` for `error`/`unhandledrejection`; `configureLogging(...)` and
   `createLogger(...)`.
2. **Expect**: **zero** global `error`/`unhandledrejection` listeners attached by logger creation.
3. Source scan: only `src/capture/**` references those listeners / `window.onerror`.

✅ Pass: capture is never a `createLogger` side effect (the G1-filed boundary, deadline 2026-09-01).

---

## Walkthrough 6 — Distributed surface stays honest (Principle XI / Feature 012)

1. `npm run build && npm run surface:check`.
2. **Expect**: PASS — `./capture` is in the documented public-subpath set and ships
   `dist/capture.{d.ts,mjs,cjs}`; `dist/capture.*` is vendor-neutral.

✅ Pass: the 5th subpath is documented and shipped consistently.

---

## Walkthrough 7 — Safe no-op without a global (edge / CAP-9)

1. Call `installGlobalErrorCapture(logger, { target: {} as EventTarget })` (or in an environment
   without `addEventListener`).
2. **Expect**: returns a disposer, never throws; no capture occurs.

✅ Pass: SSR/worker-safe.
