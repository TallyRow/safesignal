---
description: "Task list for Readable, Source-Mapped Error Stacks (core seam + ./stacks subpath)"
---

# Tasks: Readable, Source-Mapped Error Stacks

**Input**: Design documents from `/specs/017-readable-error-stacks/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/stacks.md ✅, quickstart.md ✅

**Tests**: REQUIRED (touches public config/types, the dispatch path, redaction-adjacent frame data, failure
handling, and the distributed surface). Contract + unit + security + failure coverage.

**Organization**: Tasks grouped by user story. NOTE: the heavy logic (parser US1 + resolver US2) lives in
the **same** `src/stacks/index.ts`, so those *implementation* tasks are sequential on that file; their
*tests* are independent and `[P]`. US3 is mostly hardening tests + the bundle re-baseline.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish carry no story label)

## Path Conventions

Reusable package layout — `src/`, `tests/`, repo-root configs. `src/stacks/` is the new **7th** public
subpath (added to the `exports` map). The core seam is a tiny addition to existing core files.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the subpath skeleton + the core seam's public types so wiring compiles.

- [X] T001 [P] Create `src/stacks/index.ts` skeleton: `createStackNormalizer(options?)` stub returning a
  normalizer that yields `null`; export `interface StackNormalizerOptions { resolver?; maxFrames?; includeNodeModules?; includeInternal? }`
  and constants `DEFAULT_MAX_FRAMES = 30`, `MAX_FRAMES_BOUND = 100`, `STACK_KEY = 'safesignal.stack'`;
  **type-only** import of `StackFrame`/`StackNormalizer` from `../api/types.js`.
- [X] T002 [P] Add core public types in `src/api/types.ts`: `interface StackFrame { function?; file?; line?; column?; original? }`,
  `type StackNormalizer = (stack: string) => StackFrame[] | null`, and `LoggerConfig.normalizeStack?: StackNormalizer`
  (doc comments: off by default; reserved `safesignal.stack` attribute shape).
- [X] T003 [P] Export `StackFrame` + `StackNormalizer` types from `src/index.ts`.
- [X] T004 [P] Add `'stack_normalize_failed'` to the `PackageErrorCode` union in `src/internal/errors/internal-errors.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the core seam (config + emit) + ship the subpath + keep the distributed surface honest.
**⚠️ Blocks all user stories.**

- [X] T005 In `src/config/config.ts`: add `readonly normalizeStack: StackNormalizer | undefined` to
  `NormalizedConfig` and pass `config.normalizeStack` through in `normalizeConfig` (no transformation).
- [X] T006 In `src/api/logger.ts` `emit()`: gated by `cfg.normalizeStack && level === 'error' && event.error?.stack`,
  call the normalizer **fail-safe** (try/catch → `safeNotify(wrapAsPackageError('stack_normalize_failed', …))`);
  when it returns a non-empty array, set `event.attributes['safesignal.stack'] = frames` **before** `dispatch()`.
- [X] T007 [P] Build wiring: add `'stacks': 'src/stacks/index.ts'` to `tsup.config.ts` `entry`; add the
  `"./stacks"` exports triple (`types`/`import`/`require` → `dist/stacks.{d.ts,mjs,cjs}`) to `package.json`.
- [X] T008 Distributed-surface reconciliation: add `'./stacks'` to `PUBLIC_SUBPATHS` **and** `HONEST_PKG`
  in `tests/contract/distributed-surface.contract.test.ts`; to `tests/contract/dependency-pins.test.ts`
  (exports-keys `.toEqual` + the `it.each` per-entry triple); and to the TB-12 keys assertion in
  `tests/contract/transport-beacon.contract.test.ts`.
- [X] T009 Add the reviewed `LoggerConfig` change to `api/surface-allow.json` (the new optional
  `normalizeStack?: StackNormalizer` field is additive/backward-compatible — capture the exact `from`/`to`
  signatures with a `reason`, mirroring the Feature 016 entry).
