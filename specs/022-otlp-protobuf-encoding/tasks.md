# Tasks: OTLP Protobuf Encoding

**Input**: Design documents from `/specs/022-otlp-protobuf-encoding/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED. Every change that affects public API, runtime behavior,
failure handling, wire format, or bundle size MUST include contract, unit, integration,
and security coverage.

**Organization**: Tasks are grouped by user story to enable independent implementation
and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Source: `src/transport-otlp/`
- Tests: `tests/`, organized as `tests/unit/transport-otlp/`, `tests/contract/`,
  `tests/security/`, `tests/integration/`
- Spec docs: `specs/022-otlp-protobuf-encoding/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure the feature directory and baseline state are correct

- [ ] T001 Copy `.specify/templates/plan-template.md` to `specs/022-otlp-protobuf-encoding/plan.md` — already done, verify contents match the filled plan
- [ ] T002 [P] Verify existing test suite passes before any changes: `npm run build && npm run typecheck && npm test` with zero regressions from the Feature 007 baseline
- [ ] T003 [P] Record current `dist/transport-otlp.mjs` gzipped size as the pre-feature baseline (current budget: 5120 B) for later comparison

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The protobuf encoder itself — needed by ALL user stories. No story can
begin until the encoder is testable.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement `src/transport-otlp/otlp-protobuf-encoder.ts` — the hand-built OTLP protobuf wire format encoder. Must implement: (a) varint encoding (unsigned 32/64-bit, base-128); (b) field tag encoding `(field_number << 3) | wire_type` for wire types 0=varint, 1=fixed64, 2=length-delimited, 5=fixed32; (c) message encoding for `LogsData` → `ResourceLogs` → `ScopeLogs` → `LogRecord` hierarchy; (d) `AnyValue` oneof encoding per PE-5; (e) `KeyValue` message encoding per PE-4; (f) zero-value/empty/undefined field omission per proto3; (g) trace ID hex-to-binary decoding (16 bytes for traceId, 8 bytes for spanId). Zero dependencies; total over `OtlpLogsRequest`; never throws. Depends on R1, R5 research decisions.
- [ ] T005 [P] Create `tests/unit/transport-otlp/otlp-protobuf-encoder.test.ts` — unit tests for: (a) varint encoding edge cases (0, 1, 127, 128, 16383, max uint32/uint64); (b) field tag encoding correctness for each wire type; (c) message encoding round-trip: encode a known `OtlpLogsRequest` → decode with a reference protobuf parser → verify field-by-field equivalence; (d) `AnyValue` encoding for every `AttributeValue` variant (string, bool, int, double, null, array, object); (e) trace ID hex-to-binary round-trip; (f) zero-value omission (empty string, 0, false, undefined, empty array produce omitted fields); (g) empty batch produces valid minimal `LogsData` with zero `logRecords`. Depends on T004.
- [ ] T006 [P] Create golden test files at `tests/fixtures/otlp-protobuf-golden/` — generate known-correct OTLP protobuf binary payloads for a reference set of `OtlpLogsRequest` inputs. Include: (a) single event with all fields populated; (b) batch of 3 events with varying severity levels; (c) event with trace context; (d) event with error (exception attributes); (e) event with nested array/object attributes; (f) empty batch. These golden files are the contract test reference — generated once, checked into the repo. Depends on R7 research decision.

**Checkpoint**: Protobuf encoder is implemented and unit-tested. All user stories can now begin.

---

## Phase 3: User Story 1 - Consumer opts into protobuf encoding (Priority: P1) 🎯 MVP

**Goal**: A developer sets `encoding: 'protobuf'` on `createOtlpTransport` options and
log events are delivered as valid OTLP protobuf binary with `Content-Type: application/x-protobuf`.

**Independent Test**: Create a transport with `encoding: 'protobuf'`, send events,
intercept the fetch body as binary, and decode against golden files — verifying correct
field tags, varint encoding, and wire format structure.

### Implementation for User Story 1

