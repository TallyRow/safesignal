# Implementation Plan: Developer-Friendly Dev-Mode Console Rendering

**Branch**: `015-dev-console-rendering` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-dev-console-rendering/spec.md`

## Summary

Ship roadmap V2: a **dedicated opt-in `./dev-console` subpath** exporting `DevConsoleTransport` — a
pretty-rendering alternative to the built-in `ConsoleTransport` for **development**. It renders the
**already post-pipeline (sanitized + redacted + bounded)** `LogEvent` beautifully in devtools — a
collapsed group per entry with a level icon/color, the message, a context summary (app/module/env),
the attributes laid out readably, the error name/message + stack, and a trace link when a trace
context is present. **Production is untouched and pays genuinely zero cost**: the consumer selects the
dev transport only in development (`import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport()`),
so their bundler dead-code-eliminates it from the production build — and SafeSignal's default `.`
entry (and its ±1 KiB gzip budget) is **byte-unchanged**. The renderer reuses the existing safe event
(no re-serialization of app objects), attaches no globals / reads no ambient state (Principle VIII),
fails safe (never throws), and degrades to the current structured form where rich console features are
absent. The new subpath is reconciled with Feature 012's distributed-surface parity gate.

## Technical Context

**Language/Version**: TypeScript 5.4+, browser-first ESM (the existing `src/` stack).

**Primary Dependencies**: **No new dependency.** Uses only the platform `console` and the
post-pipeline `LogEvent`. The `./dev-console` source imports **type-only** from `../api/types.js`
(`Transport`, `LogEvent`, `TransportFactory`) — the established subpath pattern (like the transports).

**Storage**: N/A.

**Testing**: Vitest contract + security + failure-safety tests that install a **console spy** (capture
`console.groupCollapsed`/`group`/`log`/level methods) and assert the rendered calls for dev vs
non-dev environments, redaction/structured-only, graceful degradation, and no-globals. Acceptance by
`quickstart.md`.

**Target Platform**: Browser devtools (rich rendering via `console.groupCollapsed` + `%c` styling);
Node/SSR/minimal consoles get the structured fallback. Never throws.

**Project Type**: Reusable browser package — additive **runtime** code via a new opt-in subpath.

**Performance Goals**: Per-event dev cost is a few `console.*` calls. **Zero production cost**: the
subpath is not in the consumer's production bundle (tree-shaken), and even if loaded, a non-development
`environment` short-circuits to the structured fallback.

**Constraints**: Default `.` entry and its gzip budget **unchanged** (the renderer lives only in
`./dev-console`); renders **only** the bounded post-pipeline event (structured-only — Principle IV/V);
**no** global listeners / ambient reads (Principle VIII); fail-safe (Principle III); trace links
carry-only (no ids minted); no new dependency; the new subpath keeps the distributed surface honest
(Feature 012). Dev-vs-non-dev is a **runtime** decision (`event.context.environment`), never
SafeSignal's build-time `__DEV__` (which would be stripped from the shipped artifact).

**Scale/Scope**: 1 new `src/dev-console/` module (+ a small renderer + options type), 1 tsup entry, 1
`exports` subpath, the 012 parity + `dependency-pins` + `transport-beacon` TB-12 exports
reconciliation, and contract/security/failure tests. The core `ConsoleTransport` is **not** modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> **Constitution version**: in-tree **v1.5.0**.

- **Spec-Driven Development (I)** — ✅ Spec → this plan; Constitution Check precedes code.
- **Stable Consumer API & Deprecation (II)** — ✅ **Additive**: a new opt-in `./dev-console` subpath
  and export; the core `.` entry, `ConsoleTransport`, and production behavior are unchanged. The safe
  path stays easy — production uses the existing `ConsoleTransport`; dev is an explicit opt-in.
- **Browser Resilience & Failure Safety (III)** — ✅ The renderer is wrapped fail-safe (try/catch;
  never throws into the page; `SafeTransport` also wraps it) and degrades to the structured form where
  rich console features are unavailable. No internal path propagates into a consumer call site.
- **Framework-Neutral Structured Observability (IV)** — ✅ It renders the **already-structured,
  bounded** event; presentation only (`console.group`/`%c`), not a new wire format, and it does **not**
  re-serialize arbitrary application objects (the event is post-sanitizer). Levels/shape unchanged.
- **Secure & Privacy-Safe Logging by Default (V)** — ✅ Renders **only** the post-pipeline,
  already-redacted event; introduces no new sensitive source; trace links are built only from the
  event's existing trace ids (carry-only). No ambient reads.
- **Testable, Minimal, Maintainable (VI)** — ✅ **No new dependency**; one small self-contained
  subpath module reusing the `Transport`/`LogEvent` types. Tests held to `src/` standards.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Presentation only; it does **not** drop,
  reorder, dedupe, or mutate events, and does not change what other transports receive.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ **No** global listeners, **no** ambient
  reads — it operates solely on the event passed to `send()`. It is a transport (configured once at
  the runtime level), not per-`Logger`; creating loggers stays side-effect-free.
- **Reproducible Verification (IX)** — ✅ One `npm test`; deterministic via a console spy (no reliance
  on real devtools). The new subpath's bundle is verified like the others; the default entry's
  bundle-invariance is unaffected.
- **Mechanical Enforcement of Documented Contracts (X)** — ✅ The new subpath is added to the
  Feature 012 distributed-surface parity gate and the `dependency-pins` / `transport-beacon` exports
  checks (machine-enforced). No new documented gate is left unenforced; no existing gate is disabled.
- **Supply-Chain Integrity & Verifiable Provenance (XI)** — ✅ Adds one packaged subpath
  (`./dev-console`); the documented distributed surface + parity set are updated in lockstep. **No new
  dependency**; the subpath bundle is vendor-neutral (asserted by a bundle-shape test). Default `.`
  entry unchanged; attested publish, signed tags, DCO, pins intact.

**Result: PASS** (constitution v1.5.0; default entry untouched; Complexity Tracking records the one
design choice — subpath over in-transport — already settled in the spec).

## Project Structure

### Documentation (this feature)

```text
specs/015-dev-console-rendering/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── dev-console.md     # DevConsoleTransport API + options + rendering behavior (DC-1..DC-N)
└── checklists/requirements.md
```

### Source / repository files affected

```text
New runtime module (the feature):
└── src/dev-console/
    └── index.ts          # DevConsoleTransport (TransportFactory) + DevConsoleTransportOptions /
                          #   the renderer. Type-only import from ../api/types.js.

