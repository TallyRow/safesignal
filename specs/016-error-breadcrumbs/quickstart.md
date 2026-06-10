# Quickstart & Acceptance Walkthroughs: Opt-In Error Breadcrumbs

These walkthroughs are the feature's acceptance tests, mapping to the spec User Stories / Success Criteria
and the `contracts/breadcrumbs.md` guarantees (BC-1..BC-13). Runnable locally and in CI with a capturing
transport (no real backend needed).

## Prerequisites

```bash
npm ci && npm run build
```

## Everyday use (host app)

```ts
import { configureLogging, getRootLogger, ConsoleTransport } from '@tallyrow/safesignal';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [ConsoleTransport()],
  breadcrumbs: true,            // or: { maxEvents: 30 }   — OFF by default
});

const log = getRootLogger();
log.info('checkout opened', { cartItems: 3 });
log.warn('coupon expired');
log.error('checkout failed', { orderId: 'ord_9f3' },
  new Error('checkout failed', { cause: new Error('payment processor 5xx') }));
// → the delivered error event's attributes carry `safesignal.breadcrumbs` (the info+warn)
//   and `safesignal.errorCauses` (the cause chain).
```

---

## Walkthrough 1 — Error carries the recent-event trail (US1 / SC-002 / BC-2, BC-3)

1. `configureLogging({ breadcrumbs: true, transports: [capturing] })`.
2. Emit `info`, `warn`, `debug`, then `error`.
3. **Expect**: the captured **error** event's `attributes['safesignal.breadcrumbs']` is the ordered
   oldest→newest list of the three preceding events (each `{ ts, level, message, attributes? }`),
   excluding the error itself; the non-error events were delivered **unchanged**.

✅ Pass: the error tells the story of what led to it.

---

## Walkthrough 2 — The cause chain is unrolled (US2 / SC-002 / BC-4, BC-5)

1. With breadcrumbs enabled, log an error whose value has a nested `cause` chain.
2. **Expect**: `attributes['safesignal.errorCauses']` is the ordered outermost→root list of
   `{ name, message }`. An error with **no** cause → the field is **omitted**. A **cyclic / very deep**
   chain → flattened to ≤ 8 entries, **0** loops, **0** throws.

✅ Pass: the root cause is visible without manual unwrapping.

---

## Walkthrough 3 — Off by default; behavior unchanged (US3 / SC-001 / BC-1)

1. `configureLogging({ transports: [capturing] })` — **no** `breadcrumbs`.
2. Emit events and an error.
3. **Expect**: no `safesignal.breadcrumbs` / `safesignal.errorCauses` on any event; delivered shapes and
   per-event cost identical to today; **0** buffer allocated.

✅ Pass: consumers who don't opt in see no change.

---

## Walkthrough 4 — Constant memory & O(1) at volume (US3 / SC-003 / BC-6, BC-8)

1. `breadcrumbs: { maxEvents: 10 }`; log `M = 10_000` events, then an error.
2. **Expect**: the trail on the error has exactly **10** entries (the most recent), the buffer never held
   more than 10, and recording cost did not scale with M. A recorded snapshot does **not** contain a
   nested `safesignal.breadcrumbs` key (anti-nesting).

✅ Pass: bounded memory regardless of volume.

---

## Walkthrough 5 — Secret-safe; only post-redaction data (US3 / SC-004 / BC-7)

1. With breadcrumbs enabled, emit events whose data carries a `makeSecretFixture()` value (so redaction
   masks it), then an error (also with a secret-bearing cause).
2. **Expect**: the raw secret appears **0** times in `safesignal.breadcrumbs` or `safesignal.errorCauses`
   (both are built from the post-redaction event / pipeline-processed causes); the redacted placeholder is
   what shows.

✅ Pass: breadcrumbs add no leakage.

---

## Walkthrough 6 — Fail-safe & integrity (US3 / SC-006 / BC-9, BC-10)

1. With breadcrumbs enabled and a transport that records what it received, force a recorder/enricher
   failure (e.g. a pathological event) and log an error.
2. **Expect**: the error event is **still delivered** to the transport (with or without a partial trail);
   the failure is routed to `onInternalError`; **0** throws into the page. The delivered error object is
   not mutated after delivery, and **non-error** events the transport received are unchanged (integrity).

✅ Pass: breadcrumbs never break the page and never lose the error.

---

## Walkthrough 7 — Lightweight & shared (US3 / SC-007 / BC-11)

1. `configureLogging({ breadcrumbs: true })`; create many `Logger`s via `createLogger()` / `child()`.
2. **Expect**: **0** per-logger buffers/timers/listeners; one shared buffer on the runtime; a subsequent
   `configureLogging()` yields a fresh, isolated buffer.

✅ Pass: per-`Logger` creation stays free; the buffer is a single runtime-level resource.

---

## Walkthrough 8 — Bundle discipline (Principle X / BC bundle section)

1. `npm run build`; run the `bundle-invariance` check and the bundle-shape tests.
2. **Expect**: `dist/index.mjs` gzip delta vs base is within **±1 KiB** (the breadcrumb code is lean
   enough to fit), the `exports` map is unchanged (no new subpath), and the re-baselined
   `DEFAULT_ENTRY_*_GZ_MAX` ceilings pass with their documented justification.

✅ Pass: the default entry's growth is bounded and accounted for; no subpath added.