- [ ] T007 [US1] Add `OtlpEncoding` type (`'json' | 'protobuf'`) and `encoding` field to `OtlpTransportOptions` in `src/transport-otlp/otlp-transport.ts`. Default `'json'`. Add construction-time validation: any value other than `'json'` or `'protobuf'` throws `TypeError` with a message listing valid values. Store `encoding` in `OtlpTransportState`. Depends on T004.
- [ ] T008 [US1] Extend the encoding seam in `src/transport-otlp/otlp-serializer.ts`: (a) add `OtlpEncoding` type export; (b) change `encode()` signature from `(request: OtlpLogsRequest) => string` to `(request: OtlpLogsRequest, encoding: OtlpEncoding) => string | Uint8Array`; (c) when `encoding === 'protobuf'`, call the protobuf encoder and return `Uint8Array`; (d) when `encoding === 'json'`, behave identically to before (return `JSON.stringify` string). The `serializeBatch()` function is unchanged. Depends on T004, T007.
- [ ] T009 [US1] Wire the `encoding` option through `flushBatch` in `src/transport-otlp/otlp-transport.ts`: (a) pass `state.encoding` (resolved to non-undefined via default) to `encode()`; (b) pass the resulting body (`string | Uint8Array`) to `deliver()`; (c) the `maxRecordBytes` guard continues to use JSON measurement (conservative over-estimate per R6); (d) the `serialize_failed` notice path catches any protobuf encoding failure (defensive, should never fire). Depends on T007, T008.
- [ ] T010 [US1] Adapt `src/transport-otlp/delivery.ts` for binary body support: (a) change `body` parameter type from `string` to `string | Uint8Array`; (b) set `Content-Type` header dynamically — `application/json` for string body, `application/x-protobuf` for `Uint8Array` body; (c) the `fetch` call passes the body as-is (`fetch` natively supports `Uint8Array`). Note: the mandatory `content-type` override from configured headers is preserved — the dynamic Content-Type is applied as the base, then consumer headers override it. Depends on T009.
- [ ] T011 [US1] Update `src/transport-otlp/index.ts` if the `OtlpEncoding` type needs to be re-exported (it is already embedded in `OtlpTransportOptions` which is exported, so consumers access it via `OtlpTransportOptions['encoding']`). Verify the exported surface remains exactly `createOtlpTransport` + `OtlpTransportOptions` (TO-1). No new export name added. Depends on T007.

### Tests for User Story 1

- [ ] T012 [P] [US1] Extend `tests/contract/transport-otlp.contract.test.ts`: (a) verify `encoding: 'protobuf'` produces `Uint8Array` body with `Content-Type: application/x-protobuf`; (b) verify `encoding: 'json'` (default) produces `string` body with `Content-Type: application/json`; (c) verify invalid `encoding` value (e.g., `'xml'`) throws `TypeError` at construction time; (d) verify the encoding option is validated before any network/timer work (must throw synchronously). Depends on T011.
- [ ] T013 [P] [US1] Create `tests/integration/transport-otlp-protobuf.integration.test.ts`: (a) create a transport with `encoding: 'protobuf'`, send events, intercept the fetch body — verify it is a `Uint8Array`; (b) verify the fetch request has `Content-Type: application/x-protobuf`; (c) verify auth headers from `options.headers` are present and unchanged; (d) verify an empty batch produces a valid minimal protobuf payload (zero logRecords); (e) verify the transport's `send`/`flush`/`shutdown` lifecycle works identically to JSON path. Depends on T011.
- [ ] T014 [P] [US1] Add unit test in `tests/unit/transport-otlp/otlp-transport.test.ts` for the `encoding` option: (a) default is `'json'` when omitted; (b) `encoding: 'protobuf'` is accepted; (c) invalid value throws `TypeError`; (d) validation message mentions valid values. (Extend existing file or add to existing describe block.) Depends on T007.

**Checkpoint**: Consumer can opt into protobuf. Events are delivered as valid OTLP protobuf binary with correct Content-Type. JSON path is unchanged.

---

## Phase 4: User Story 2 - Bundle budget integrity (Priority: P2)

**Goal**: The protobuf encoder stays within a documented, enforced bundle size budget.
No `@opentelemetry/*` or vendor identifier leaks into the bundle.

**Independent Test**: Run `npm run build`, measure `dist/transport-otlp.mjs` gzipped
size, confirm it stays within the recorded budget. Run bundle-shape security test.

### Implementation for User Story 2

- [ ] T015 [US2] Run `npm run build`, measure the new gzipped size of `dist/transport-otlp.mjs`, and record it. Add a 10-15% headroom and update the `SIZE_LIMIT_BYTES` constant in `tests/security/transport-otlp-bundle-shape.security.test.ts` (cur: 5120 B). Document the new budget in the test file comment. Depends on T011 (all source changes must be in place).
- [ ] T016 [US2] Verify existing bundle baselines are within ±1 KiB: run `scripts/ci/bundle-invariance-check.sh` (or its PowerShell equivalent) and confirm `dist/index.mjs`, `dist/transport-beacon.mjs`, `dist/testing.mjs`, and any other tracked bundles are within ±1 KiB of their pre-feature baselines. If any bundle drifted, investigate and either fix or update the baseline (the ±1 KiB gate is per the existing CI contract). Depends on T015.
- [ ] T017 [US2] Run the existing `tests/security/transport-otlp-bundle-shape.security.test.ts` bundle scan: (a) verify `dist/transport-otlp.mjs` contains no `@opentelemetry/*` string; (b) verify no `protobufjs` or `protobuf-es` import; (c) verify no vendor identifier (`SeverityNumber`, `LogRecord`, `LoggerProvider`, etc.); (d) verify the source-import boundary over `src/transport-otlp/**` still holds (only `./…` + type-only `../api/types.js`). Note: this test already exists — it should pass with zero changes beyond the budget constant update. Depends on T015.

