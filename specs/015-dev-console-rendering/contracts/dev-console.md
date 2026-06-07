# Contract: `./dev-console` — developer-friendly console rendering

**Subpath**: `@tallyrow/safesignal/dev-console` (opt-in, development).
**Enforcement of**: Principle IV (structured-only), V (secure-by-default), VIII (no globals/ambient),
III (fail-safe), XI (honest distributed surface). Source of truth for the public API + behavior the
implementation and contract tests must satisfy.

## API

```ts
import type { Transport } from '@tallyrow/safesignal'; // shape only

export interface DevConsoleTransportOptions {
  /** Transport.name for diagnostics. Default 'dev-console'. */
  name?: string;
  /** Format a clickable trace URL from the event's existing trace ids. */
  traceUrl?: (trace: { traceId: string; spanId: string }) => string;
  /** Force `%c` styling on/off. Default: auto (on when grouping is supported). */
  colors?: boolean;
}

/**
 * A pretty, dev-only console transport. Use in development:
 *   transports: [ import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport() ]
 * In a non-development environment (or without rich console support) it behaves
 * exactly like the built-in ConsoleTransport. Never throws.
 */
export const DevConsoleTransport: (options?: DevConsoleTransportOptions) => Transport;
// Assignable to `TransportFactory` (`() => Transport`) in `configureLogging({ transports })`.
```

## Behavioral guarantees (each is a test)

| # | Guarantee | Maps to |
|---|-----------|---------|
| **DC-1** | In `environment: 'development'` with rich console support, `send(event)` renders a **collapsed group** with a level icon/color header (message + `app · module · env` summary). | FR-001 / SC-001 |
| **DC-2** | The group renders the **attributes** (the sanitized object), the **error** (name/message + stack) when present, and a **trace link** when `context.trace` is present — each section omitted when empty. | FR-001 / SC-001 |
| **DC-3** | In a **non-development** environment, `send` behaves exactly like `ConsoleTransport` — `console[level](event.message, event)` — and the pretty path does **not** run. | FR-002 / FR-007 / SC-002 |
| **DC-4** | **Graceful degradation**: when `console.groupCollapsed` (or styling) is unavailable, `send` falls back to the structured form and never throws. | FR-006 / SC-004 |
| **DC-5** | **Structured-only / secure**: the renderer reads **only** the post-pipeline event; it does not re-serialize arbitrary app objects; a secret in the (already-redacted) event appears **0** times unredacted. | FR-004 / SC-003 |
| **DC-6** | **No globals / no ambient**: `send` attaches no listeners and reads no ambient browser/host state; constructing the transport is side-effect-free. | FR-005 / SC-005 |
| **DC-7** | **Fail-safe**: a throwing console method (or a throwing `traceUrl`) is swallowed; `send` never throws into the page. | FR-006 / SC-004 |
| **DC-8** | **Trace link carry-only**: the link/ids are built only from the event's existing `context.trace`; no ids are minted; no secret exposed. | FR-009 |
| **DC-9** | **Integrity**: `send` does not drop/reorder/dedupe/mutate the event and does not change what other transports receive. | Principle VII |
| **DC-10** | **Default entry unchanged**: `ConsoleTransport` / `src/transport/**` is not modified; the default `.` bundle is byte-unchanged. | FR-008 / SC-006 |

## Distributed surface (Principle XI / Feature 012)

Adding `./dev-console` updates the documented public-subpath set: `'./dev-console'` is added to
`tests/contract/distributed-surface.contract.test.ts` `PUBLIC_SUBPATHS`, to
`tests/contract/dependency-pins.test.ts` (exports-keys assertion + the per-entry triple), and to the
`transport-beacon` TB-12 keys assertion. The `./dev-console` bundle MUST be vendor-neutral (asserted by
`tests/security/dev-console-bundle-shape.security.test.ts`). The default `.` entry's bundle-invariance
budget is unaffected (the renderer lives only in the new subpath).

## Rendering reference (non-normative)

```text
▸ ℹ️ INFO  checkout opened            checkout-web · cart-module · development
    { cartItems: 3 }
    ↳ trace  https://trace.example/4bf92f3577b34da6a3ce929d0e0e4736   (or the raw ids)

▸ ⛔ ERROR payment processor 5xx      payments · — · development
    { orderId: 'ord_9f3' }
    Error: upstream timeout
        at …
```
Icons/colors per level (debug gray / info blue / warn amber / error red); `%c` styling is a no-op in
Node (plain text). Exact glyphs/colors are an implementation detail; the *structure* above is the
contract.
