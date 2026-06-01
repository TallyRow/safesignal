# Tasks: Catch the Silent Errors — Opt-in `./capture`

**Input**: Design documents from `/specs/013-global-error-capture/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/capture-api.md ✅, quickstart.md ✅

**Tests**: REQUIRED (runtime feature touching browser-safety, redaction, and a new public subpath).
Contract / integration / failure-safety / security / boundary tests are written before/with the code
they cover.

**Organization**: Tasks are grouped by user story (from spec.md) so each is an independently testable
increment. Constitution: **v1.5.0** (this branch is rebased onto the merged G1 amendment).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- Exact file paths are included in each task

## Path notes

New runtime module at `src/capture/index.ts` (the only `src/` file added — it imports `Logger`
**type-only** from `../api/types.js`). Build wiring in `tsup.config.ts` + `package.json`. Tests under
`tests/{contract,integration,security}/`. The new `./capture` subpath is reconciled with Feature 012's
parity gate. No change to the core, the pipeline, or the transports.

---

## Phase 1: Setup

- [X] T001 [P] Create `src/capture/index.ts` scaffold: the public `GlobalErrorCaptureOptions` (`target?`, `onInternalError?`) and `GlobalErrorCaptureDisposer` types and the `installGlobalErrorCapture(logger: Logger, options?): GlobalErrorCaptureDisposer` signature, with a **type-only** `import type { Logger } from '../api/types.js'`. Compiles cleanly (behavior filled in US1). Per `contracts/capture-api.md`.
- [X] T002 Add the `./capture` build wiring: `capture: 'src/capture/index.ts'` to `tsup.config.ts` `entry`, and the `"./capture": { types/import/require → ./dist/capture.* }` triple to `package.json` `exports`. `npm run build` emits `dist/capture.{mjs,cjs,d.ts}`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reconcile the new 5th subpath with the distributed-surface gate so build + tests are green
before any story work. **⚠️ Adding `./capture` to `exports` without this makes the Feature-012 parity
gate and `dependency-pins` fail.**

- [X] T003 Reconcile the distributed surface for `./capture`: add `'./capture'` to `PUBLIC_SUBPATHS` in `tests/contract/distributed-surface.contract.test.ts`, and to the exports-keys assertion **and** the per-entry triple `it.each` in `tests/contract/dependency-pins.test.ts`. Run `npm run build && npm run surface:check && npm test -- tests/contract/dependency-pins.test.ts` → green.

**Checkpoint**: `./capture` ships and the distributed surface stays honest — story work can begin.

---

## Phase 3: User Story 1 — A host makes silent errors visible (Priority: P1) 🎯 MVP

**Goal**: With capture installed over a host `Logger`, uncaught exceptions and unhandled rejections are
delivered to the configured transports as redacted `error`-level events.

**Independent Test**: Install capture on a caller-supplied target with a capturing transport; dispatch
synthetic `error` + `unhandledrejection` events → both arrive redacted and attributed (quickstart W1/W2).

### Tests for User Story 1 ⚠️ (write first)

- [X] T004 [P] [US1] Contract test `tests/contract/capture.contract.test.ts` (CAP-1/CAP-2/CAP-8/CAP-10): install `installGlobalErrorCapture(logger, { target })` with a capturing transport; dispatch a synthetic `error` event → one `error`-level event `message: 'Uncaught exception'` with `error` populated + source attributes (`safesignal.source`/`safesignal.errorType: 'uncaught-exception'`) + host identity; dispatch `unhandledrejection` → `'Unhandled promise rejection'` / `'unhandled-rejection'`. **CAP-10 (errors-only, FR-009)**: assert install registers listeners for **exactly** `error` + `unhandledrejection` on the target and **no** other event types (spy on `target.addEventListener`) — no view/route/network/web-vitals instrumentation.
- [X] T005 [P] [US1] Redaction security test `tests/security/capture-redaction.security.test.ts` (CAP-3): a known secret fixture embedded in the error message/stack does **not** reach the transport (fully redacted by the pipeline; fail-closed).

### Implementation for User Story 1

- [X] T006 [US1] Implement the core in `src/capture/index.ts`: attach `error` + `unhandledrejection` listeners on `options.target ?? globalThis` (via `addEventListener`); extract the error value (`event.error`, else synthesize from `message`/`filename`/`lineno`/`colno`; `event.reason` for rejections — per research R3); call `logger.error(message, sourceAttrs, errorValue)`; return a disposer that `removeEventListener`s both. Makes T004/T005 pass.

**Checkpoint**: US1 functional — previously-silent uncaught errors + rejections flow through the secure pipeline.

---

## Phase 4: User Story 2 — Capture never breaks the page and never clobbers handlers (Priority: P2)

**Goal**: The capturer is fail-safe (never throws into the page), additive (chains existing handlers),
loop-safe, and cleanly disposable.

**Independent Test**: With a throwing transport + a pre-existing handler, dispatch an error → the
pre-existing handler still fires, nothing propagates to the page, no loop; the disposer stops capture
(quickstart W3/W4/W7).

### Tests for User Story 2 ⚠️

- [X] T007 [P] [US2] Failure-safety integration test `tests/integration/capture.integration.test.ts` (CAP-4/5/6/7/9/11): transport `send` throws → swallowed → `options.onInternalError` invoked, no exception to the page (CAP-4); an error raised during emit does not recurse (CAP-5); a pre-existing listener on the target still fires and the capturer never assigns `window.onerror`/calls `preventDefault` (CAP-6); the disposer removes both listeners and is idempotent (CAP-7); install with a target lacking `addEventListener` returns a no-op disposer, never throws (CAP-9); **unconfigured-runtime edge (FR-011)**: install over `getRootLogger()` with **no** prior `configureLogging()` call and dispatch an `error` → no throw (the default `Noop` runtime absorbs it).

### Implementation for User Story 2

- [X] T008 [US2] Harden `src/capture/index.ts`: wrap each handler body in `try/catch` and swallow internal failures (route to `options.onInternalError`, itself called fail-safe — mirror `safeNotify`); add a module-scoped **in-flight re-entrancy guard** (loop-safe); make the disposer idempotent (a `disposed` flag); and make install a **safe no-op** when the resolved target has no `addEventListener`. Makes T007 pass.

**Checkpoint**: US1 + US2 — capture is safe and additive; it cannot destabilize the page.

---

## Phase 5: User Story 3 — Federation-owned: host installs, modules never do (Priority: P3)

**Goal**: Capture is host-only/opt-in, never a `createLogger` side effect; the boundary is mechanically
enforced (the G1 remediation); the bundle is vendor-neutral and isolated.

**Independent Test**: Spy on `addEventListener` → `createLogger`/`configureLogging` attach none; the
source scan passes; `dist/capture.*` is vendor-neutral (quickstart W5/W6).

### Tests for User Story 3 ⚠️

- [X] T009 [P] [US3] Boundary test `tests/contract/global-listener-boundary.test.ts` — **the G1-filed remediation (Principle X, deadline 2026-09-01)**: (a) spying on `addEventListener`, `configureLogging(...)` + `createLogger(...)` attach **zero** global `error`/`unhandledrejection` listeners (SC-007); (b) a source scan asserts **only** `src/capture/**` references `addEventListener('error'|'unhandledrejection')` or `window.onerror`/`onunhandledrejection` (no other `src/` module), mirroring `tests/contract/internal-import-boundary.test.ts`.
- [X] T010 [P] [US3] Bundle-shape security test `tests/security/capture-bundle-shape.security.test.ts`: `dist/capture.{mjs,cjs,d.ts}` contain no vendor package names/identifiers (@opentelemetry, etc.) and do not re-export core internals beyond the type-only `Logger` surface (vendor-neutral + isolated, Principle XI).

### Implementation for User Story 3

- [X] T011 [US3] Update `README.md`: (a) add a "Catch uncaught errors — `./capture` subpath" section showing `installGlobalErrorCapture(getRootLogger())` (host installs once, opt-in, returns a disposer, routed through the secure pipeline) and a federation note — **modules never install**; the install is the host-level global integration Principle VIII v1.5.0 sanctions; duplicate package copies are **isolated** (FR-008). (b) **Reconcile the existing wording** (Feature 014 left capture as forward-looking): update the "What this package does NOT do" entry so it reflects that explicit opt-in `./capture` now **ships** (the core still installs no globals; the host opt-in subpath does); and update the **Roadmap** "RUM features — automatic error capture" line to **distinguish** the shipped explicit `./capture` (host-installed, opt-in) from the still-future RUM `./rum-*` *automatic* capture — so the README does not simultaneously call capture forward-looking and document it as shipped (D1; relates to #19/C1).

**Checkpoint**: All three stories functional; the host-only boundary is enforced and documented.

---

## Phase 6: Polish & Validation

- [X] T012 Full build + suite + gates: `npm run build && npm test && npm run typecheck && npm run lint && npm run surface:check` all green; confirm `dist/capture.*` ships and the parity gate passes with the new subpath.
- [X] T013 [P] Security & privacy validation (Principle V): captured stacks/messages/reasons are redacted before any transport (CAP-3); the capturer reads **no** ambient page/browser state and adds no new sensitive source; the source attributes are `safesignal.*`-namespaced. Confirm no new leak path.
- [X] T014 [P] Lightweight-`Logger` & federated validation (Principle VIII): creating many loggers attaches **no** global listeners and incurs no per-instance cost; capture is host-level (not per-`Logger`); duplicate-package-copy behavior is **isolated** (each capturer uses the `Logger` from its own copy). 
- [X] T015 Run `quickstart.md` Walkthroughs 1–7 and confirm each acceptance criterion (CAP-1..CAP-10, SC-001..SC-007); record results in the PR.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: T001 (scaffold) → T002 (build wiring needs the file).
- **Foundational (Phase 2)**: T003 needs T002 (the `./capture` exports entry) — **blocks all stories** (build + parity must be green).
- **User Stories**: US1 (T004–T006) first — defines `src/capture/index.ts`'s core. US2 (T007–T008) hardens the **same file** (sequential on it). US3 (T009–T011) needs the built capture (T006/T008 + T002) for its tests; T011 (docs) is independent.
- **Polish (Phase 6)**: after the stories.

### Within each story

- Tests (T004/T005, T007, T009/T010) are written to FAIL before/with their implementation.
- `src/capture/index.ts` is built up sequentially: T001 scaffold → T006 core (US1) → T008 hardening (US2). These are **not** mutually `[P]` (same file).

### Parallel opportunities

- T001 (scaffold) is `[P]`.
- US1 tests T004 + T005 are `[P]` (different files); US3 tests T009 + T010 are `[P]`.
- T011 (README) runs parallel to US3 test work; Polish T013 + T014 are `[P]`.

---

## Implementation Strategy

### MVP first (User Story 1)

1. Setup (T001–T002) → Foundational (T003: subpath reconciled, parity green).
2. US1 (T004–T006): capture routes uncaught errors + rejections through the pipeline, redacted.
3. **STOP and VALIDATE**: install over a host `Logger`, dispatch synthetic events → redacted error
   events at the transport. This alone is the marquee visible value.

### Incremental delivery

1. Setup + Foundational → `./capture` ships, surface honest.
2. US1 → silent errors become visible (MVP).
3. US2 → fail-safe / additive / loop-safe / disposable.
4. US3 → host-only enforced (G1 remediation) + vendor-neutral bundle + docs.
5. Polish → full gates + the constitution validation passes + quickstart.

---

## Notes

- **No new dependency**; `src/capture/` imports `Logger` **type-only** (no runtime-state sharing across
  bundles — the design's key decision, see plan Complexity Tracking).
- The new `./capture` subpath **must** be reconciled with Feature 012's parity gate (T003) or CI fails.
- T009 is the **named, time-bound G1 remediation** (deadline 2026-09-01) and must ship with this subpath.
- Commit after each task or logical group; the whole feature lands via one PR gated by `ci-success`.
