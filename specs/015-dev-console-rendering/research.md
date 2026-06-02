# Phase 0 Research: Developer-Friendly Dev-Mode Console Rendering

All Technical Context decisions are resolved below. (The delivery-mechanism decision — a dedicated
opt-in subpath, Option B — was settled with the user during specification; R1 records it.)

## R1. Delivery: a dedicated opt-in `./dev-console` subpath (Option B)

**Decision**: Ship `DevConsoleTransport` from a new `./dev-console` subpath; the consumer selects it
only in development: `transports: [import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport()]`.

**Rationale**: Only a subpath delivers **genuine zero production cost** — the consumer's bundler
dead-code-eliminates the dev branch from their production build (zero bytes, zero runtime). An
in-`ConsoleTransport` mode or a `pretty` option entangles the renderer with the production transport,
so it cannot be tree-shaken from the consumer's prod bundle and would also count against SafeSignal's
default-entry ±1 KiB gzip budget. The subpath keeps the default `.` entry byte-unchanged, matches the
package's subpath-for-everything pattern (transports, `./testing`, `./capture`), and reuses the
Feature 012 parity gate. Cost: one dev-only conditional import, documented in the README.

**Alternatives considered**: in-`ConsoleTransport` auto dev mode (best DX, but no consumer-side
tree-shaking → fails "zero production cost", busts the default budget); a `pretty` option (same byte
cost). Both rejected.

## R2. Naming: `./dev-console` → `DevConsoleTransport` (a `TransportFactory`)

**Decision**: Subpath `./dev-console`; export `DevConsoleTransport: TransportFactory` (PascalCase,
mirroring the core `ConsoleTransport`) plus `DevConsoleTransportOptions`. tsup entry key `'dev-console'`
→ `dist/dev-console.{mjs,cjs,d.ts}`; source `src/dev-console/index.ts`.

**Rationale**: `DevConsoleTransport` reads as the dev sibling of `ConsoleTransport` and is a drop-in
`Transport` for `configureLogging({ transports: [...] })`. The `./dev-console` filename matches the
subpath, consistent with the existing transport subpaths.

**Alternatives considered**: `./console-dev`, `./transport-console-pretty`, `createDevConsoleTransport`
(the `create*` form used by the beacon/otlp factories) — rejected; `DevConsoleTransport` pairs more
clearly with `ConsoleTransport`.

## R3. Dev gating: runtime, on `event.context.environment` (defensive)

**Decision**: `send(event)` renders pretty **iff** `event.context.environment === 'development'` **and**
rich console features are available; otherwise it behaves exactly like `ConsoleTransport`
(`console[level](event.message, event)`).

**Rationale**: Dev-vs-prod **must** be a runtime decision (the consumer's configured environment on the
event), not SafeSignal's build-time `__DEV__` — the package is built once by SafeSignal's CI, so a
`__DEV__`-gated renderer would be stripped from the shipped artifact and consumers would never get dev
rendering (FR-003). The environment check is also a **defensive safety net**: if a consumer
accidentally uses `DevConsoleTransport` in production, a non-`development` environment short-circuits to
the structured form (FR-002/FR-007) — pretty never runs in prod even on misuse.

**Alternatives considered**: pretty-always (the consumer opted in) — rejected; the environment gate is
a cheap, defensive guarantee that honors FR-002/FR-007 regardless of misuse.

## R4. Rendering: a collapsed group per entry; `%c` styling; carry-only trace link

**Decision**: For a dev event with rich console support:
- `console.groupCollapsed('%c<icon> <LEVEL>%c <message>', headerStyle, '', dim, contextSummary)` — the
  header carries a level icon + color and a dim `app · module · env` summary.
- Inside the group: `console.log` the **attributes** object (the sanitized, bounded event attributes —
  not a re-serialized app object); the **error** (name/message and the stack string) when present; and
  a **trace link** when `context.trace` is present.
- `console.groupEnd()`.
Level styling: `debug` (gray) / `info` (blue) / `warn` (amber) / `error` (red), each with an icon.