### Tests for User Story 2

- [ ] T018 [P] [US2] Add a bundle-shape assertion in `tests/security/transport-otlp-bundle-shape.security.test.ts` verifying the built `dist/transport-otlp.mjs` does NOT contain the string `protobufjs` (or any known protobuf library identifier). This is a proactive regression guard — the hand-built encoder must never be replaced with a library dependency. (If no feasible library string, verify the dependency-pins test still passes with zero runtime deps.) Depends on T015.

**Checkpoint**: Bundle budget recorded and enforced. No vendor identifiers in the bundle. Existing bundles within ±1 KiB.

---

## Phase 5: User Story 3 - Interoperability with JSON path (Priority: P3)

**Goal**: JSON and protobuf transports coexist, produce semantically equivalent output,
and the encoding is a clean serialization swap — no other behavior change.

**Independent Test**: Create two transports side-by-side (JSON and protobuf), send
identical events through both, and compare the decoded content.

### Tests for User Story 3

- [ ] T019 [P] [US3] Add semantic equivalence contract test in `tests/contract/transport-otlp.contract.test.ts`: (a) create JSON and protobuf transports with identical config; (b) send a batch of events spanning all severity levels, with attributes, context attributes, module identity, error (with stack), and trace context; (c) decode both outputs and compare: same log records count, same severity mapping, same attribute values, same trace IDs, same timestamps (within 1ms); (d) verify protobuf payload is smaller than JSON payload (SC-001: 30-60% reduction). Depends on T012.
- [ ] T020 [P] [US3] Add integration test for side-by-side transport coexistence: `tests/integration/transport-otlp-protobuf.integration.test.ts` — create two transports (JSON + protobuf) with different endpoints, send events through both, verify each delivers to its correct endpoint with correct Content-Type. Verify no shared state leaks between instances. Depends on T013.
- [ ] T021 [P] [US3] Add contract test for `serializeOtlpJson` backward compatibility: verify that calling `serializeOtlpJson(batch, fallbackTimeMs)` (the convenience function) still produces valid JSON identical to the pre-feature output. The convenience function's behavior MUST NOT change — it always produces JSON regardless of any `encoding` option. Depends on T008.

### Implementation for User Story 3

- [ ] T022 [US3] Verify the traceparent injection path (Feature 009) works identically with protobuf encoding: (a) set `injectTraceparent: true` with `encoding: 'protobuf'`; (b) send a batch with homogeneous trace context; (c) verify the `traceparent` and `tracestate` request headers are set correctly on the delivery request; (d) verify the headers are identical to the JSON path's headers for the same input. No code change expected — the `buildRequestHeaders` function reads from `event.context.trace`, not the serialized body. Depends on T011.

**Checkpoint**: JSON and protobuf paths are semantically equivalent. Side-by-side coexistence works. Traceparent injection works identically.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, changelog, verification, and final validation