- [X] T010 Run `npm run build` + `npm run typecheck` + `npm run api:check`; confirm `dist/stacks.*` emits,
  the seam threads, and the surface check passes (the stub normalizer keeps behavior disabled-like).

**Checkpoint**: the seam + subpath exist and are documented/honest; story logic begins next.

---

## Phase 3: User Story 1 — Readable, trimmed frames (Priority: P1) 🎯 MVP

**Goal**: With `normalizeStack` configured, an error carries `attributes['safesignal.stack']` = ordered,
**trimmed** structured frames parsed from `error.stack` (V8 + Firefox/Safari); unparseable → no frames,
raw stack preserved.

**Independent Test**: configure `createStackNormalizer()` + a capturing transport; log errors with V8 and
FF/Safari stacks containing noise frames; assert the trimmed frame list (ST-2/ST-3/ST-4); disabled = no-op.

### Tests for User Story 1 ⚠️ (write first; fail against the T001 stub)

- [X] T011 [P] [US1] Unit test in `tests/unit/stacks/parse-trim.test.ts`: parse **V8** (`at fn (file:line:col)`,
  bare `at file:line:col`, `async`/`<anonymous>`/`new`) and **Firefox/Safari** (`fn@file:line:col`,
  `@file:line:col`) into `{function?,file?,line?,column?}`; the `Error: msg` header line is dropped;
  trimming removes `node_modules` / `node:`/internal / SafeSignal / native frames (with `includeNodeModules`
  / `includeInternal` opting back in); a never-all-empty fallback; an unparseable/empty stack → `null`;
  `maxFrames` caps + clamps to [1,100].
- [X] T012 [P] [US1] Contract test in `tests/contract/stacks.contract.test.ts`: with `normalizeStack:
  createStackNormalizer()` + a capturing transport, a logged error carries `safesignal.stack` (ordered,
  trimmed) (ST-2); an unparseable stack → no `safesignal.stack`, raw `error.stack` preserved (ST-3);
  **disabled** (no `normalizeStack`) → no `safesignal.stack`, behavior unchanged (ST-1).

### Implementation for User Story 1

- [X] T013 [US1] Implement the parser in `src/stacks/index.ts`: line-by-line V8 + FF/Safari recognizers →
  `StackFrame[]`; unrecognized lines skipped; `[]` → caller treats as `null`.
- [X] T014 [US1] Implement the trimmer + bounds in `src/stacks/index.ts`: drop `node_modules` / engine
  (`node:`/internal) / native frames per the documented policy (tunable via `includeNodeModules` /
  `includeInternal`); the SafeSignal-own-frame rule is a **best-effort** extra (rarely applicable — see
  research R7); never return empty when frames existed (fall back to un-trimmed); cap to `maxFrames`
  (clamped). `createStackNormalizer` returns the trimmed frames or `null`. Make T011/T012 pass.
- [X] T015 [US1] Add a `./stacks` section to `README.md` (enable via `normalizeStack: createStackNormalizer({ … })`;
  the `safesignal.stack` shape; off-by-default; synchronous-resolver / preload note).

**Checkpoint**: readable trimmed frames work end-to-end (MVP), independently testable.

---

## Phase 4: User Story 2 — Source-mapped frames (Priority: P2)

**Goal**: With a synchronous `resolver`, resolvable frames carry `original` (file/line/column/name); an
unmappable frame is left at its original position (partial allowed).

**Independent Test**: configure a fake sync resolver mapping a minified position to source; log an error
with minified frames; assert resolved frames carry `original` and unmappable frames are untouched (ST-5).

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Unit test in `tests/unit/stacks/resolver.test.ts`: a sync `resolver` sets `original`
  on resolvable frames; a frame the resolver returns `null` for is left unchanged; a resolver that **throws**
  for one frame is swallowed per-frame and the others still resolve (ST-5/ST-7); only frames with numeric
  line/col are offered to the resolver.
