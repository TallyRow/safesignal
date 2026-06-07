# Quickstart & Acceptance Walkthroughs: Dev-Mode Console Rendering (`./dev-console`)

These walkthroughs are the feature's acceptance tests, mapping to the spec User Stories / Success
Criteria and the `contracts/dev-console.md` guarantees (DC-1..DC-10). Runnable locally and in CI via a
console spy (no real devtools needed).

## Prerequisites

```bash
npm ci && npm run build
```

## Everyday use (host app)

```ts
import { configureLogging, getRootLogger, ConsoleTransport } from '@tallyrow/safesignal';
import { DevConsoleTransport } from '@tallyrow/safesignal/dev-console';

configureLogging({
  application: { name: 'checkout-web', version: '4.2.0' },
  environment: import.meta.env.DEV ? 'development' : 'production',
  // The dev branch is tree-shaken out of the production bundle:
  transports: [
    import.meta.env.DEV
      ? DevConsoleTransport({ traceUrl: ({ traceId }) => `https://trace.example/${traceId}` })
      : ConsoleTransport(),
  ],
});

getRootLogger().info('checkout opened', { cartItems: 3 });
```

---

## Walkthrough 1 — Pretty grouped rendering in development (US1 / SC-001 / DC-1, DC-2)

1. Configure `environment: 'development'` + `DevConsoleTransport()`; spy on `console.groupCollapsed`/
   `log`/`groupEnd`.
2. Emit `info`/`warn`/`error` events (one with an error, one with a trace context).
3. **Expect**: each event opens a collapsed group with a level-styled header (message + `app · module ·
   env`), the attributes object inside, the error name/message + stack when present, and a trace link
   when a trace context is present.

✅ Pass: dev output is scannable and grouped, not a wall of JSON.

---

## Walkthrough 2 — Production is unchanged (US2 / SC-002 / DC-3)

1. Configure `environment: 'production'` + `DevConsoleTransport()` (simulating misuse) and a console
   spy.
2. Emit events.
3. **Expect**: each call is exactly `console[level](event.message, event)` — identical to
   `ConsoleTransport`; **no** `console.groupCollapsed` call (pretty path not taken).

✅ Pass: non-development output (and cost) is the current structured form; the pretty path never runs in
prod even if the dev transport is mistakenly used.

---

## Walkthrough 3 — Graceful degradation (US3 / SC-004 / DC-4, DC-7)

1. In `development`, with `console.groupCollapsed` unavailable (delete/stub it), emit an event.
2. **Expect**: falls back to `console[level](event.message, event)`; **0** throws.
3. With a console method that throws (or a throwing `traceUrl`), emit again → swallowed; no throw to the
   page.

✅ Pass: the renderer never throws and always produces output.

---

## Walkthrough 4 — Structured-only / redaction preserved (US3 / SC-003 / DC-5, DC-8)

1. In `development`, emit an event whose (already-redacted) data carries a known secret fixture and a
   trace context.
2. **Expect**: the rendered output contains the secret **0** times unredacted (the renderer reads only
   the post-pipeline event); the trace link/ids are built only from `context.trace` (carry-only).

✅ Pass: pretty rendering adds no leakage; it presents the safe event.

---

## Walkthrough 5 — No globals / no ambient reads (US3 / SC-005 / DC-6)

1. Spy on `globalThis.addEventListener`; construct `DevConsoleTransport()` and emit events.
2. **Expect**: **0** global listeners attached; the renderer reads no `location`/`cookie`/`navigator`/
   ambient state — only the event.

✅ Pass: a pure presentation transport, side-effect-free to construct.

---

## Walkthrough 6 — Distributed surface stays honest (Principle XI / Feature 012 / DC-10)

1. `npm run build && npm run surface:check`.
2. **Expect**: PASS — `./dev-console` is in the documented public-subpath set and ships
   `dist/dev-console.{d.ts,mjs,cjs}`; `dist/dev-console.*` is vendor-neutral; the default `.` entry's
   bundle-invariance budget is **unaffected** (`ConsoleTransport` unchanged).

✅ Pass: the 6th subpath is documented and shipped consistently; the default bundle is untouched.