- [ ] T023 [P] Update `README.md`: (a) mark the "OTLP/HTTP+protobuf" roadmap entry as shipped (this was added in T038 of Feature 007); (b) add a brief usage example showing `encoding: 'protobuf'` in the `./transport-otlp` section; (c) note the ~30-60% payload size reduction. Depends on T011.
- [ ] T024 [P] Add a `[Unreleased]` entry to `CHANGELOG.md`: "### Added — opt-in `encoding: 'protobuf'` option on `createOtlpTransport` for smaller OTLP payloads and wider collector compatibility. JSON remains the default. No new dependencies." Depends on T011.
- [ ] T025 Security & privacy validation pass: (a) verify the protobuf encoder does not embed any configured header/secret value in the serialized body; (b) run the existing `tests/security/transport-otlp-privacy.security.test.ts` — it should pass with zero changes (the protobuf path sends the same sanitized data as JSON); (c) verify `dist/transport-otlp.mjs` contains no `@opentelemetry/*` or vendor identifier per the existing bundle-shape test. Depends on T015.
- [ ] T026 Log integrity validation pass: verify that protobuf-encoded events, when decoded, have identical structure, severity mapping, origin attribution, and attribute ordering to JSON-encoded events. The drop/sample/batch behavior is identical to the JSON path and already documented in Feature 007. Depends on T019.
- [ ] T027 Lightweight-Logger & federated-runtime validation pass: verify that (a) creating a transport with `encoding: 'protobuf'` does not perform new per-instance work beyond the existing transport setup (no new timers, listeners, global patches, network work, or ambient reads); (b) `child()` / `withContext()` remain constant-cost regardless of transport encoding; (c) duplicate-package-copy classification remains **isolated** (two `createOtlpTransport` calls with different encodings do not interfere). The existing `tests/performance/transport-otlp-logger-cost.perf.test.ts` and host/module integration test should pass with zero changes. Depends on T011.
- [ ] T028 Verify the gated set in `.gitlab-ci.yml` (or equivalent CI config): confirm `tests/security/transport-otlp-bundle-shape.security.test.ts` is listed in the `dependency-pins` and `release-dependency-pins` jobs (already done in Feature 007 T037 — verify no regression). If `transport-otlp-protobuf.integration.test.ts` needs CI inclusion, add it. Depends on T013.
- [ ] T029 Run `npm run verify` (build + typecheck + lint + format:check + test + api:check) and confirm all gates pass: zero type errors, zero lint violations, zero test failures, zero format issues, API surface check passes. Depends on T011, T012, T013, T014, T015, T019, T020, T021.
- [ ] T030 Full-suite invariance check: run `npm run build && npm run typecheck && npm test` on Node 20 + 22 — confirm zero regressions across the full test suite. Existing test counts should increase only by this feature's new test files/cases. Existing bundles (`index`, `transport-beacon`, `testing`, `capture`, `dev-console`, `stacks`, `framework-react`, `framework-vue`) within ±1 KiB. Lint + format clean. Depends on T029.
- [ ] T031 Git commit all changes with a structured commit message: `feat: opt-in OTLP/HTTP+protobuf encoding behind the FR-015 encoding seam` with body referencing issue #20, the `encoding` option, zero new deps, and updated bundle budget. Include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer. Depends on T029, T030.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — MVP
- **User Story 2 (Phase 4)**: Depends on US1 (needs all source changes in place to measure bundle)
- **User Story 3 (Phase 5)**: Depends on US1 (needs protobuf path working to compare with JSON)
- **Polish (Phase 6)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P2)**: Depends on US1 completion (needs the full source tree to measure bundle)
- **US3 (P3)**: Depends on US1 completion (needs protobuf path working for semantic comparison)

### Within Each User Story

- Implementation tasks before test tasks (tests validate implemented behavior)
- Within implementation: types → seam → wiring → delivery
- Within US1 tests: [P] contract, integration, and unit tests can run in parallel after implementation

### Parallel Opportunities

- **Phase 2**: T005 [P] and T006 [P] can run in parallel after T004 (encoder impl)
- **Phase 3**: T012, T013, T014 are all [P] and can run in parallel after T011
- **Phase 5**: T019, T020, T021 are all [P] and can run in parallel
- **Phase 6**: T023, T024 are [P] and can run in parallel

---

## Parallel Example: User Story 1 Tests

```bash
# After T011 completes, launch all US1 tests in parallel:
Task: "Contract test encoding option + Content-Type in tests/contract/transport-otlp.contract.test.ts"
Task: "Integration test protobuf delivery in tests/integration/transport-otlp-protobuf.integration.test.ts"
Task: "Unit test encoding option validation in tests/unit/transport-otlp/otlp-transport.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (T004-T006 — encoder + unit tests + golden files)
3. Complete Phase 3: User Story 1 (T007-T014 — encoding option + seam + delivery + tests)
4. **STOP and VALIDATE**: Consumer can opt into protobuf, events deliver as valid OTLP binary
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Encoder ready
2. Add US1 → Protobuf encoding works end-to-end (MVP!)
3. Add US2 → Bundle budget recorded and enforced
4. Add US3 → Semantic equivalence verified, JSON backward compat confirmed
5. Polish → Docs, changelog, full-suite verification
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (implementation)
   - Developer B: User Story 1 (tests — T012, T013, T014 in parallel after impl)
3. After US1 complete:
   - Developer A: User Story 2 (bundle budget)
   - Developer B: User Story 3 (interop tests)
4. After US2 + US3:
   - Team completes Polish together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Tests validate implemented behavior (not TDD in this project — implementation first, then tests confirm)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The `npm run verify` script runs all gates identically locally and in CI
- Golden protobuf files in `tests/fixtures/` are checked into the repo — they are the reference truth
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