**Rationale**: `console.groupCollapsed` collapses noise while keeping detail one click away; `%c` is the
standard devtools styling primitive and is a **safe no-op in Node** (Node's formatter consumes `%c` and
discards the CSS arg, printing plain text), so the same code path is harmless off-browser. Logging the
attributes **object** (already sanitizer-bounded and redacted) preserves devtools' interactive
inspection without re-serializing arbitrary app state (Principle IV).

**Alternatives considered**: a single multi-line string (loses devtools object interactivity);
`console.table` (rigid for nested attributes) — rejected for the grouped-object approach.

## R5. Trace link: optional `traceUrl` formatter; identifiable ids otherwise

**Decision**: `DevConsoleTransportOptions.traceUrl?: (trace: { traceId: string; spanId: string }) =>
string`. When provided, render the returned URL string (devtools auto-linkifies URLs → **clickable**).
When absent, render the `traceId` / `spanId` prominently (identifiable, selectable). Built **only** from
the event's existing `context.trace` — carry-only, no ids minted.

**Rationale**: A truly clickable link needs the consumer's trace-backend URL, which only the consumer
has; the `traceUrl` option lets them format it (e.g. `https://trace.example/${traceId}`), and devtools
makes any URL clickable. Without it, the ids are still identifiable. Carry-only respects Principle IV /
the trace-context contract (Features 008/009).

## R6. Console safety / graceful degradation

**Decision**: Use grouping only when `typeof console.groupCollapsed === 'function'` (and `group`/
`groupEnd`); otherwise fall back to `console[level](event.message, event)` — the current
`ConsoleTransport` behavior. Resolve `console[level]` defensively (fall back to `console.log`), mirroring
the existing transport. Wrap the whole `send` body in `try/catch` so the renderer can never throw into
the page (Principle III), in addition to the `SafeTransport` wrapper the runtime already applies.

**Rationale**: Rich console features aren't universal (Node/SSR/minimal). Falling back to the proven
structured form keeps the transport safe everywhere and never breaks the page (FR-006).

## R7. Structured-only / secure-by-default

**Decision**: The renderer consumes **only** the post-pipeline `LogEvent` (already sanitized, redacted,
URL-scrubbed, control-char-guarded, bounded). It logs the event's own fields (message, attributes,
error, trace, context) and **never** re-serializes arbitrary application objects or reads ambient state.

**Rationale**: The event reaching a transport is safe by construction (Feature 001's pipeline). Rendering
it — even prettily — carries no new leakage; this satisfies Principle IV/V and FR-004/FR-005. A security
test asserts a secret in the (already-redacted) event does not appear unredacted and that only the event
is read.

## R8. Bundle / subpath wiring + non-regression

**Decision**: Add `'dev-console': 'src/dev-console/index.ts'` to `tsup.config.ts` and a `"./dev-console"`
triple to `package.json` `exports`. Add `'./dev-console'` to the Feature 012 parity `PUBLIC_SUBPATHS`,
to `dependency-pins.test.ts` (exports-keys + the per-entry triple), and to the `transport-beacon`
TB-12 keys assertion. The core `ConsoleTransport` / `src/transport/**` is **not** modified, so the
default-entry bundle is byte-unchanged → bundle-invariance stays green. A bundle-shape test asserts
`dist/dev-console.*` is vendor-neutral.

**Rationale**: Keeps the distributed surface honest (Principle XI / Feature 012) and the default entry's
±1 KiB budget untouched; matches the established subpath wiring.

## Resolved decisions summary

| Topic | Resolution |
|-------|------------|
| Delivery mechanism | Dedicated opt-in `./dev-console` subpath (Option B) — genuine zero prod cost (R1) |
| Naming | `./dev-console` → `DevConsoleTransport` (TransportFactory) + options (R2) |
| Dev gating | Runtime `event.context.environment === 'development'`, defensive fallback (R3) |
| Rendering | Collapsed group + `%c` level styling + grouped attributes/error/trace (R4) |
| Trace link | Optional `traceUrl` formatter → clickable URL; else identifiable ids; carry-only (R5) |
| Degradation | Fall back to structured form without `console.group`; try/catch fail-safe (R6) |
| Structured-only/secure | Renders only the post-pipeline redacted event; no re-serialization (R7) |
| Bundle/subpath | New entry + exports; reconcile 012 parity + dependency-pins + TB-12; default entry untouched (R8) |
