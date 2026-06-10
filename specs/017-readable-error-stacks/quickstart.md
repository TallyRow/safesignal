# Quickstart & Acceptance Walkthroughs: Readable, Source-Mapped Error Stacks

These walkthroughs are the feature's acceptance tests, mapping to the spec User Stories / Success Criteria
and the `contracts/stacks.md` guarantees (ST-1..ST-12). Runnable locally and in CI with a capturing
transport + deterministic stack fixtures.

## Prerequisites

```bash
npm ci && npm run build
```

## Everyday use (host app)

```ts
import { configureLogging, getRootLogger } from '@tallyrow/safesignal';
import { createStackNormalizer } from '@tallyrow/safesignal/stacks';

// Optional: a SYNCHRONOUS source-map resolver over maps the consumer has already loaded.
const resolver = (f) => mySourceMaps.lookup(f.file, f.line, f.column) ?? null;

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: 'production',
  transports: [/* … */],
  normalizeStack: createStackNormalizer({ resolver, maxFrames: 30 }), // OFF unless set
});

getRootLogger().error('checkout failed', { orderId: 'ord_9f3' }, new Error('boom'));
// → the delivered error event's attributes carry `safesignal.stack`: trimmed, scrubbed,
//   source-mapped frames.
```

---

## Walkthrough 1 — Readable, trimmed frames (US1 / SC-002 / ST-2, ST-3, ST-4)

1. `configureLogging({ normalizeStack: createStackNormalizer(), transports: [capturing] })`.
2. Log an error whose `stack` is a noisy multi-line V8 (and separately a Firefox/Safari) string with
   `node_modules` / engine-internal / SafeSignal frames.
3. **Expect**: the captured error's `attributes['safesignal.stack']` is an ordered list of
   `{ function?, file?, line?, column? }`, with the noise frames removed; an unparseable stack → no
   `safesignal.stack` and the raw `error.stack` preserved.

✅ Pass: a clean, relevant trace instead of minified soup.

---

## Walkthrough 2 — Source-mapped frames (US2 / SC-003 / ST-5)

1. Configure with a fake **sync** `resolver` that maps `main.abc123.js:1:48201` → `src/checkout.ts:42:7`.
2. Log an error with minified frames.
3. **Expect**: resolvable frames carry `original` (file/line/column/name); a frame the resolver returns
   `null` for is left at its original position; the rest still resolve.

✅ Pass: production frames read against original source.

---

## Walkthrough 3 — Off by default; behavior unchanged (US3 / SC-001 / ST-1, ST-12)

1. `configureLogging({ transports: [capturing] })` — **no** `normalizeStack`.
2. Log errors.
3. **Expect**: no `safesignal.stack` on any event; shapes/cost identical to today; `0` stacks parsed.
   `dist/index.*` contains **no** `createStackNormalizer` / parser fingerprints (the heavy logic is only in
   `./stacks`).

✅ Pass: non-users see no change and ship no parser.

---

## Walkthrough 4 — Secret-safe frames (US3 / SC-004 / ST-6)

1. With `normalizeStack` configured, log an error whose stack contains a frame file like
   `https://app.example/p?token=SECRET:1:20`.
2. **Expect**: the delivered frame's `file` has the `token` value scrubbed (`[REDACTED]`) — the secret
   appears **0** times unredacted (the pipeline `urlScrub` scrubs each frame `file`).

✅ Pass: secrets in source URLs never ride along in frame text.

---

## Walkthrough 5 — Fail-safe & non-blocking (US3 / SC-005 / ST-7, ST-8)

1. Configure a `normalizeStack` whose parser/resolver **throws**, and log an error.
2. **Expect**: the error event is **still delivered** (with the raw stack / un-resolved frames); the
   failure is routed to `onInternalError`; **0** throws into the page. Delivery is synchronous and
   exactly-once (no deferral, no second event).

✅ Pass: normalization never breaks the page and never loses the error.

---

## Walkthrough 6 — Bounded & lightweight (US3 / SC-006, SC-007 / ST-9, ST-10)

1. Configure `createStackNormalizer({ maxFrames: 10 })`; log an error with a 500-frame stack.
2. **Expect**: `safesignal.stack` has ≤ 10 frames; per-frame strings are bounded.
3. Create many loggers; **expect** 0 per-logger normalization cost / listeners.

✅ Pass: bounded output, runtime-level only.

---

## Walkthrough 7 — Distributed surface stays honest (Principle XI / ST-11, ST-12)

1. `npm run build && npm run surface:check`.
2. **Expect**: PASS — `./stacks` is in the documented public-subpath set and ships
   `dist/stacks.{d.ts,mjs,cjs}`; `dist/stacks.*` is vendor-neutral (no bundled source-map library); the
   default `.` entry's seam delta is within the ±1 KiB invariance gate and the re-baselined ceilings pass.

✅ Pass: the 7th subpath is documented + shipped consistently; the default entry stays lean.
