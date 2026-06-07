---
description: "Task list for Developer-Friendly Dev-Mode Console Rendering (./dev-console)"
---

# Tasks: Developer-Friendly Dev-Mode Console Rendering

**Input**: Design documents from `/specs/015-dev-console-rendering/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/dev-console.md ✅, quickstart.md ✅

**Tests**: REQUIRED (runtime feature touching public API, environment-sensitive behavior, redaction, and failure handling). Contract + security + failure-safety coverage via a `console` spy (deterministic; no real devtools).

**Organization**: Tasks grouped by user story. NOTE: all three stories are facets of the **same**
`src/dev-console/index.ts` transport, so their implementation tasks are sequential on that one file
(not `[P]` against each other); their **tests** are independent and `[P]`. The MVP (US1) is the pretty
renderer; US2 (production-unchanged) and US3 (safe/degrade) are guarantees the same `send()` must honor.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)

## Path Conventions

Reusable package layout — `src/`, `tests/`, repo root configs (`tsup.config.ts`, `package.json`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the 6th subpath skeleton + build/exports wiring so everything else can build.

- [X] T001 Create `src/dev-console/index.ts` skeleton: **type-only** import of `Transport`, `LogEvent`,
  `TransportFactory` from `../api/types.js`; export `interface DevConsoleTransportOptions { name?: string; traceUrl?: (trace: { traceId: string; spanId: string }) => string; colors?: boolean }`
  and `export const DevConsoleTransport: TransportFactory = (options) => ({ name: options?.name ?? 'dev-console', send(event) { /* structured fallback only for now */ } })`.
- [X] T002 [P] Add `'dev-console': 'src/dev-console/index.ts'` to the `entry` map in `tsup.config.ts`.
- [X] T003 [P] Add the `"./dev-console"` exports triple (`types`/`import`/`require` → `dist/dev-console.{d.ts,mjs,cjs}`)
  to `package.json` `exports`, mirroring the existing `./capture` / `./transport-beacon` entries.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the new subpath and keep the distributed surface honest (Feature 012 + the exports
assertions) BEFORE any rendering behavior is added. **⚠️ Blocks all user stories.**

- [X] T004 Run `npm run build`; confirm `dist/dev-console.{mjs,cjs,d.ts}` are emitted and the default
  `.` entry bundle is byte-unchanged (bundle-invariance still green).
- [X] T005 [P] Add `'./dev-console'` to `PUBLIC_SUBPATHS` **and** to the `HONEST_PKG` fixture in
  `tests/contract/distributed-surface.contract.test.ts` (both — adding only one breaks the synthetic parity test).
- [X] T006 [P] Add `'./dev-console'` to `tests/contract/dependency-pins.test.ts` — the exports-keys
  `.toEqual([...])` assertion **and** the per-entry `it.each([...])` triple check.
- [X] T007 [P] Add `'./dev-console'` to the TB-12 exports-keys assertion in
  `tests/contract/transport-beacon.contract.test.ts`.
- [X] T008 Run `npm run build && npm run surface:check` → green; run the three reconciled contract test
  files → green (skeleton transport already satisfies the surface, not yet the rendering behavior).

**Checkpoint**: 6th subpath ships + is documented/parity-honest; default entry untouched. Rendering behavior begins next.

---

## Phase 3: User Story 1 — Read logs at a glance in development (Priority: P1) 🎯 MVP

**Goal**: In `environment: 'development'` with rich console support, `send(event)` renders a collapsed,
level-styled group: header (icon/color + message + `app · module · env`), attributes, error
(name/message + stack), and a trace link when a trace context is present.

**Independent Test**: With `environment: 'development'`, spy on `console.groupCollapsed`/`log`/`groupEnd`;
emit events per level (one with an error, one with a trace context); assert the grouped, styled rendering
(DC-1, DC-2) rather than the raw structured form.

### Tests for User Story 1 ⚠️ (write first; ensure they FAIL against the T001 skeleton)

- [X] T009 [P] [US1] Contract test in `tests/contract/dev-console.contract.test.ts`: in `development`
  with a console spy, an emitted event opens a `console.groupCollapsed` with a level-styled header
  (`%c` + icon + message + `app · module · env`) and `console.groupEnd` closes it (DC-1).
- [X] T010 [P] [US1] Contract test (same file): the group logs the **attributes** object; an event with
  an error logs `error.name`/`message` + `stack`; an event with `context.trace` logs a trace link;
  each section is **omitted** when its source is empty/absent (DC-2). Cover all four levels
  (debug/info/warn/error) resolve a styled header.
- [X] T011 [P] [US1] Contract test (same file): `traceUrl` option, when provided, is invoked with the
  event's `{ traceId, spanId }` and its returned URL is rendered; when omitted, the raw ids are rendered
  (DC-8, carry-only — no ids minted).

### Implementation for User Story 1

- [X] T012 [US1] In `src/dev-console/index.ts`, add `richConsoleAvailable()` (checks
  `typeof console.groupCollapsed/group/groupEnd === 'function'`) and a `resolveConsoleMethod(level)`
  helper (mirroring `src/transport/console-transport.ts`, falling back to `console.log`).
- [X] T013 [US1] Implement the pretty path in `send()`: when `event.context.environment === 'development'`
  **and** `richConsoleAvailable()`, `groupCollapsed` a level icon/color header (`%c` styling; gray/blue/
  amber/red + icon per debug/info/warn/error) with message + `app · module · env`; inside, `console.log`
  the attributes (object, not re-serialized) when non-empty, the error name/message + stack when present,
  and the trace link (`traceUrl(trace)` if given, else the ids) when `context.trace` present; `groupEnd()`.
- [X] T014 [US1] Honor `colors` option (force `%c` on/off; default auto = on when grouping supported) and
  `name` option (`Transport.name`, default `'dev-console'`). Make T009–T011 pass.
- [X] T015 [US1] Update `README.md`: add a `./dev-console` section showing the dev-only opt-in pattern
  `transports: [ import.meta.env.DEV ? DevConsoleTransport() : ConsoleTransport() ]` and the `traceUrl` option.

**Checkpoint**: Dev pretty rendering works and is independently testable (MVP).

---

## Phase 4: User Story 2 — Production output and cost are unchanged (Priority: P2)

**Goal**: In any non-`development` environment the pretty path does NOT run; `send` behaves exactly like
`ConsoleTransport` (`console[level](event.message, event)`); the default `.` entry / `ConsoleTransport`
are untouched.

**Independent Test**: With `environment: 'production'` (and `'staging'`/unknown), spy on the console; assert
each emission is exactly `console[level](message, event)` with **no** `console.groupCollapsed` call (DC-3).

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Contract test in `tests/contract/dev-console.contract.test.ts`: in `production` (and
  `'staging'` / an unknown env string), `send` calls exactly `console[level](event.message, event)` and
  `console.groupCollapsed` is **never** called (DC-3, FR-002/FR-007; the "unknown ⇒ non-dev" edge case).
- [X] T017 [P] [US2] Non-regression test asserting `src/transport/console-transport.ts` is unchanged in
  behavior — a parity check that `DevConsoleTransport` in non-dev produces the identical console call
  sequence to `ConsoleTransport` for the same event (DC-10).

### Implementation for User Story 2

- [X] T018 [US2] Confirm/implement the non-dev short-circuit branch in `src/dev-console/index.ts` `send()`
  (the `environment !== 'development' || !richConsoleAvailable()` guard → structured fallback) so T016/T017
  pass. Do **not** modify `src/transport/console-transport.ts` or any default-entry source.
- [X] T019 [US2] Re-run `npm run build`; reconfirm the default `.` entry bundle is byte-unchanged
  (bundle-invariance green) — the renderer lives only in `./dev-console` (FR-008/SC-006).

**Checkpoint**: US1 + US2 both hold — pretty in dev, identical-to-today in non-dev, default bundle untouched.

---

## Phase 5: User Story 3 — The pretty renderer is safe and degrades gracefully (Priority: P3)

**Goal**: The renderer reads only the post-pipeline (redacted) event, attaches no globals / reads no ambient
state, never throws, and falls back to the structured form where rich console features are absent.

**Independent Test**: a secret fixture in the (already-redacted) event appears 0× unredacted; with
`console.groupCollapsed` removed it falls back without throwing; a throwing console method / `traceUrl` is
swallowed; 0 global listeners attached.

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Security test in `tests/security/dev-console.security.test.ts`: in `development`, an
  event whose (already-redacted) data carries a `makeSecretFixture()` value renders the secret **0** times
  unredacted; the renderer re-serializes no object beyond the event — assert the attributes are passed to
  `console.log` **by reference** (the same object identity as `event.attributes`), proving the renderer
  does not re-walk/re-expand the bounded event (edge case "very large attribute sets") (DC-5, SC-003).
- [X] T021 [P] [US3] Failure-safety test in `tests/contract/dev-console.contract.test.ts`: with
  `console.groupCollapsed` unavailable (deleted/stubbed) in `development`, `send` falls back to
  `console[level](message, event)` and **0** throws (DC-4); a throwing console method / throwing `traceUrl`
  is swallowed — `send` never throws (DC-7).
- [X] T022 [P] [US3] No-globals test (same security file): spy on `globalThis.addEventListener`; constructing
  `DevConsoleTransport()` and calling `send` attaches **0** listeners and reads no ambient state (DC-6, SC-005);
  also assert `send` does not mutate the event / a capturing co-transport receives the unchanged event (DC-9).
- [X] T023 [P] [US3] Bundle-shape security test in `tests/security/dev-console-bundle-shape.security.test.ts`:
  `dist/dev-console.{mjs,cjs}` is vendor-neutral (no leaked internal/private identifiers), mirroring the
  existing per-subpath bundle-shape assertions.

### Implementation for User Story 3

- [X] T024 [US3] Wrap the whole `send()` body in `try { … } catch { /* swallow */ }` in
  `src/dev-console/index.ts`; guard `traceUrl` invocation in its own try/catch (fail-safe → structured
  fallback or omit the link). Ensure no `addEventListener`/global/ambient access anywhere in the module.
  Make T020–T022 pass.
- [X] T025 [US3] Re-run `npm run build && npm run surface:check`; make T023 pass (vendor-neutral bundle).

**Checkpoint**: All three stories hold — pretty in dev, unchanged in prod, safe + graceful everywhere.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T026 [P] Run the full suite (`npm test`), `npm run typecheck`/lint, and `npm run build` — all green;
  tests under `tests/` held to the same typing/lint/import standards as `src/` (Principle IX/X).
- [X] T027 Security & privacy validation pass: confirm only the post-pipeline event is read, no
  re-serialization, trace-link carry-only, 0 unredacted secret occurrences (FR-004/005/009; SC-003/005).
- [X] T028 Log-integrity validation pass: confirm `send` does not drop/reorder/dedupe/mutate events and
  does not change what other transports receive (DC-9 / Principle VII).
- [X] T029 Reproducible-verification & mechanical-enforcement pass: confirm every gate this feature
  documents (parity `surface:check`, `dependency-pins`, TB-12 keys, bundle-invariance, the new contract/
  security tests) runs via a single `npm` script with identical local/CI behavior and is guarded by a
  named automated check (DC-10 / Principle X).
- [X] T030 Supply-chain/distribution pass: `./dev-console` added to the documented surface + parity set in
  lockstep; **no new dependency**; attested publish/signed tags/DCO/pins intact (Principle XI).
- [X] T031 Run `quickstart.md` walkthroughs 1–6 end-to-end; confirm each ✅ pass criterion holds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: T001 first (skeleton); T002/T003 `[P]` after (different files).
- **Foundational (P2)**: depends on Setup. T004 (build) before T008; T005/T006/T007 `[P]` (different test
  files). **Blocks all user stories.**
- **US1 (P3)**: after Foundational. Tests T009–T011 `[P]` (same new test file, independent cases) →
  implementation T012→T013→T014 (sequential on `src/dev-console/index.ts`) → T015 docs `[P]`.
- **US2 (P4)**: after Foundational; independently testable. Shares `src/dev-console/index.ts` with US1 —
  T018 sequential w.r.t. T012–T014.
- **US3 (P5)**: after Foundational; independently testable. T024 sequential on `src/dev-console/index.ts`.
- **Polish (P6)**: after all desired stories.

### Within / across stories

- Tests written and FAILING before implementation (TDD).
- The single file `src/dev-console/index.ts` is the shared surface for US1/US2/US3 implementation tasks
  (T012–T014, T018, T024) → these run **sequentially**, not in parallel, even across stories.
- Per-story **test** files/cases are independent and `[P]`.

### Parallel Opportunities

- Setup: T002, T003 `[P]`.
- Foundational: T005, T006, T007 `[P]` (three separate test files).
- US1 tests: T009, T010, T011 `[P]`. US3 tests: T020, T021, T022, T023 `[P]`.

---

## Parallel Example: Foundational surface reconciliation

```bash
# After T004 (build), reconcile the three documented-surface assertions together:
Task: "Add './dev-console' to PUBLIC_SUBPATHS + HONEST_PKG in tests/contract/distributed-surface.contract.test.ts"
Task: "Add './dev-console' to keys + it.each triple in tests/contract/dependency-pins.test.ts"
Task: "Add './dev-console' to TB-12 keys assertion in tests/contract/transport-beacon.contract.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational (subpath ships + parity honest) → 3. Phase 3 US1 (pretty dev
   render) → **STOP & VALIDATE** the dev rendering independently → demo.

### Incremental Delivery

Setup + Foundational → US1 (MVP, dev pretty) → US2 (prod-unchanged guarantee) → US3 (safe/degrade
hardening) → Polish. Each increment is independently testable; all land in **one PR** gated by the
(now `./dev-console`-aware) `ci-success`.

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- The renderer is one small module; the bulk of the work is the rendering branch + the safety/degradation
  guards + keeping the distributed surface honest. The core `ConsoleTransport` is **never** modified.
- Commit after each task or logical group; verify each test fails before implementing it.
