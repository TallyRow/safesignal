# Phase 0 Research: Catch the Silent Errors — Opt-in `./capture`

All Technical Context unknowns are resolved below.

## R1. The public entrypoint takes a `Logger`, not the raw runtime

**Decision**: `installGlobalErrorCapture(logger: Logger, options?: GlobalErrorCaptureOptions): () => void`.
The host passes a `Logger` it already owns (`getRootLogger()` or `createLogger({ module })`); the
capturer emits each captured error via `logger.error(message, sourceAttrs, errorValue)`.

**Rationale**:
- **Fail-closed for free.** `Logger.error(message, attributes?, error?)` routes through the existing
  dispatch pipeline (sanitize → URL-scrub → redact → control-char-guard → SafeTransport). Reusing it
  means captured stacks/messages/reasons are sanitized + redacted (drop-on-failure) by the **same**
  path as normal logs — no parallel emission to audit (FR-002/FR-004, Principle V).
- **Crosses the bundle boundary safely.** `./capture` builds as its **own** tsup bundle. The active
  runtime lives in a **module-scoped slot** (`src/runtime/runtime-ref.ts`) that tsup inlines into each
  bundle separately — so a capture bundle that read the slot directly would see a *different*,
  unconfigured runtime than the host configured via the core entry. A `Logger` (created from the core
  entry) already closes over the correct runtime, so emitting through it is correct regardless of how
  many bundles load. The `./capture` source therefore imports **type-only** from `../api/types.js`
  (the same discipline the transports use), sharing no runtime state.
- **Host identity + level filtering inherited.** `logger.error` builds the event with the runtime's
  configured application/module/environment identity and the `error` level (always within the
  production baseline), so captured events are attributed and delivered under production defaults
  (FR-010).

