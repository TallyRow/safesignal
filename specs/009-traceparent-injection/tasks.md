---
description: "Task list for Feature 009 — Outbound traceparent Header Injection"
---

# Tasks: Outbound `traceparent` Header Injection

**Input**: Design documents from `/specs/009-traceparent-injection/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md (all present)

**Tests**: REQUIRED. This change touches public options, transport delivery, and
failure handling, so it carries contract, unit, integration, and security
coverage (Constitution v1.3.0 §V/§VIII/§IX).

**Organization**: Grouped by user story. All three stories are **P1** and
co-equal: US1 = the inject happy-path (MVP), US2 = fail-closed homogeneity
hardening, US3 = the disabled-by-default / no-overwrite guarantee. They all
exercise the same engine, so the shared engine lives in Foundational and each
story is test + confirm + docs on top of it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- All paths are repository-root-relative.

## Reference map (contracts ↔ requirements)

- Injection surface + policy: `contracts/traceparent-injection.md` TI-1..TI-9
- Decisions: `research.md` D1..D8 · Shapes: `data-model.md`
- Enforcement table: `plan.md` → "Documented gate → enforcement map"

> **Dependency**: extends the `./transport-otlp` transport (Feature 007) and the
> trace-context model + emit-time normalization (Feature 008), **both shipped in
> v1.2.0**. This branch is cut from `main`; no stacking. The change is confined
> to `src/transport-otlp/` — no core/event-model edit.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Option + state scaffold and the pure helper skeleton so the feature
compiles. No runtime injection logic yet.

- [X] T001 [P] Add the optional field `injectTraceparent?: boolean` (default `false`, documented) to the `OtlpTransportOptions` interface and an `injectTraceparent: boolean` field to the `OtlpTransportState` interface in `src/transport-otlp/otlp-transport.ts` (type-only addition + state slot; runtime export surface unchanged) (TI-1, data-model.md).
- [X] T002 [P] Create `src/transport-otlp/traceparent-header.ts` as a compiling stub: export `type BatchTraceparentDecision`, `decideBatchTraceparent(events: ReadonlyArray<LogEvent>): BatchTraceparentDecision`, and `buildRequestHeaders(base: Readonly<Record<string,string>>, events: ReadonlyArray<LogEvent>, enabled: boolean): Readonly<Record<string,string>>` — pure, **type-only** import from `../api/types.js`, **no** `src/trace/` and **no** `@opentelemetry/*` import (TI-8, D2). Stub returns `{ inject: false }` / `base`.

**Checkpoint**: `npm run typecheck` passes; the option and helper symbols resolve.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared injection engine every story exercises — homogeneity
decision, header formatting, precedence, construction validation, and the
fail-safe delivery-path wiring. Pure + fail-closed.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T003 Implement the homogeneity decision in `decideBatchTraceparent` (`src/transport-otlp/traceparent-header.ts`): derive a per-event key from the already-normalized `event.context.trace` — `none` when absent **or structurally-invalid** (defensive guard: a present `context.trace` whose `traceId` is not 32 lowercase-hex non-zero, or `spanId` not 16 lowercase-hex non-zero, → `none` and is never formatted into a header — belt-and-suspenders for events that reach the transport without passing emit-time normalization), else `` `${traceId}-${spanId}-${(traceFlags ?? 0) & 0xff}` ``; return `{ inject: true, traceparent }` **iff** the batch is non-empty and the key set is exactly one non-`none` value, else `{ inject: false }`. Format `traceparent` as `` `00-${traceId}-${spanId}-${flagsHex}` `` with `flagsHex = ((traceFlags ?? 0) & 0xff).toString(16).padStart(2,'0')` (TI-3/TI-4, D3/D6, data-model.md key rules).
- [X] T004 Extend `decideBatchTraceparent` with `tracestate`: when `inject` is true, include `tracestate` **iff** every event carries the same defined `traceState` string with `length ≤ 512` (defensive re-check of the upstream bound); otherwise omit `tracestate` while keeping `traceparent` (TI-5, D4).
- [X] T005 Implement `buildRequestHeaders` (`src/transport-otlp/traceparent-header.ts`): when `enabled` is false or the decision is `{ inject: false }`, return the **same** `base` reference (no allocation, byte-identical request); otherwise return `{ traceparent, ...(tracestate ? { tracestate } : {}), ...base }` so consumer-supplied `base` headers are spread **last** and win on any collision (TI-6, D5).
- [X] T006 Add `injectTraceparent` construction validation in `validateOptions` (`src/transport-otlp/otlp-transport.ts`): if `options.injectTraceparent` is defined and not a boolean, throw a `TypeError` synchronously (the only legal throw site, TO-2); store `injectTraceparent: options.injectTraceparent ?? false` on the constructed `state` (TI-1).
- [X] T007 Wire injection into `flushBatch` (`src/transport-otlp/otlp-transport.ts`): after `body = encode(serializeBatch(events, …))`, compute `const headers = buildRequestHeaders(state.headers, events, state.injectTraceparent)` inside a `try/catch` that falls back to `state.headers` on any throw, then pass `headers` (not `state.headers`) to `deliver(state.endpoint, headers, body)`. Add no new throw site to `send`/`flush`/`shutdown` (TI-7, D1/D8).

**Checkpoint**: engine compiles and is wired behind the option; typecheck passes.

---

## Phase 3: User Story 1 — Single-trace batch tags its delivery request (Priority: P1) 🎯 MVP

**Goal**: With injection enabled, a batch whose events all share one valid trace
context produces a delivery request bearing the matching `traceparent` header,
with event payloads + OTLP records unchanged.

**Independent Test**: Enable `injectTraceparent`, deliver a homogeneous-trace
batch, assert the outbound `fetch` carries `traceparent: 00-<traceId>-<spanId>-<flags>`
and the serialized body is identical to the disabled case.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T008 [P] [US1] Unit test `tests/unit/transport-otlp/traceparent-header.test.ts`: `decideBatchTraceparent` on a single-shared-trace batch → `{ inject: true, traceparent }` with the correct `00-…-…-<2hex>` string; `traceFlags` present → matching flags byte; `traceFlags` absent → `00`; uniform `traceState` present → included (TI-4/TI-5).
- [X] T009 [P] [US1] Contract test `tests/contract/transport-otlp-traceparent.contract.test.ts` (NEW): construct with `injectTraceparent: true`, deliver a homogeneous-trace batch through the transport with a stubbed `fetch`, assert the request `headers` carry the matching `traceparent` (and `tracestate` when uniform) and the request `body` equals the injection-disabled body (TI-3). Also assert construction validation (TI-1): `createOtlpTransport({ endpoint, injectTraceparent })` **throws `TypeError`** when `injectTraceparent` is defined and not a boolean, and succeeds when it is `true`/`false`/absent, while the subpath's runtime export set stays exactly `['createOtlpTransport']`.

### Implementation for User Story 1

- [X] T010 [US1] Add a `## Tag delivery requests with `traceparent`` subsection to `README.md` (under the existing OTLP/trace docs) and align `specs/009-traceparent-injection/quickstart.md`: show the one-line `injectTraceparent: true` opt-in, the resulting request header, and the carry-only/payload-unchanged notes — modeling safe usage (SC-007).

**Checkpoint**: MVP — an enabled, homogeneous batch tags its request; the engine from Foundational is exercised end-to-end.

---

## Phase 4: User Story 2 — Mixed / absent trace context never produces a misleading header (Priority: P1)

**Goal**: Empty, trace-less, heterogeneous, or malformed-input batches inject no
header (fail-closed), and nothing throws into the delivery path.

**Independent Test**: Deliver (a) two differing traces, (b) no trace, (c) empty,
(d) malformed/partial trace input; assert no `traceparent`/`tracestate` header in
any case, every batch still delivers, no throw.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T011 [P] [US2] Extend `tests/unit/transport-otlp/traceparent-header.test.ts`: `decideBatchTraceparent` → `{ inject: false }` for empty batch, all-untraced batch, two-differing-trace batch, and traced+untraced mix; with valid shared ids but **differing** `traceState` (or `traceState` > 512) → `{ inject: true }` carrying `traceparent` only (no `tracestate`) (TI-3/TI-5, edge cases).
- [X] T012 [P] [US2] Extend `tests/contract/transport-otlp-traceparent.contract.test.ts`: with `injectTraceparent: true`, delivering a mixed-trace / untraced / empty batch sets **no** `traceparent` header and the batch still delivers (TI-3).
- [X] T013 [P] [US2] Integration test `tests/integration/transport-otlp-traceparent-failure-safety.integration.test.ts` (NEW): feed events whose trace context is malformed/partial (directly supplied to the transport, bypassing emit-time normalization, to exercise the T003 defensive guard) and a batch whose decision path is forced to throw (stubbed) — assert no header is set, the batch still delivers via the keepalive path, and no call into `send`/`flush`/`shutdown` throws or rejects (TI-7, D8). Include a **pagehide/final-flush** case: a buffered homogeneous-trace batch flushed on `pagehide` injects the header by the same rules, and a malformed/heterogeneous one flushed on `pagehide` injects none — both without throwing on the unload path (spec Edge Cases).

### Implementation for User Story 2

- [X] T014 [US2] Confirm/finalize the fail-closed edge policy in `src/transport-otlp/traceparent-header.ts` against T011–T013 (flags included in the homogeneity key; `tracestate` dropped individually; `none`-vs-present never treated as homogeneous; defensive `try/catch` fallback in `flushBatch`); ensure the `traceparent-header.ts` and `flushBatch` code comments cite TI-3/TI-5/TI-7. No behavior beyond what the tests pin.

**Checkpoint**: US1 + US2 — injection is provably homogeneous-only and fail-closed.

---

## Phase 5: User Story 3 — Disabled by default; existing deliveries unchanged (Priority: P1)

**Goal**: With the option unset/`false`, OTLP deliveries are byte-identical to
pre-feature behaviour, and an injected header never overwrites a consumer header.

**Independent Test**: Deliver a valid homogeneous-trace batch with the option
unset and with `false`; assert no trace header is ever set and the request header
map equals `options.headers` (+ content-type); with a consumer-supplied
`traceparent`, assert the consumer value wins.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T015 [US3] Extend `tests/contract/transport-otlp-traceparent.contract.test.ts`: with `injectTraceparent` unset AND with `false`, delivering a homogeneous-trace batch sets no `traceparent`/`tracestate` header and the header map passed to `fetch` is byte-identical to the pre-feature baseline (same reference semantics: equals `options.headers` merged with content-type) (TI-2). (Same file as T016 — edit sequentially.)
- [X] T016 [US3] Extend `tests/contract/transport-otlp-traceparent.contract.test.ts`: with `injectTraceparent: true` and a consumer `options.headers` that already contains `traceparent` (and an `authorization` secret), assert the **consumer** `traceparent` wins (injection does not overwrite), the `authorization` value is untouched, and `state.headers` is not mutated across deliveries (TI-6). (Same file as T015 — edit sequentially.)

### Implementation for User Story 3

- [X] T017 [US3] Confirm the disabled/non-homogeneous path in `buildRequestHeaders` returns the same `base` reference (no per-flush allocation) and that `flushBatch` passes through unchanged when disabled; add a brief inline note that the default-off path is byte-identical (TI-2, D5).

**Checkpoint**: All three P1 stories independently functional; default-off proven byte-identical.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 Security/privacy test `tests/security/transport-otlp-traceparent-privacy.security.test.ts` (NEW): put a secret in `options.headers` (auth) and in a consumer `traceState`-adjacent field; assert (a) no `options.headers` value is overwritten/duplicated/exposed by injection, (b) no injected/consumer header value appears in `onInternalError` notices, thrown errors, serialized records, or the request body, (c) `tracestate` is bounded ≤ 512, and (d) the injected request carries **no** event field, attribute, or context value other than the trace identifiers + bounded `tracestate` — i.e. the only headers added beyond `options.headers` + content-type are `traceparent`/`tracestate` (TI-6, FR-008/FR-009).
- [X] T019 Build and measure `dist/transport-otlp.mjs` + `.cjs` gz sizes; confirm within the recorded budget in `tests/security/transport-otlp-bundle-shape.security.test.ts` and re-baseline that **single** budget constant only if the measured size requires it (record the measured value in the test + research D7); confirm the vendor scan still finds no `@opentelemetry/`/vendor identifier; confirm `dist/index.*`, `dist/transport-beacon.*`, and the `./testing` bundle show **zero** delta via `scripts/ci/bundle-invariance-check.sh` (no core touch) (TI-8, SC-004).
- [X] T020 Add a CHANGELOG entry in `CHANGELOG.md` under the next release heading (additive `./transport-otlp` `injectTraceparent` option; homogeneous-only, fail-closed, off-by-default; no change for disabled deliveries or event payloads).
- [X] T021 Security & Privacy + Log-integrity validation pass: confirm carry-only (no id minting), fail-closed homogeneity, `tracestate` bound, no auth/secret collision via the header, and that header presence/absence rules are documented (spec §Security/§Log Integrity; FR-009/FR-010).
- [X] T022 Lightweight & federated validation pass: re-run `tests/performance/transport-otlp-logger-cost.perf.test.ts` and the host/module integration test unchanged; confirm this feature adds no per-`Logger` cost and the per-batch decision is O(batch) on the single configured instance (TI-9, FR-011).
- [X] T023 Reproducible Verification & Mechanical Enforcement pass: walk the plan's gate→enforcement map; confirm each gate runs via `npm run build/typecheck/test/lint/format:check` identically local + CI and is guarded by its named test; confirm `tests/` meets `src/` standards; file a remediation task for any unenforced gate (expected: none).
- [X] T024 Run `specs/009-traceparent-injection/quickstart.md` end-to-end against the built package (capture the outbound request for an enabled homogeneous batch; verify the documented `traceparent`/`tracestate` headers and unchanged body) and fix any drift.
- [X] T025 Full-suite invariance check: `npm run build && npm run typecheck && npm test` on Node 20 + 22 — zero regressions vs. the pre-feature suite (only this feature's added tests as deltas); `dist/transport-otlp.mjs` `@opentelemetry`-free and within budget; default / `./testing` / `./transport-beacon` bundles byte-unchanged (±1 KiB); lint + format clean.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** → no deps; start immediately.
- **Phase 2 Foundational** → after Setup; BLOCKS all stories (the option +
  decision + formatting + precedence + validation + wiring are the shared engine
  every story exercises).
- **Phase 3 — US1 (P1, MVP)** → after Foundational.
- **Phase 4 — US2 (P1)** → after Foundational (exercises the omit/fail-closed
  branches of the same engine); independent of US1.
- **Phase 5 — US3 (P1)** → after Foundational (exercises the disabled/precedence
  paths); independent of US1/US2.
- **Phase 6 Polish** → after all three stories (bundle measurement + validation
  passes need the final code in place).

### Story independence notes

- US1 is the independently shippable MVP. US2 and US3 add no new engine code —
  they pin the omit/fail-closed and default-off/precedence branches with tests and
  confirm the foundational implementation. All three share
  `src/transport-otlp/traceparent-header.ts` and the one new contract test file,
  so run them sequentially (US1 → US2 → US3) to avoid same-file conflicts.

### Within each story

- Tests written and FAILING before implementation/confirmation (Constitution §V).
- Foundational engine (decision → format → tracestate → precedence → validation →
  wiring) before any story.

---

## Parallel Opportunities

- **Setup**: T001 ∥ T002 (distinct files).
- **Foundational**: T003 → T004 (same file, sequential); T005 (same file, after
  T003/T004); T006 ∥ wiring prep; T007 depends on T005+T006. Practically: T003 →
  T004 → T005, then T006 ∥, then T007.
- **US1 tests**: T008 ∥ T009 (distinct files). **US2 tests**: T011 ∥ T012 ∥ T013.
  **US3 tests**: T015 → T016 (same file — sequential, not parallel).
- **Polish**: T018 ∥ T020 (distinct files); T019 then T025 (T025 reads the final
  build); validation passes T021–T024 sequential.

---

## Parallel Example: User Story 1 tests

```bash
# Launch US1 tests together (distinct files, expected to FAIL first):
Task: "Helper unit (inject path + format) in tests/unit/transport-otlp/traceparent-header.test.ts"
Task: "Contract inject path in tests/contract/transport-otlp-traceparent.contract.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE**
   (an enabled homogeneous batch tags its request; payload + OTLP records
   unchanged; subpath bundle stays vendor-neutral).

### Incremental delivery

US1 (inject, MVP) → US2 (fail-closed homogeneity) → US3 (default-off + no
overwrite) → Polish (security test + bundle measure + validation). Each story
keeps the suite + bundles invariant; commit per-task (DCO `Signed-off-by`).

---

## Notes

- Zero new runtime dependencies — the header builder is hand-written and pure.
  No `@opentelemetry/*` and no `src/trace/` import reaches the `./transport-otlp`
  bundle (the helper reads the already-normalized plain field) (TI-8, D2).
- This feature is **transport-only**: nothing under `src/` outside
  `src/transport-otlp/` changes, so the default / `./testing` /
  `./transport-beacon` bundles are byte-unchanged — no core re-baseline (D7).
- No tolerated test relaxations are planned. If one becomes necessary, record a
  written, named, time-bound removal condition here (Constitution §V/§VIII).
- Commit after each task or logical group; DCO `Signed-off-by` required.
