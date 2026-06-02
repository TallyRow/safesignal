---
description: "Task list for Opt-In Error Breadcrumbs (core runtime config, off by default)"
---

# Tasks: Opt-In Error Breadcrumbs (Bounded Recent-Event Context on Errors)

**Input**: Design documents from `/specs/016-error-breadcrumbs/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/breadcrumbs.md ✅, quickstart.md ✅

**Tests**: REQUIRED (core runtime behavior touching config, the dispatch pipeline, redaction-adjacent data,
failure handling, and memory bounds). Contract + security + integration + performance + failure coverage.

**Organization**: Tasks grouped by user story. NOTE: US1 (trail) and US2 (cause chain) touch **different**
files (`breadcrumb-buffer.ts` + `dispatcher.ts` vs. `cause-chain.ts` + `logger.ts`), so after the
Foundational phase they are genuinely parallelizable. US3 is mostly hardening tests + the bundle re-baseline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)

## Path Conventions

Reusable package layout — `src/`, `tests/`, repo-root configs. The new module is `src/breadcrumbs/`
(internal — **not** added to the `exports` map; this is Option A, a core runtime option).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the internal module skeleton + public type surface so wiring can compile.

- [X] T001 [P] Create `src/breadcrumbs/breadcrumb-buffer.ts` skeleton: `class BreadcrumbBuffer` with
  `constructor(maxEvents: number)`, `record(event)` and `attachTrailTo(event)` stubs; export constants
  `DEFAULT_MAX_EVENTS = 20`, `MAX_EVENTS_BOUND = 100`, `BREADCRUMBS_KEY = 'safesignal.breadcrumbs'`;
  **type-only** import of `LogEvent`/`Attributes`/`LogLevel` from `../api/types.js`.
- [X] T002 [P] Create `src/breadcrumbs/cause-chain.ts` skeleton: `extractCauseChain(value: unknown, maxDepth: number)`
  stub returning `[]`; export `MAX_CAUSE_DEPTH = 8`, `CAUSES_KEY = 'safesignal.errorCauses'`; type-only import.
- [X] T003 [P] Add public types in `src/api/types.ts`: `export interface BreadcrumbsOptions { maxEvents?: number }`
  and `LoggerConfig.breadcrumbs?: boolean | BreadcrumbsOptions` (with doc comments noting default-off + the
  reserved `safesignal.*` attribute shapes).
- [X] T004 [P] Export the `BreadcrumbsOptions` type from `src/index.ts` (alongside the existing type exports).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Resolve config → construct the shared buffer once. Both US1 and US2 gate on
`cfg.breadcrumbs`. **⚠️ Blocks all user stories.**

- [X] T005 In `src/config/config.ts`: add `readonly breadcrumbs: BreadcrumbBuffer | undefined` to
  `NormalizedConfig`, and a `resolveBreadcrumbs(config.breadcrumbs, onInternalError)` helper — `false`/
  absent → `undefined`; `true` → `new BreadcrumbBuffer(DEFAULT_MAX_EVENTS)`; an object → clamp `maxEvents`
  to `[1, MAX_EVENTS_BOUND]` (emit **one** `onInternalError` notice on clamp, mirroring the sanitizer-limit
  clamp) → `new BreadcrumbBuffer(clamped)`. Call it in `normalizeConfig`. Buffer constructed **once**.
- [X] T006 Run `npm run build` + `npm run typecheck`; confirm `cfg.breadcrumbs` threads to the dispatcher
  and `emit()` call sites with no behavior change yet (disabled path unchanged).

**Checkpoint**: the runtime carries `breadcrumbs: BreadcrumbBuffer | undefined`; stories can build.

---

## Phase 3: User Story 1 — Error carries the recent-event trail (Priority: P1) 🎯 MVP

**Goal**: When enabled, an error event carries `attributes['safesignal.breadcrumbs']` = the recent
preceding events (oldest→newest, ≤ maxEvents, excluding itself); non-error events are delivered unchanged
and recorded; disabled = no change.

**Independent Test**: enabled + a capturing transport → emit info/warn/debug then error; assert the
captured error carries the ordered trail and non-error events are untouched (BC-1/BC-2/BC-3).

### Tests for User Story 1 ⚠️ (write first; fail against the T001 stub)

- [X] T007 [P] [US1] Contract test in `tests/contract/breadcrumbs.contract.test.ts`: with `breadcrumbs: true`
  and a capturing transport, an error event carries `safesignal.breadcrumbs` = preceding events oldest→
  newest, excluding the error (BC-2); the **under-fill** case (fewer than `maxEvents` logged) → the trail
  is exactly the available events with no padding/empty entries (US1 AS#3); a non-error event is delivered
  unchanged **and** recorded (BC-3); with breadcrumbs disabled, no `safesignal.breadcrumbs` appears and
  behavior is unchanged (BC-1).
- [X] T008 [P] [US1] Unit test in `tests/unit/breadcrumbs/breadcrumb-buffer.test.ts`: O(1) `record`;
  capacity eviction (oldest-first) keeps ≤ N; snapshot shape `{ts,level,message,app?,module?,attributes?}`
  (`app`/`module` from `context.application?.name`/`context.module?.name`, omitted when absent — FR-011);
  `attachTrailTo` omits the key when the buffer is empty; snapshot **excludes** the `safesignal.breadcrumbs`
  key (anti-nesting, BC-8).

### Implementation for User Story 1

- [X] T009 [US1] Implement `BreadcrumbBuffer.record` (build a compact snapshot — `ts`/`level`/`message`,
  optional `app`/`module` from `context.application?.name`/`context.module?.name` (origin attribution,
  FR-011), and a shallow copy of attributes **excluding** `BREADCRUMBS_KEY`; O(1) circular-array write) and
  `attachTrailTo` (write the ordered oldest→newest snapshot list to `attributes[BREADCRUMBS_KEY]`; omit when
  empty) in `src/breadcrumbs/breadcrumb-buffer.ts`.
- [X] T010 [US1] Wire the gated breadcrumb block into `src/pipeline/dispatcher.ts`: after `controlCharGuard`
  and **before** `freezeInDev`, `if (config.breadcrumbs)` (try/catch → `onInternalError`) attach the trail
  when the event is error-level; keep `freeze` + fan-out as today; **after** fan-out, `if (config.breadcrumbs)`
  (try/catch) `record` the event's snapshot. Make T007/T008 pass.
- [X] T011 [US1] Add a "error breadcrumbs" section to `README.md` (enable via `configureLogging({ breadcrumbs })`;
  document the `safesignal.breadcrumbs` shape and off-by-default).

**Checkpoint**: the recent-event trail works end-to-end (MVP), independently testable.

---

## Phase 4: User Story 2 — The error's cause chain is unrolled (Priority: P2)

**Goal**: When enabled, an error whose value has a nested `cause` carries `attributes['safesignal.errorCauses']`
(ordered outermost→root, each `{name,message}`, ≤ 8, cycle-safe); omitted when no cause.

**Independent Test**: enabled → log an error with a nested cause chain; assert the captured error carries
the ordered bounded cause list; a cyclic/deep chain flattens with no loop/throw (BC-4/BC-5).

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Contract test (append to `tests/contract/breadcrumbs.contract.test.ts`): error with a
  nested `cause` → `safesignal.errorCauses` ordered outermost→root `{name,message}` (BC-4); no cause → field
  omitted; **cyclic / very deep** chain → ≤ `MAX_CAUSE_DEPTH` entries, **0** loops, **0** throws (BC-5);
  non-`Error` cause → `{name:'NonError', message:String(value)}`.
- [X] T013 [P] [US2] Unit test in `tests/unit/breadcrumbs/cause-chain.test.ts`: `extractCauseChain` is
  cycle-safe (Set of seen), depth-bounded, returns `[]` for no cause, reduces non-`Error` via `String()`.

### Implementation for User Story 2

- [X] T014 [US2] Implement `extractCauseChain(value, MAX_CAUSE_DEPTH)` in `src/breadcrumbs/cause-chain.ts`:
  walk `value.cause` and nested causes, tracking seen objects (cycle-safe) and stopping at `maxDepth`,
  reducing each to `{name,message}` (non-`Error` via `String()`); the top error is excluded (it stays in
  `event.error`).
- [X] T015 [US2] Wire gated cause extraction into `src/api/logger.ts` `emit()`: when
  `cfg.breadcrumbs && level === 'error' && errorValue !== undefined`, set
  `attributes[CAUSES_KEY] = extractCauseChain(errorValue, MAX_CAUSE_DEPTH)` **before** `dispatch()` (only
  when non-empty), so the existing sanitizer + redactor + control-char-guard process it. Make T012/T013 pass.

**Checkpoint**: US1 + US2 both hold; cause chain rides through the existing pipeline (no stage changes).

---

## Phase 5: User Story 3 — Safe, bounded, off-by-default (Priority: P3)

**Goal**: only post-redaction data in breadcrumbs; constant memory / O(1); fail-safe (error still
delivered); additive integrity; no per-`Logger` cost; isolated per runtime.

**Independent Test**: secret fixture → 0× in trail/causes; M ≫ N → bounded buffer; throwing recorder →
error still delivered; many loggers → no per-logger cost.

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] Security test in `tests/security/breadcrumbs.security.test.ts`: a `makeSecretFixture()`
  value supplied as a **whole attribute value** (and as a **whole cause message**) is masked — it appears
  **0** times unredacted in `safesignal.breadcrumbs` / `safesignal.errorCauses`, and the `[REDACTED]`
  placeholder is present (the redactor's whole-value guarantee — do **not** assert substring-in-free-text
  masking). Also assert recorded snapshots exclude the `safesignal.breadcrumbs` key (BC-7, BC-8).
- [X] T017 [P] [US3] Integration test in `tests/integration/breadcrumbs.integration.test.ts`: end-to-end via
  `configureLogging` + a capturing transport → the delivered **error** carries the trail; **non-error**
  events the transport received are unchanged; the delivered error object is not mutated after delivery;
  with two transports, **both** receive the enriched error (BC-9). Also assert: (a) **origin
  distinguishability** — breadcrumbs from a host logger vs. a `createLogger({ module })` logger carry
  distinct `module`/`app` in the trail (FR-011); (b) a **pipeline-dropped** event (fail-closed redactor /
  sanitizer drop) is **not** recorded — it never appears in a later error's trail (spec Edge Case); (c)
  **no re-entrancy** — recording does not itself emit/log (a logging-from-`send` transport does not produce
  duplicate or nested breadcrumb growth) (spec Edge Case / research R9).
- [X] T018 [P] [US3] Performance test in `tests/performance/breadcrumbs-scale.performance.test.ts`: logging
  `M ≫ maxEvents` keeps the buffer at ≤ maxEvents and per-log recording cost does not scale with M (BC-6);
  creating many `Logger`s adds **0** per-logger buffers/timers/listeners and a re-`configureLogging()` gives
  a fresh isolated buffer (BC-11).
- [X] T019 [P] [US3] Failure-safety + clamp test (append to `tests/contract/breadcrumbs.contract.test.ts`):
  a throwing recorder/enricher is swallowed → the error event is **still delivered**, routed to
  `onInternalError` (BC-10); `maxEvents` out of `[1,100]` clamps with **one** notice; `true`/`false`/absent
  behave per spec (BC-12).

### Implementation for User Story 3

- [X] T020 [US3] Harden + confirm the guards land: fail-safe try/catch around attach + record (T010),
  anti-nesting exclusion in `record` (T009), the clamp + single notice (T005), and that nothing allocates
  per-`Logger` (the buffer lives only on the runtime). Make T016–T019 pass.
- [X] T021 [US3] Bundle: `npm run build`; measure `dist/index.mjs` gzip delta vs `main` — confirm it is
  **< 1 KiB** (the `bundle-invariance` gate, NOT re-baselinable). Re-baseline the stored
  `DEFAULT_ENTRY_MJS_GZ_MAX` / `DEFAULT_ENTRY_CJS_GZ_MAX` ceilings in
  `tests/security/transport-beacon-bundle-shape.security.test.ts` (group e) to the new observed sizes with a
  documented justification comment (Feature 016 core growth; gate moved, not removed).

**Checkpoint**: all three stories hold — useful, safe, bounded, off-by-default, and bundle-clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T022 [P] Run the full suite (`npm test`), `npm run typecheck`, `npm run lint`, `npm run build` — all
  green; tests under `tests/` held to the same typing/lint/import standards as `src/`.
- [X] T023 Security & privacy validation pass: breadcrumbs/causes contain only post-redaction data, **0**
  secret occurrences, off-by-default; no ambient reads, no raw object capture (FR-006 / SC-004).
- [X] T024 Log-integrity validation pass: enrichment is additive on the **error** event only; no other event
  is dropped/reordered/deduped/mutated; delivered events are not mutated (Principle VII / BC-9).
- [X] T025 Lightweight-`Logger` & federated validation pass: constant memory over `M ≫ N`; **0** per-logger
  buffers/timers/listeners; duplicate-copy behavior is **isolated** (each runtime owns its buffer)
  (Principle VIII / SC-007 / BC-11).
- [X] T026 Reproducible-verification & mechanical-enforcement pass: every documented gate (trail/cause shape
  + bounds, off-by-default no-op, constant memory/O(1), fail-safe delivery, secret-free trail, the bundle
  gates) has a named automated check; confirm the dynamic `bundle-invariance` gate passes (< 1 KiB) and the
  re-baselined ceilings carry a written justification (gate moved, not removed) (Principle IX/X).
- [X] T027 Supply-chain pass: **no new dependency**; the `exports` map + packaged files are **unchanged**
  (no new subpath); attested publish / signed tags / DCO / pins intact (Principle XI).
- [X] T028 Run `quickstart.md` walkthroughs 1–8 end-to-end; confirm each ✅ pass criterion holds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: T001–T004 all `[P]` (different files).
- **Foundational (P2)**: T005 depends on T001 (uses `BreadcrumbBuffer`) + T003 (the config type) → T006
  build/typecheck. **Blocks all user stories.**
- **US1 (P3)**: after Foundational. Tests T007/T008 `[P]` → impl T009 (buffer) → T010 (dispatcher) → T011
  docs.
- **US2 (P4)**: after Foundational; **independent of US1** (different files: `cause-chain.ts` + `logger.ts`).
  Tests T012/T013 `[P]` → impl T014 → T015.
- **US3 (P5)**: after US1 + US2 (it hardens/tests their guards). Tests T016–T019 `[P]` → T020 harden →
  T021 bundle.
- **Polish (P6)**: after all stories.

### Parallel Opportunities

- Setup: T001, T002, T003, T004 all `[P]`.
- **US1 and US2 run in parallel** after Foundational (disjoint files): {T007,T008,T009,T010} ∥
  {T012,T013,T014,T015}.
- US1 tests T007/T008 `[P]`; US2 tests T012/T013 `[P]`; US3 tests T016/T017/T018/T019 `[P]`.

---

## Parallel Example: US1 ∥ US2 after Foundational

```bash
# Two disjoint tracks once the buffer is constructed on the runtime (T005/T006):
# Track US1 (trail):    breadcrumb-buffer.ts + dispatcher.ts
Task: "Implement BreadcrumbBuffer.record + attachTrailTo (T009)"
Task: "Wire trail attach + record into dispatcher.ts (T010)"
# Track US2 (cause chain):  cause-chain.ts + logger.ts
Task: "Implement extractCauseChain (T014)"
Task: "Wire cause extraction into logger.ts emit() (T015)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

Setup → Foundational → US1 (recent-event trail) → **STOP & VALIDATE** the trail end-to-end → demo. US2
(cause chain) and US3 (hardening) layer on without changing US1.

### Incremental Delivery

Setup + Foundational → US1 (MVP, trail) → US2 (cause chain) → US3 (safety/bounds/bundle) → Polish. All land
in **one PR** gated by `ci-success` (including `bundle-invariance`).

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- The pipeline stages (`sanitizer`/`url-scrubber`/`redactor`/`control-char-guard`/`freeze`) and
  `ConsoleTransport` are **never** modified — the cause chain reuses them by being written into
  `attributes` before dispatch.
- The single hardest constraint is the **±1 KiB `bundle-invariance` gate** on `dist/index.mjs` (T021) — keep
  the core breadcrumb code lean; it is not re-baselinable.
- Commit after each task or logical group; verify each test fails before implementing it.