- [X] T017 [P] [US2] Contract test (append to `tests/contract/stacks.contract.test.ts`): end-to-end via
  `configureLogging({ normalizeStack: createStackNormalizer({ resolver }) })`, a logged error's
  `safesignal.stack` frames carry `original` for resolvable frames (ST-5).

### Implementation for User Story 2

- [X] T018 [US2] Implement resolver application in `src/stacks/index.ts` `createStackNormalizer`: when
  `options.resolver` is set, for each kept frame with numeric line/col call it inside a per-frame try/catch;
  on a returned position set `frame.original`; on `null`/throw leave the frame. Sequential on
  `src/stacks/index.ts` (shares the file with US1). Make T016/T017 pass.

**Checkpoint**: US1 + US2 both hold; minified frames map to source, partial + fail-safe.

---

## Phase 5: User Story 3 — Safe, bounded, off-by-default (Priority: P3)

**Goal**: frame text scrubbed (no secret leak), fail-safe (error always delivered, never blocks), bounded,
runtime-level (no per-`Logger` cost), default entry stays lean.

**Independent Test**: a frame whose file URL carries a secret → scrubbed; a throwing parser/resolver →
error still delivered; many loggers → 0 per-logger cost; `dist/stacks.*` vendor-neutral + default entry has
no parser fingerprints.

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] Security test in `tests/security/stacks.security.test.ts`: a frame whose `file` is
  `https://app.example/p?token=<makeSecretFixture value>` is delivered with the value **scrubbed**
  (`[REDACTED]`) — the secret appears **0** times unredacted in `safesignal.stack` (the pipeline `urlScrub`
  scrubs each frame `file`) (ST-6).
- [X] T020 [P] [US3] Bundle-shape security test in `tests/security/stacks-bundle-shape.security.test.ts`:
  `dist/stacks.{mjs,cjs}` is vendor-neutral (no bundled source-map library / vendor identifier) with a gzip
  size budget; `dist/index.{mjs,cjs,d.ts}` contains **no** `createStackNormalizer` / parser fingerprints
  (default-entry isolation, ST-11/ST-12); source-import boundary on `src/stacks/**` (type-only `../api/types.js`).
- [X] T021 [P] [US3] Failure-safety test (append to `tests/contract/stacks.contract.test.ts`): a
  `normalizeStack` whose parser/resolver **throws** → the error event is **still delivered** (raw stack /
  un-resolved frames), routed to `onInternalError`, **0** throws; delivery is synchronous + exactly-once
  (no second event) (ST-7/ST-8).
- [X] T022 [P] [US3] No-per-`Logger` + isolation test in `tests/performance/stacks-scale.performance.test.ts`:
  creating many loggers incurs **0** per-logger normalization / listeners (the normalizer runs only per
  error at the runtime level); a re-`configureLogging()` is isolated (ST-10). (The bounded-`maxFrames`
  assertion for a 500-frame stack lives in the T011 unit test — ST-9.)

### Implementation for User Story 3

- [X] T023 [US3] Harden + confirm: the `emit()` seam try/catch (T006), the subpath's per-frame and
  whole-body fail-safety, the `maxFrames` clamp, and that `src/stacks/**` reads no globals/ambient state.
  Make T019–T022 pass.
- [X] T024 [US3] Bundle: `npm run build`; measure `dist/index.mjs` gzip delta vs `main` — confirm **< 1 KiB**
  (`bundle-invariance`, NOT re-baselinable). Re-baseline the stored `DEFAULT_ENTRY_MJS_GZ_MAX` /
  `DEFAULT_ENTRY_CJS_GZ_MAX` in `tests/security/transport-beacon-bundle-shape.security.test.ts` (group e)
  to the new observed sizes with a documented Feature 017 justification (gate moved, not removed).

**Checkpoint**: all three stories hold — useful, source-mapped, safe, bounded, off-by-default, bundle-clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T025 [P] Run the full suite (`npm test`), `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run build`, `npm run api:check`, `npm run surface:check` — all green; tests held to `src/` standards.
- [X] T026 Security & privacy validation pass: frames carry only post-pipeline-scrubbed data; **0** secret
  occurrences in frame URLs; off-by-default; resolver receives only frame positions (FR-005 / SC-004).
