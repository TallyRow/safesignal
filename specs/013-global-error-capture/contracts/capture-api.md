# Contract: `./capture` — global error capture API

**Subpath**: `@tallyrow/safesignal/capture` (opt-in, host-only).
**Enforcement of**: Principle VIII v1.5.0 (sanctioned explicit host-level global install),
Principle III (fail-safe), Principle V (fail-closed). Source of truth for the public API the
implementation and contract tests must satisfy.

## API

```ts
import type { Logger } from '@tallyrow/safesignal'; // shape only; not re-exported by ./capture

export interface GlobalErrorCaptureOptions {
  /** Where to attach listeners. Default: globalThis. */
  target?: EventTarget;
  /** Diagnostics hook for the capturer's OWN failures (invoked fail-safe). */
  onInternalError?: (err: Error) => void;
}

export type GlobalErrorCaptureDisposer = () => void;

/**
 * Install host-level capture of uncaught exceptions + unhandled promise
 * rejections, routed through `logger`'s configured pipeline. Returns a disposer.
 * Opt-in, host-owned; never a side effect of createLogger(). Never throws.
 */
export function installGlobalErrorCapture(
  logger: Logger,
  options?: GlobalErrorCaptureOptions,
): GlobalErrorCaptureDisposer;
```

## Behavioral guarantees (each is a test)

| # | Guarantee | Maps to |
|---|-----------|---------|
| **CAP-1** | After install, an **uncaught exception** (an `error` event on the target) emits exactly one `logger.error('Uncaught exception', { source markers }, errorValue)`, delivered to the configured transports. | FR-002 / SC-001 |
| **CAP-2** | After install, an **unhandled promise rejection** (`unhandledrejection` event) emits `logger.error('Unhandled promise rejection', { source markers }, event.reason)`. | FR-003 / SC-002 |
| **CAP-3** | **Fail-closed (no bypass)**: the emitted event passes the same sanitize → URL-scrub → redact → guard pipeline as any `logger.error`; a **whole-value** token in the error is masked, and a redactor failure **drops** the event. (Substring secrets in a free-text stack are not substring-scrubbed — a pipeline-wide property, not a capture bypass.) | FR-004 / SC-003 |
| **CAP-4** | **Fail-safe**: a throw inside the capturer (or the transport) does **not** propagate to the page; it is swallowed (routed to `options.onInternalError` if given). No `error`/rejection raised by emit re-enters page code. | FR-005 / SC-004 |
| **CAP-5** | **Loop-safe**: an error raised *during* a capture's own emit does not recursively re-capture (in-flight guard). | FR-012 / SC-004 |
| **CAP-6** | **Additive / non-clobbering**: installs via `addEventListener` and never assigns `window.onerror`/`onunhandledrejection` and never calls `preventDefault()`; a pre-existing handler on the target still fires. | FR-006 / SC-005 |
| **CAP-7** | **Disposer** removes both listeners; after dispose, no further capture; calling dispose again is a no-op. | FR-007 / SC-006 |
| **CAP-8** | **Well-formed + attributed**: emitted events are `error`-level, carry the host runtime's identity (via the `Logger`), and carry the source marker distinguishing uncaught-exception vs unhandled-rejection. | FR-010 |
| **CAP-9** | **Safe no-op**: when `target` has no `addEventListener` (SSR/worker), install returns a no-op disposer and never throws. | FR-011 (edge) |
| **CAP-10** | **Errors only**: the capturer attaches **only** `error` + `unhandledrejection` listeners — no view/route/network/web-vitals instrumentation. | FR-009 |
| **CAP-11** | **Unconfigured-runtime safe**: installing over a `Logger` whose runtime was never `configureLogging()`-ed routes captured errors to the default `Noop` runtime and never throws. | FR-011 |

## Source marker (emitted attributes)

```jsonc
{
  "safesignal.source": "global-error-capture",
  "safesignal.errorType": "uncaught-exception" | "unhandled-rejection"
  // for a synthesized error (no event.error): "filename", "lineno", "colno"
}
```
Keys are `safesignal.*`-namespaced to avoid collision with consumer attributes; they are sanitized +
redacted like any attribute.

## Host-only boundary (Principle VIII / X — the G1 remediation)

- `installGlobalErrorCapture` is the **only** sanctioned place in `src/` that attaches global
  `error`/`unhandledrejection` listeners. **Enforced** by `tests/contract/global-listener-boundary.test.ts`:
  - creating a logger / loading the core attaches **no** such listeners (SC-007);
  - a source scan asserts **only** `src/capture/**` references `addEventListener('error'|'unhandledrejection')`
    or `window.onerror`/`onunhandledrejection`.
- This test is the named, time-bound remediation Feature 014 (G1) filed (deadline **2026-09-01**) and
  MUST ship with this subpath.

## Distributed-surface (Principle XI / Feature 012)

Adding `./capture` updates the documented public-subpath set: `'./capture'` is added to
`tests/contract/distributed-surface.contract.test.ts` `PUBLIC_SUBPATHS` and to
`tests/contract/dependency-pins.test.ts` (exports-keys assertion + the per-entry triple). The
`./capture` bundle MUST be vendor-neutral (asserted by `tests/security/capture-bundle-shape.security.test.ts`).