Build + packaging (the 6th subpath):
├── tsup.config.ts        # add entry: 'dev-console': 'src/dev-console/index.ts'
└── package.json          # add "./dev-console" exports triple (→ dist/dev-console.*)

Distributed-surface reconciliation (keep Feature 012 + the exports assertions green):
├── tests/contract/distributed-surface.contract.test.ts   # add './dev-console' to PUBLIC_SUBPATHS
├── tests/contract/dependency-pins.test.ts                 # add './dev-console' to keys + triple
└── tests/contract/transport-beacon.contract.test.ts       # TB-12 keys assertion += './dev-console'

Tests (REQUIRED — runtime feature):
├── tests/contract/dev-console.contract.test.ts            # dev pretty render vs non-dev structured;
│                                                          #   group/level/context/error/trace; options
├── tests/security/dev-console.security.test.ts            # renders only the redacted event; no
│                                                          #   re-serialization; trace-link carry-only
└── tests/security/dev-console-bundle-shape.security.test.ts  # dist/dev-console.* vendor-neutral

Preserved UNCHANGED (non-regression):
├── src/transport/console-transport.ts (the default ConsoleTransport)   # NOT modified
├── src/index.ts, the pipeline, all existing exports                    # additive only
└── dist/index.{mjs,cjs} — default-entry bundle byte-unchanged          # bundle-invariance green
```

**Structure Decision**: A new `src/dev-console/` subpath transport that consumes the post-pipeline
`LogEvent`, built as the 6th tsup entry. The core `ConsoleTransport` and the default entry are
untouched.

## Approach & sequencing

1. **`src/dev-console/` module** — `DevConsoleTransport(options?)` returns a `Transport` whose
   `send(event)`: if `event.context.environment === 'development'` **and** rich console features exist,
   render a collapsed group (level icon/color via `%c` → message + context summary; inside: attributes,
   error name/message/stack, trace link); else fall back to `console[level](event.message, event)`
   (the current structured form). Wrap fail-safe.
2. **Build + exports** — add the tsup entry + `./dev-console` exports triple; build emits
   `dist/dev-console.{mjs,cjs,d.ts}`.
3. **Distributed-surface reconciliation** — add `./dev-console` to the 012 parity `PUBLIC_SUBPATHS`,
   `dependency-pins` (keys + triple), and the `transport-beacon` TB-12 keys assertion;
   `npm run build && npm run surface:check` green; default-entry bundle-invariance unaffected.
4. **Tests** — contract (dev vs non-dev rendering; group/level/context/error/trace; options),
   security (only the redacted event rendered; no re-serialization; trace-link carry-only; vendor-
   neutral bundle), failure-safety (graceful degradation; never throws).
5. **Docs** — README `./dev-console` section (the `import.meta.env.DEV ? Dev() : Console()` pattern).

All edits land via one PR gated by the (now `./dev-console`-aware) `ci-success`.

## Complexity Tracking

> No Constitution Check violations. One design choice (already settled in the spec, recorded here for
> traceability): the dev renderer ships as a **dedicated opt-in subpath**, not inside `ConsoleTransport`
> or as an option on it.
>
> **Why:** only a subpath gives **genuine zero production cost** — the consumer's bundler tree-shakes
> the dev branch out of their production build (zero bytes, zero runtime). An in-`ConsoleTransport`
> mode or a `pretty` option would entangle the renderer with the production transport, so it could
> **not** be tree-shaken from the consumer's prod bundle (failing the feature's headline constraint),
> and would also count against SafeSignal's default-entry ±1 KiB gzip budget (likely forcing a
> documented bump). The subpath also matches the package's subpath-for-everything pattern and reuses
> the parity gate. The only cost is one dev-only conditional import in the consumer's setup —
> idiomatic for this audience and documented in the README.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