**Alternatives considered**:
- **`installGlobalErrorCapture(runtime)` reading the module-scoped slot** — rejected: a separate bundle
  binds to a different slot (the core's runtime is invisible to it). This is the decisive reason.
- **A runtime singleton on `globalThis`/`Symbol.for`** — rejected: Principle VIII forbids copy-local
  globals / a `globalThis` registry; it would also break duplicate-copy **isolation**.
- **A new internal emit API exported for capture** — rejected: duplicates `logger.error`, adds surface,
  and would still need the runtime across the bundle boundary.

## R2. Listener mechanism — additive, never clobbering

**Decision**: Attach via `target.addEventListener('error', h)` and
`target.addEventListener('unhandledrejection', h)` on `options.target ?? globalThis`. The disposer
calls `removeEventListener` for both. **Never** assign `window.onerror` / `onunhandledrejection`, and
**never** call `event.preventDefault()` / `event.stopPropagation()`.

**Rationale**: `addEventListener` is purely additive — any handler the host already registered (its
own `window.onerror`, a framework's listener) keeps firing (FR-006, SC-005). Not calling
`preventDefault` preserves the browser's default error reporting. This is exactly the host-level
install Principle VIII v1.5.0 sanctions, and the constitution's per-`Logger` ban on these globals
remains untouched (capture is not per-`Logger`).

**Alternatives considered**: assigning `window.onerror` — rejected (clobbers any existing handler).

## R3. Error extraction

**Decision**:
- `error` event (`ErrorEvent`): prefer `event.error`; if absent (some cross-origin/script-error cases),
  synthesize a minimal value from `event.message` (+ `filename`/`lineno`/`colno` as attributes).
- `unhandledrejection` event (`PromiseRejectionEvent`): use `event.reason`.
- Pass the raw value as `logger.error`'s `error?: unknown` arg; the pipeline's `reduceError` already
  handles `Error` (→ `{name, message, stack}`) vs non-`Error` (→ `{name:'NonError', message:String(v)}`).

**Rationale**: Reuses the existing, tested error-reduction; covers thrown non-`Error` values and
reason-less rejections without new serialization code (FR edge cases).

## R4. Fail-safe + loop-safe

**Decision**: Each handler body runs inside `try/catch`; on any internal throw, swallow and (if
provided) call `options.onInternalError(err)` wrapped so it too cannot throw (mirroring `safeNotify`).
A module-scoped **re-entrancy guard** (a boolean set around the `logger.error` call) drops a capture
that fires while one is already in flight, preventing an emit-time error from looping.

**Rationale**: Principle III — no internal path may propagate into the page; a transport/redactor
failure during capture must not crash or loop (FR-005/FR-012, SC-004). The guard is constant-cost.

**Alternatives considered**: unbounded recursion protection via depth counters — rejected; a single
in-flight flag is sufficient and simpler.

## R5. Source attribution

**Decision**: Emit with a fixed message and a source marker:
- message: `"Uncaught exception"` / `"Unhandled promise rejection"`.
- attributes: `{ 'safesignal.source': 'global-error-capture', 'safesignal.errorType':
  'uncaught-exception' | 'unhandled-rejection' }` (plus `filename`/`lineno`/`colno` when synthesized).

**Rationale**: Stable, machine-parseable, lets downstream separate captured uncaught errors from
explicitly-logged ones (FR-010, SC-002/Principle VII). The keys are namespaced to avoid collision with
consumer attributes. Message text customization is a future option; V1 fixes the defaults.

**Alternatives considered**: encoding source in the message string — rejected (values belong in
structured attributes, per the package's own DO/DON'T guidance).

## R6. Bundle / subpath wiring + vendor-neutrality

**Decision**: Add `capture: 'src/capture/index.ts'` to `tsup.config.ts` and a `"./capture"` triple to
`package.json` `exports` (→ `dist/capture.{d.ts,mjs,cjs}`). Add `'./capture'` to the **Feature 012**
parity `PUBLIC_SUBPATHS` and to `dependency-pins.test.ts`'s exports-keys assertion + triple `it.each`.
A bundle-shape security test asserts `dist/capture.*` is vendor-neutral and does not pull the core's
internals beyond the type-only `Logger` surface.

**Rationale**: Keeps the distributed surface honest (Principle XI / Feature 012 gate) and matches the
established subpath pattern (transports). No new dependency enters the build.

## R7. Enforcement of the host-only boundary (G1 remediation, deadline 2026-09-01)

**Decision**: Add `tests/contract/global-listener-boundary.test.ts` proving: (a) creating a logger /
loading the core attaches **no** global `error`/`unhandledrejection` listeners (SC-007); and (b) a
source scan that **only** `src/capture/**` references `addEventListener('error'|'unhandledrejection')`
or `window.onerror`/`onunhandledrejection` — no other `src/` module may (mirroring
`internal-import-boundary.test.ts`'s scan approach).

**Rationale**: This is the named, time-bound remediation Feature 014 (G1) filed for Principle X; it
lands here, with the `./capture` subpath, satisfying "no release ships `./capture` without it."

## R8. Deterministic test environment

**Decision**: Tests pass a **caller-supplied `EventTarget`** via `options.target` (a plain
`EventTarget` or a small stub) and `dispatchEvent` synthetic `error`/`unhandledrejection` events, with
a capturing transport configured on the runtime to observe the emitted `LogEvent`. The default
`globalThis` target is exercised by one happy-dom integration check.

**Rationale**: Removes any dependence on happy-dom's `ErrorEvent`/`PromiseRejectionEvent` fidelity,
making the suite deterministic and identical local/CI (Principle IX), while still covering the real
global-target path once.

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| API shape / what it receives | `installGlobalErrorCapture(logger, options?) → disposer`; takes a `Logger`, not the raw runtime (R1) |
| Emit path | Reuse `logger.error` → existing fail-closed pipeline; no parallel path (R1) |
| Listener mechanism | `addEventListener` (additive, never `onerror`/`preventDefault`); disposer removes (R2) |
| Error extraction | `event.error` / synthesized / `event.reason` → `reduceError` (R3) |
| Fail-safe + loop-safe | try/catch + swallow + in-flight re-entrancy guard (R4) |
| Source marker | fixed message + `safesignal.source`/`safesignal.errorType` attributes (R5) |
| Subpath/bundle | 5th tsup entry + `./capture` exports; reconcile 012 parity + dependency-pins; vendor-neutral (R6) |
| Host-only enforcement | boundary test (G1 remediation, 2026-09-01) — no per-`Logger`/module globals (R7) |
| Test determinism | caller-supplied `EventTarget` + synthetic events; one real-global check (R8) |
