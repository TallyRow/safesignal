---
description: "Task list for Feature 008 — W3C Trace-Context Propagation"
---

# Tasks: W3C Trace-Context Propagation

**Input**: Design documents from `/specs/008-trace-context/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md (all present)

**Tests**: REQUIRED. Every change to public API, event model, failure handling,
metadata, redaction, or transport delivery carries contract, integration, unit,
and security coverage (Constitution v1.3.0 §V/§VIII/§IX).

**Organization**: Grouped by user story. US1 + US2 are both P1 (US1 = carry +
OTLP mapping = the MVP; US2 = fail-closed hardening of the shared validation).
US3 (P2) adds the `parseTraceparent` helper + dynamic `correlation()`. US4 (P3)
covers federated/lightweight guarantees.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- All paths are repository-root-relative.

## Reference map (contracts ↔ requirements)

- Core surface: `contracts/trace-context.md` TC-1..TC-9
- OTLP mapping: `contracts/otlp-trace-mapping.md` OT-1..OT-5
- Decisions: `research.md` D1..D8 · Shapes: `data-model.md`
- Enforcement table: `plan.md` → "Documented gate → enforcement map"

> **Dependency**: extends the `./transport-otlp` serializer from Feature 007
> (MR !23). This branch is stacked on 007; implement after 007 merges so the
> serializer change lands on a merged base.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type scaffold + module skeleton so the feature compiles. No runtime
logic yet.

- [X] T001 [P] Add `interface TraceContext { traceId: string; spanId: string; traceFlags?: number; traceState?: string }` and an optional `trace?: TraceContext` on `LogContext` in `src/api/types.ts`; add `TraceContext` to the type exports in `src/index.ts` (type-only; no bundle cost) (TC-1, D1).
- [X] T002 [P] Create the `src/trace/` directory with compiling stubs `src/trace/validate.ts` (`normalizeTraceContext`) and `src/trace/traceparent.ts` (`parseTraceparent`) — pure, zero-dep, no cross-subpath imports.

**Checkpoint**: `npm run typecheck` passes; `LogContext.trace` + `TraceContext` resolve.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared trace machinery every story needs — validation, the
merge arm, and the emit-path wiring. Pure + fail-closed.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T003 Implement `normalizeTraceContext(trace: unknown): TraceContext | undefined` in `src/trace/validate.ts`: require BOTH `traceId` (32 lowercase-hex, non-zero) AND `spanId` (16 lowercase-hex, non-zero) — drop the whole trace if either is invalid; coerce `traceFlags` to an integer 0–255 (else omit the flag); keep `traceState` within the documented length bound (else omit it); never throw (TC-4, D4).
- [X] T004 Extend `mergeContexts` in `src/context/context-merge.ts` with a `trace` arm — **shallow-replace if defined** (a later source's `trace` wholly replaces an earlier one), matching `application`/`module` semantics; preserve existing precedence (TC-3, D3).
- [X] T005 Wire `normalizeTraceContext` into the emit path in `src/api/logger.ts` during context resolution — after `mergeContexts`, before sanitize/redact — so a directly-supplied and a parsed `context.trace` are validated identically; the merged event's `context.trace` is the normalized result (or absent) (D4/D7).

**Checkpoint**: Foundation ready — typecheck passes; user stories can begin.

---

## Phase 3: User Story 1 — Logs carry trace context to the backend (Priority: P1) 🎯 MVP

**Goal**: Supplied trace context appears on every emitted event and populates the
OTLP `LogRecord`'s standard `traceId`/`spanId`/`flags` fields.

**Independent Test**: Supply a valid trace context, emit events, assert
`event.context.trace` is present and the OTLP serializer output carries the
matching trace fields; with no supply, no trace fields appear.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T006 [P] [US1] Contract test `tests/contract/trace-context.contract.test.ts`: field carriage (a valid supplied `trace` rides on the emitted event — TC-2); merge precedence root → `withContext()` → `correlation()` with shallow-replace (TC-3); carry-only — no supply ⇒ `context.trace` absent, no minted/zero ids (TC-6).
- [X] T007 [P] [US1] Extend `tests/unit/transport-otlp/otlp-serializer.test.ts`: with `context.trace` present, `toLogRecord` emits `traceId`/`spanId` (lowercase-hex as-is) + `flags`; with `context.trace` absent, none are emitted; input event not mutated (OT-1/OT-2/OT-5, D5).
- [X] T008 [P] [US1] Extend `tests/contract/transport-otlp.contract.test.ts`: an event with trace context delivered via the OTLP transport produces a `LogRecord` carrying `traceId`/`spanId`/`flags` (OT-1).

### Implementation for User Story 1

- [X] T009 [US1] Extend `toLogRecord` in `src/transport-otlp/otlp-serializer.ts` to emit `traceId`/`spanId` (the lowercase-hex strings as-is) + `flags` (`traceFlags`) onto the `OtlpLogRecord` when `event.context.trace` is present; emit nothing when absent; do NOT import `@opentelemetry/*` or `src/trace/` (read the plain field) (OT-1..OT-5, D5). Add the optional fields to the `OtlpLogRecord` interface.
- [X] T010 [US1] Add a `## Correlate logs with traces — trace context` section to `README.md` (carriage + OTLP mapping; carry-only note), modeling safe usage.

**Checkpoint**: MVP — supplied trace context rides on events and lands on OTLP records; no `@opentelemetry` in the subpath bundle.

---

## Phase 4: User Story 2 — Bad trace input never breaks logging (Priority: P1)

**Goal**: Malformed/invalid trace input is dropped fail-closed; the event still
ships; nothing throws into the emit path.

**Independent Test**: Feed malformed traceparent-derived/structured trace inputs
and assert the event is still emitted, the invalid trace is omitted, and no call
throws.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T011 [P] [US2] Unit test `tests/unit/trace/validate.test.ts`: `normalizeTraceContext` over valid input, wrong-length ids, non-hex/uppercase, all-zero ids, missing id (require-both ⇒ whole trace dropped), out-of-range `traceFlags`, oversized `traceState` (omitted), and non-object input — all without throwing (TC-4).
- [X] T012 [P] [US2] Integration test `tests/integration/trace-context-failure-safety.integration.test.ts`: configure a runtime, supply malformed `context.trace` via config/`withContext()`/`correlation()`, emit — assert the event is captured WITHOUT trace fields, no throw/rejection reaches the caller, and a valid event in the same session still carries trace.

### Implementation for User Story 2

- [X] T013 [US2] Finalize the `normalizeTraceContext` edge policies in `src/trace/validate.ts` per the tests: the `traceState` length bound value and the require-both-ids policy; document the chosen bound in `data-model.md` + `contracts/trace-context.md` (replace any "documented bound" placeholder with the concrete number) (TC-4, research open item).

**Checkpoint**: US1 + US2 — carriage works and is provably fail-closed.

---

## Phase 5: User Story 3 — Ergonomic ingestion + dynamic correlation (Priority: P2)

**Goal**: A `parseTraceparent` helper turns the header string apps hold into the
structured shape, and dynamic trace context flows through `correlation()`.

**Independent Test**: Parse representative `traceparent`(+`tracestate`) strings
and assert correctness/invalidity handling; supply a changing trace via
`correlation()` and assert successive events pick up the current value.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T014 [P] [US3] Unit test `tests/unit/trace/traceparent.test.ts`: a valid `00-<32hex>-<16hex>-<2hex>` header → correct `TraceContext`; invalid forms (wrong segment count, bad hex, wrong lengths) → `undefined` (never throws); `tracestate` arg attached + bounded (TC-5).
- [X] T015 [P] [US3] Integration test in `tests/integration/trace-context-failure-safety.integration.test.ts` (or a sibling): a `correlation()` hook returning a changing trace context yields per-event trace context current at emit time (US3 scenario 2).

### Implementation for User Story 3

- [X] T016 [US3] Implement `parseTraceparent(header: string, tracestate?: string): TraceContext | undefined` in `src/trace/traceparent.ts` (pure, never throws; result re-validated by `normalizeTraceContext` at emit); export `parseTraceparent` from `src/index.ts` (TC-5, D2).
- [X] T017 [US3] Update the public-surface assertion (`tests/contract/declarations-surface.test.ts` and/or the public-API contract test) to include the new `parseTraceparent` value export and the `TraceContext` type export (TC-1).
- [X] T018 [US3] Update the `README.md` trace section + `quickstart.md` to show the three supply paths (parseTraceparent / `correlation()` / `withContext()`), modeling safe usage.

**Checkpoint**: US1–US3 — ergonomic ingestion and dynamic correlation work.

---

## Phase 6: User Story 4 — Federated correlation without per-Logger cost (Priority: P3)

**Goal**: Trace context layers through the documented merge precedence with no
per-`Logger` trace state; derived loggers stay constant-cost.

**Independent Test**: Create/derive many loggers with trace context set at
different layers; assert precedence is honored and no per-`Logger` trace work
occurs.

### Tests for User Story 4 ⚠️ (write first, ensure they FAIL)

- [X] T019 [P] [US4] Performance test `tests/performance/trace-context-logger-cost.perf.test.ts`: with trace context configured, creating + deriving N loggers (`child()`/`withContext()`) triggers zero per-instance timers/listeners/ambient-reads and stays linear; trace validation cost is per-emit, not per-`Logger` (TC-8, Principle VII).

### Implementation for User Story 4

- [X] T020 [US4] Confirm in `src/api/logger.ts` / `src/context/context-merge.ts` that no trace state is allocated per `Logger` (trace resolves through the shared merge path); document host/module trace-context ownership + merge precedence in the `README.md` federated section.

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T021 Build and measure `dist/index.mjs` + `dist/index.cjs` gz sizes; re-baseline `DEFAULT_ENTRY_MJS_GZ_MAX` / `DEFAULT_ENTRY_CJS_GZ_MAX` in `tests/security/transport-beacon-bundle-shape.security.test.ts` to the new measured values (the core trace additions legitimately grow the default entry past the old 8200 ceiling — re-baseline, not relaxation) (research D6). **DONE**: measured index.mjs 8740 B / index.cjs 8785 B; ceilings re-baselined to 8800 / 8850.
- [X] T022 Decide core-vs-`./trace`-subpath for `parseTraceparent` from the measured `dist/index.mjs` ±1 KiB delta vs. the merge-base (research D6). **DECISION: keep in core** — measured delta is +574 B gz (8166 → 8740), well within the ±1 KiB invariance gate, so no `./trace` subpath is needed. `parseTraceparent` stays exported from the default entry.
- [X] T023 Security/privacy test `tests/security/trace-context-privacy.security.test.ts`: a `traceState` carrying a secret-like value is bounded and not leaked beyond the bounded field; trace ids pass through redaction unchanged; redaction of surrounding attributes/context/error is unaffected (TC-7, FR-009).
- [X] T024 Add a `[1.2.0]` CHANGELOG entry in `CHANGELOG.md` (additive: `context.trace` field, `parseTraceparent` helper, OTLP trace-field mapping; no change for trace-less events).
- [X] T025 Security & Privacy + Log-integrity validation pass: confirm carry-only (no id minting), fail-closed validation, `traceState` bound, redaction unaffected, and that trace presence/absence + partial-validity handling are documented (spec §Security/§Log Integrity).
- [X] T026 Lightweight & federated validation pass: re-run T019; confirm zero per-`Logger` trace cost and that merge precedence matches docs.
- [X] T027 Reproducible Verification & Mechanical Enforcement pass: walk the plan's gate→enforcement map; confirm each gate runs via `npm run build/typecheck/test/lint/format:check/test:coverage` identically local + CI and is guarded by its named test/job; `tests/` meets `src/` standards; file a remediation task for any unenforced gate (expected: none).
- [X] T028 Run `quickstart.md` end-to-end against the built package (verify the captured OTLP payload carries the documented trace fields) and fix any drift.
- [X] T029 Full-suite invariance check: `npm run build && npm run typecheck && npm test` on Node 20 + 22 — the pre-feature suite has 0 regressions / 0 failing (only this feature's added tests as deltas); `dist/index.mjs` within ±1 KiB of the merge-base and the re-baselined ceiling; `dist/transport-otlp.mjs` still `@opentelemetry`-free and within its 5120 budget; `./testing` / `./transport-beacon` bundles within ±1 KiB; lint + format clean.

---

## Dependencies & Execution Order

### Phase dependencies

(“Phase N” = the section number below; story priorities are P1–P3 from spec.md.)

- **Phase 1 Setup** → no deps; start immediately.
- **Phase 2 Foundational** → after Setup; BLOCKS all stories (the type + merge +
  validation + emit wiring are shared).
- **Phase 3 — US1 (priority P1, MVP)** → after Foundational.
- **Phase 4 — US2 (priority P1)** → after Foundational (hardens the shared
  `normalizeTraceContext`); independent of US1's OTLP work.
- **Phase 5 — US3 (priority P2)** → after Foundational (adds the parser +
  surface export); independent of US1/US2.
- **Phase 6 — US4 (priority P3)** → after Foundational (verifies the shared-path
  cost); independent of US1–US3.
- **Phase 7 Polish** → after all desired stories (the bundle re-baseline needs
  the final code in place).

### Story independence notes

- US1 is independently shippable (the MVP). US2 hardens the shared validation;
  US3 adds the parser + a public export; US4 verifies cost. They share
  `src/trace/` and `src/api/logger.ts`, so run them sequentially (US1 → US2 →
  US3 → US4) to avoid same-file conflicts.

### Within each story

- Tests written and FAILING before implementation (Constitution §V).
- Foundational machinery (type → merge → validate → emit wiring) before any
  story; serializer extension (US1) and parser (US3) build on it.

---

## Parallel Opportunities

- **Setup**: T001 ∥ T002 (distinct files).
- **Foundational**: T003 ∥ T004 are distinct files, but T005 depends on both;
  run T003 ∥ T004, then T005.
- **US1 tests**: T006 ∥ T007 ∥ T008 (distinct files).
- **US2 tests**: T011 ∥ T012. **US3 tests**: T014 ∥ T015. **US4 tests**: T019.
- **Polish**: T021 → T022 (sequential; T022 reads T021's measurement); T023 ∥
  T024 (distinct files); validation passes T025–T029 sequential.

---

## Parallel Example: User Story 1 tests

```bash
# Launch US1 tests together (distinct files, all expected to FAIL first):
Task: "Contract test field carriage + merge + carry-only in tests/contract/trace-context.contract.test.ts"
Task: "Serializer trace-mapping unit in tests/unit/transport-otlp/otlp-serializer.test.ts"
Task: "OTLP contract trace fields in tests/contract/transport-otlp.contract.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE**
   (supplied trace rides on events + lands on OTLP records; subpath bundle stays
   vendor-neutral).

### Incremental delivery

US1 (carry + OTLP, MVP) → US2 (fail-safe) → US3 (parser + correlation) → US4
(federated) → Polish (bundle re-baseline + validation). Each story keeps the
suite + bundles invariant; commit per-task (repo convention; DCO sign-off).

---

## Notes

- Zero new runtime dependencies — `parseTraceparent` + validation are
  hand-written and pure. No `@opentelemetry/*` import reaches the
  `./transport-otlp` bundle (the serializer reads a plain field) (OT-4, D5).
- This feature is **core-touching**: `dist/index.mjs` grows. The ±1 KiB gate
  must hold and the hard-ceiling constant MUST be re-baselined (T021); the
  `./trace`-subpath fallback (T022) caps index growth if needed.
- No tolerated test relaxations are planned. If one becomes necessary, record a
  written, named, time-bound removal condition here (Constitution §V/§VIII).
- Commit after each task or logical group; DCO `Signed-off-by` required.