- [X] T027 Log-integrity validation pass: additive on the **error** event only; no other event dropped/
  reordered/mutated; **synchronous exactly-once** delivery; original `error.stack` preserved (Principle VII).
- [X] T028 Lightweight-`Logger` & federated validation pass: **0** per-logger normalization/listeners;
  runtime-level only; duplicate-copy behavior **isolated** (Principle VIII / SC-006).
- [X] T029 Reproducible-verification & mechanical-enforcement pass: every gate has a named automated check;
  the dynamic `bundle-invariance` passes (< 1 KiB) and the re-baselined ceilings carry a written
  justification (gate moved, not removed); `./stacks` parity + dependency-pins + TB-12 green (Principle IX/X).
- [X] T030 Supply-chain pass: `./stacks` added to the documented surface + parity set in lockstep; **no new
  dependency**; `dist/stacks.*` vendor-neutral; attested publish / signed tags / DCO / pins intact (XI).
- [X] T031 Run `quickstart.md` walkthroughs 1–7 end-to-end; confirm each ✅ pass criterion holds.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: T001–T004 all `[P]` (different files).
- **Foundational (P2)**: T005 (config) + T006 (emit, depends on T002 types) + T007 (build wiring) →
  T008/T009 (surface + allow-list, `[P]` after T007) → T010 (build/typecheck/api:check). **Blocks stories.**
- **US1 (P3)**: after Foundational. Tests T011/T012 `[P]` → impl T013 → T014 (sequential on
  `src/stacks/index.ts`) → T015 docs.
- **US2 (P4)**: after US1 (shares `src/stacks/index.ts`). Tests T016/T017 `[P]` → impl T018.
- **US3 (P5)**: after US1 + US2 (hardens/tests their guards). Tests T019–T022 `[P]` → T023 harden → T024 bundle.
- **Polish (P6)**: after all stories.

### Parallel Opportunities

- Setup: T001, T002, T003, T004 all `[P]`.
- Foundational: T008, T009 `[P]` (different files) after T007.
- US1 tests T011/T012 `[P]`; US2 tests T016/T017 `[P]`; US3 tests T019/T020/T021/T022 `[P]`.
- Note: US1 and US2 **implementation** are sequential (same `src/stacks/index.ts`) — unlike the disjoint
  tracks in Feature 016.

---

## Parallel Example: US1 tests

```bash
Task: "Unit parse/trim/bounds test in tests/unit/stacks/parse-trim.test.ts (T011)"
Task: "End-to-end contract test in tests/contract/stacks.contract.test.ts (T012)"
```

---

## Implementation Strategy

### MVP First (User Story 1)

Setup → Foundational → US1 (readable trimmed frames) → **STOP & VALIDATE** end-to-end → demo. US2
(source-mapping) and US3 (hardening) layer on without changing US1.

### Incremental Delivery

Setup + Foundational → US1 (MVP) → US2 (source maps) → US3 (safety/bounds/bundle) → Polish. All land in
**one PR** gated by `ci-success` (incl. `bundle-invariance`, `surface:check`, `api-surface`).

---

## Notes

- `[P]` = different files, no incomplete-task dependency.
- The pipeline stages (`sanitizer`/`url-scrubber`/`redactor`/`control-char-guard`/`freeze`) and
  `ConsoleTransport` are **never** modified — frames ride in `attributes` so the existing `urlScrub` +
  `redact` + `sanitize` scrub/bound them.
- The core seam must stay within the ±1 KiB `bundle-invariance` gate (T024); the heavy parser lives in the
  `./stacks` subpath (its own bundle, tree-shaken from non-users).
- `LoggerConfig` gains an optional field → the `api-surface` gate needs the `api/surface-allow.json` entry
  (T009), exactly as Feature 016 did.
- Commit after each task or logical group; verify each test fails before implementing it.
