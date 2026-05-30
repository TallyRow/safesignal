---
description: "Task list for Feature 007 — OTLP Log Transport"
---

# Tasks: OTLP Log Transport

**Input**: Design documents from `/specs/007-transport-otlp/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/,
quickstart.md (all present)

**Tests**: REQUIRED. Every change to public API, runtime behavior, failure
handling, metadata, redaction, or transport delivery carries contract,
integration, unit, and security coverage (Constitution v1.3.0 §V/§VIII/§IX).

**Organization**: Grouped by user story. US1 + US2 are both P1 (US1 = happy-path
export = the MVP; US2 = fail-safe hardening of the same paths). US3 (P2) adds
authenticated backends; US4 (P3) covers federated/lightweight guarantees.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependencies)
- All paths are repository-root-relative.

## Reference map (contracts ↔ requirements)

- Public surface: `contracts/transport-otlp-public-api.md` TO-1..TO-9
- Wire payload: `contracts/otlp-payload.md` OP-1..OP-6
- Decisions: `research.md` D1..D10 · Shapes: `data-model.md`
- Enforcement table: `plan.md` → "Documented gate → enforcement map"

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build/export wiring so the new subpath compiles, builds, and is
resolvable. No runtime logic yet.

- [X] T001 Create the `src/transport-otlp/` directory and add the build entry `'transport-otlp': 'src/transport-otlp/index.ts'` to `tsup.config.ts` (additive; do not touch existing entries).
- [X] T002 Add the `./transport-otlp` entry (`types`/`import`/`require` → `./dist/transport-otlp.{d.ts,mjs,cjs}`) to the `exports` map in `package.json`, placed after `./transport-beacon` (TO-1).
- [X] T003 [P] Create the public entry stub `src/transport-otlp/index.ts` that re-exports `createOtlpTransport` (value) and `OtlpTransportOptions` (type-only) from `./otlp-transport.js` — exactly two names, nothing else (TO-1).

**Checkpoint**: `npm run build` emits `dist/transport-otlp.{mjs,cjs,d.ts}` once the factory lands; exports map resolves.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure, dependency-free building blocks every story needs. No
`@opentelemetry/*` import and no cross-subpath/internal-seam import anywhere in
`src/transport-otlp/**` (TO-7, research D1).

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T004 [P] Implement `src/transport-otlp/errors.ts`: the typed construction error class, the `OtlpFailureCode` union (`oversized_event` | `buffer_overflow` | `delivery_unavailable` | `send_failed` | `partial_rejection` | `serialize_failed` | `shutdown_failed`), and a rate-limited `notifyOnce(state, code, err)` helper that surfaces at most one notice per class per instance and NEVER includes header/secret values (data-model § OtlpFailureCode; FR-009/FR-010).
- [X] T005 [P] Implement `src/transport-otlp/endpoint-validation.ts`: `validateEndpoint(endpoint, allowInsecureLoopback): URL` mirroring beacon's rule — HTTPS always passes; `http://` only for `localhost`/`127.0.0.1`/`[::1]` under `allowInsecureLoopback`; else throw typed error naming the constraint + endpoint. Pure, no ambient reads (TO-5, research D8).
- [X] T006 [P] Unit test `tests/unit/transport-otlp/endpoint-validation.test.ts`: HTTPS pass, http loopback pass-with-flag, http non-loopback throw, non-http(s) scheme throw, non-string/garbage throw (TO-5). Write FIRST; must fail before T005 lands.
- [X] T007 [P] Define `OtlpTransportOptions` (public, type-only) with fields + defaults per data-model in `src/transport-otlp/otlp-transport.ts` (type only; factory body lands in US1), and the internal `OtlpTransportState` shape.

**Checkpoint**: Foundation ready — typecheck passes; user stories can begin.

---

## Phase 3: User Story 1 — Export logs to any OTLP backend (Priority: P1) 🎯 MVP

**Goal**: A configured OTLP transport delivers emitted events to an OTLP logs
endpoint as a valid, batched OTLP/HTTP+JSON payload with identity on the
Resource.

**Independent Test**: Configure against a captured `fetch`, emit events at each
level, assert the POST body is a conformant OTLP logs payload (severity, body,
timestamp, attributes) with a Resource derived from context.

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T008 [P] [US1] Unit test `tests/unit/transport-otlp/attributes.test.ts`: `AttributeValue` → OTLP `AnyValue` for string/bool/int/double/null/array/nested-object, total + non-throwing (OP-5).
- [X] T009 [P] [US1] Unit test `tests/unit/transport-otlp/resource.test.ts`: `LogContext` identity → Resource attributes (`service.name`/`service.version`/`deployment.environment`/`module.name`/`module.version`), absent fields omitted (OP-2, D3).
- [X] T010 [P] [US1] Unit test `tests/unit/transport-otlp/otlp-serializer.test.ts`: a `LogEvent` batch → `OtlpLogsRequest` — one `resourceLogs`/`scopeLogs`, scope name `@tallyrow/safesignal`, severity map 5/9/13/17 + texts, `timeUnixNano` = ms×1e6 string, body stringValue, error→`exception.*`, context attrs under `context.` prefix, unparseable timestamp falls back without throwing, input event not mutated (OP-1/OP-3/OP-4/OP-6, D2/D4).
- [X] T011 [P] [US1] Contract test `tests/contract/transport-otlp.contract.test.ts`: build a transport against a captured `fetch`, assert one POST per batch, `Content-Type: application/json`, body parses as a conformant OTLP logs request; assert batching coalesces N events into one request; **assert `navigator.sendBeacon` is stubbed and called 0 times** (FR-004 — delivery is `fetch`-only) (TO-3/TO-2, US1 scenarios 1–4).
- [X] T012 [P] [US1] Integration test `tests/integration/transport-otlp-host-module.integration.test.ts` (happy path slice): `configureLogging` + `createOtlpTransport` + `getLogger().info(...)` results in a captured OTLP request reaching the endpoint (quickstart scenario).
- [X] T013 [P] [US1] Bundle-shape security test `tests/security/transport-otlp-bundle-shape.security.test.ts` mirroring the beacon test: (a) source-import boundary over `src/transport-otlp/**` (only `./…` + type-only `../api/types.js`; forbid `../internal/`, `../runtime/`, `../pipeline/`, `../config/`, `../context/`, `../transport/`, `../internal/telemetry/otel/`, and any `@opentelemetry/*`); (b) `dist/transport-otlp.{mjs,cjs}` contains no `@opentelemetry/`/vendor identifier; (c) `dist/index.{mjs,cjs,d.ts}` contains no OTLP-subpath fingerprint; (d) `dist/transport-otlp.mjs` gz ≤ recorded budget (TO-7). Requires `npm run build`; `beforeAll` fails loudly if `dist/` is absent.

### Implementation for User Story 1

- [X] T014 [P] [US1] Implement `src/transport-otlp/attributes.ts`: pure recursive `toAnyValue(v: AttributeValue): AnyValue` + `toKeyValues(record): KeyValue[]` (OP-5).
- [X] T015 [P] [US1] Implement `src/transport-otlp/resource.ts`: `buildResource(context: LogContext): { attributes: KeyValue[] }` (OP-2, D3).
- [X] T016 [US1] Implement `src/transport-otlp/otlp-serializer.ts`: `serializeOtlpJson(batch: LogEvent[], context): string` building the `OtlpLogsRequest` and `JSON.stringify`-ing it; level→severity literals; timestamp conversion; error→`exception.*`; context-attr prefixing. Structure the JSON encoding behind a single internal `encode()` indirection so a future protobuf encoder is additive (FR-015, D1/D2/D4). Depends on T014, T015.
- [X] T017 [US1] Implement `src/transport-otlp/delivery.ts`: `deliver(endpoint, headers, body): Promise<DeliveryResult>` using `fetch(endpoint, { method:'POST', keepalive:true, headers:{'content-type':'application/json', ...headers}, body })`; classify 2xx / 2xx+partialSuccess / non-2xx / reject; return a result (no throw) (TO-2, D6). Happy-path (2xx) here; full failure classes hardened in US2.
- [X] T018 [US1] Implement `src/transport-otlp/batcher.ts`: bounded buffer flushing on `maxBatchSize` or `maxBatchAgeMs` (parallel copy of the beacon batcher shape — no cross-subpath import per TO-7), exposing `add(event)`, `flush()`, `clear()` (D7, data-model).
- [X] T019 [US1] Implement `createOtlpTransport` in `src/transport-otlp/otlp-transport.ts`: validate options + endpoint at construction (throw to caller), build `OtlpTransportState`, wire `send`/`flush`/`shutdown` over batcher → serializer → delivery; return a `Transport`. Happy path + construction validation (TO-2/TO-3). Depends on T004, T005, T007, T016, T017, T018.
- [X] T020 [US1] Wire `src/transport-otlp/index.ts` to the real factory (replace the T003 stub target) and run `npm run build`; record the measured `dist/transport-otlp.mjs` gz size and set the budget constant in T013's test (small headroom, beacon-style).
- [X] T021 [US1] Add the `## Ship logs to OTLP — ./transport-otlp subpath` section to `README.md` (host usage from quickstart; HTTPS-only; vendor-neutral), modeling safe structured logging.

**Checkpoint**: MVP — events export as conformant OTLP/HTTP+JSON; bundle is vendor-neutral and within budget; build green.

---

## Phase 4: User Story 2 — Failures never break the page (Priority: P1)

**Goal**: Every delivery failure mode drops safely (no retry), never throws/
rejects to the caller, and stays memory-bounded.

**Independent Test**: Drive the transport against reject/5xx/timeout/no-`fetch`/
oversized/over-cap/page-unload and assert zero caller-visible throws, zero
retries, bounded buffer, idempotent `flush`/`shutdown`; `assertTransportContract`
passes.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T022 [P] [US2] Contract test additions in `tests/contract/transport-otlp.contract.test.ts`: run `assertTransportContract(createOtlpTransport({ endpoint:'https://…' }))` end-to-end (T-S1..T-S5), and assert `send`/`flush`/`shutdown` never throw/reject (TO-3/TO-4).
- [X] T023 [P] [US2] Failure-injection integration test `tests/integration/transport-otlp-failure-safety.integration.test.ts`: non-2xx → `send_failed` + drop; rejected `fetch` → `send_failed` (+`.cause`); `fetch` undefined → `delivery_unavailable`; 2xx+`partialSuccess.rejectedLogRecords>0` → `partial_rejection`; serializer throw → `serialize_failed` + batch drop; event whose serialized record exceeds `maxRecordBytes` (64 KiB) → `oversized_event` drop (never sent); over-`maxBufferedEvents` → `buffer_overflow` drop; each notice rate-limited to one per class; NO retry observed (TO-4, D6/D7).
- [X] T024 [P] [US2] Unit test `tests/unit/transport-otlp/errors.test.ts`: `notifyOnce` emits once per class per instance and carries no header/secret value (FR-010).

### Implementation for User Story 2

- [X] T025 [US2] Harden `src/transport-otlp/delivery.ts` failure mapping: map every non-2xx/reject/partial-success/absent-`fetch` outcome to the right `OtlpFailureCode` via `notifyOnce`; guarantee `deliver` never throws (TO-4, D6).
- [X] T026 [US2] Harden `src/transport-otlp/otlp-transport.ts` + `batcher.ts`: wrap serialize in try/catch (`serialize_failed`, fail-closed drop); enforce the per-record `maxRecordBytes` guard (default 64 KiB) with an `oversized_event` drop before buffering; enforce the `maxBufferedEvents` cap with `buffer_overflow` drop; make `flush()`/`shutdown()` idempotent (`shutdownComplete` guard); ensure `send` after shutdown is a safe no-op (TO-4/T-S5, D7).
- [X] T027 [US2] Implement lazy `pagehide` best-effort flush in `src/transport-otlp/otlp-transport.ts`: install on first `send` only, `keepalive` flush on `pagehide`, uninstall on `shutdown`; never block unload; install path is idempotent (D7, US2 scenario 4; Principle VII — no work at `Logger` creation).

**Checkpoint**: US1 + US2 — provably fail-safe, bounded, no-retry export.

---

## Phase 5: User Story 3 — Authenticated backends without leaking secrets (Priority: P2)

**Goal**: Static auth headers reach the backend on the wire only, and never
appear in any record, payload, diagnostic, or the bundle.

**Independent Test**: Configure a header with a known secret fixture; assert it
appears in the outbound request headers but in no captured body/record/
diagnostic/error and no bundle byte.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T028 [P] [US3] Security/privacy test `tests/security/transport-otlp-privacy.security.test.ts`: configure `headers:{ 'x-api-key': <secret fixture> }`; assert the secret is present in the captured request headers, ABSENT from the request body + every serialized `LogRecord` + every `onInternalError` message/thrown error; and ABSENT from `dist/transport-otlp.{mjs,cjs}` (no hard-coded credential/default token/endpoint) (TO-6, FR-009).
- [X] T029 [P] [US3] Contract assertion in `tests/contract/transport-otlp.contract.test.ts`: with auth headers configured, `assertTransportContract` still passes (no event data in URL, body-only, HTTPS) (TO-3/TO-6).

### Implementation for User Story 3

- [X] T030 [US3] Wire `options.headers` through `src/transport-otlp/otlp-transport.ts` → `delivery.ts` so they are merged into the `fetch` request headers only; freeze/copy them into state; ensure no code path (serializer, `notifyOnce`, error messages) references `headers` (TO-6, FR-009).
- [X] T031 [US3] Add the authenticated-backend example to the `README.md` `./transport-otlp` section (API-key header, "sent only on the wire" note), modeling safe handling (no secret in sample output).

**Checkpoint**: US1–US3 — authenticated OTLP export with verified secret isolation.

---

## Phase 6: User Story 4 — Federated/host runtime composition (Priority: P3)

**Goal**: Constant-cost `Logger` creation/derivation; host owns the runtime;
duplicate-package-copy = isolated.

**Independent Test**: Create/derive many `Logger`s and assert no per-instance
timer/listener/socket/network; module logger doesn't replace host config;
duplicate copies don't cross-affect.

### Tests for User Story 4 ⚠️ (write first, ensure they FAIL)

- [X] T032 [P] [US4] Performance test `tests/performance/transport-otlp-logger-cost.perf.test.ts`: with an OTLP transport configured, creating N `Logger`s + `child()`/`withContext()` derivations triggers zero per-instance timers/listeners/`fetch`/`pagehide` installs and stays linear/bounded (Principle VII).
- [X] T033 [P] [US4] Integration test additions in `tests/integration/transport-otlp-host-module.integration.test.ts`: a federated module logger does not replace the host-configured transport; two independently-configured transport instances are isolated (no shared buffer/state) (TO-8, D9).

### Implementation for User Story 4

- [X] T034 [US4] Verify/confirm in `src/transport-otlp/otlp-transport.ts` that all expensive state (batcher, timers, pagehide, connection state) lives on the single transport instance and nothing is allocated per `Logger`; adjust if any test reveals per-instance work (Principle VII).
- [X] T035 [US4] Document host/module ownership + the **isolated** duplicate-package-copy classification in the `README.md` `./transport-otlp` section and `quickstart.md` (already drafted — reconcile wording with final behavior) (TO-8, D9).

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T036 Extend `scripts/ci/bundle-invariance-check.sh` to include `transport-otlp` in its compared bundle list (alongside `index` + `transport-beacon`) so the ±1 KiB gate covers the new bundle.
- [X] T037 Add `tests/security/transport-otlp-bundle-shape.security.test.ts` to the gated set in the `dependency-pins` and `release-dependency-pins` jobs in `.gitlab-ci.yml` (mirror how `transport-beacon-bundle-shape` is listed).
- [X] T038 Add the **protobuf** entry to the `## Roadmap` section of `README.md` (OTLP/HTTP+protobuf as an additive follow-up behind the encoding seam — FR-015).
- [X] T039 Add a `[1.x.0]` CHANGELOG entry for the additive `./transport-otlp` subpath in `CHANGELOG.md`.
- [X] T040 Security & Privacy validation pass: confirm upstream redaction is preserved (transport never re-opens events), auth headers fail-closed isolated, no new secret-leak path (re-run T028 + secret-scan); record result.
- [X] T041 Log-integrity validation pass: confirm OTLP records are stable/machine-parseable/origin-attributable and that drop/batch/no-retry behavior is documented (spec §Log Integrity, OP contract).
- [X] T042 Lightweight-`Logger` & federated-runtime validation pass: re-run T032 + T033; confirm the isolated duplicate-copy contract matches documented behavior.
- [X] T043 Reproducible Verification & Mechanical Enforcement pass: walk the plan's gate→enforcement map; confirm each gate runs via `npm run build/typecheck/test/lint/format:check/test:coverage` identically locally and in CI, is guarded by the named test/job, and `tests/` meets `src/` standards. Note: FR-015's encoding-seam structure is a **design/review constraint** (verified by code review of the `encode()` indirection in T016), not a runtime gate — record this explicitly so it isn't mistaken for an unenforced machine gate. File a remediation task for any other gate lacking enforcement (expected: none).
- [X] T044 Run `quickstart.md` end-to-end against the built package (verify the captured OTLP payload matches the documented example) and fix any drift.
- [X] T045 Full-suite invariance check: `npm run build && npm run typecheck && npm test` on Node 20 + 22 — the pre-feature suite (48 files / 1,088 passing / 10 todo) has **0 regressions / 0 failing**, with the only deltas being this feature's added test files/cases; existing bundles (`index`, `transport-beacon`, `testing`) within ±1 KiB; lint + format clean.

---

## Dependencies & Execution Order

### Phase dependencies

(“Phase N” = the section number below; story priorities are P1–P3 from spec.md.)

- **Phase 1 Setup** → no deps; start immediately.
- **Phase 2 Foundational** → after Setup; BLOCKS all stories.
- **Phase 3 — US1 (priority P1, MVP)** → after Foundational.
- **Phase 4 — US2 (priority P1)** → after US1 (hardens US1's delivery/transport/batcher files).
- **Phase 5 — US3 (priority P2)** → after US1 (extends delivery + transport wiring); independent of US2.
- **Phase 6 — US4 (priority P3)** → after US1 (verifies the instance-level state US1 builds); independent of US2/US3.
- **Phase 7 Polish** → after all desired stories.

### Story independence notes

- US1 is independently shippable (the MVP). US2/US3/US4 each layer onto US1's
  files; they are independently *testable* but share `otlp-transport.ts` /
  `delivery.ts`, so run them sequentially (US1 → US2 → US3 → US4) rather than in
  parallel to avoid same-file conflicts.

### Within each story

- Tests written and FAILING before implementation (Constitution §V).
- Pure modules (attributes, resource) before serializer; serializer + delivery +
  batcher before the factory; factory before index wiring + docs.

---

## Parallel Opportunities

- **Setup**: T003 ∥ (T001→T002 touch config files; keep sequential).
- **Foundational**: T004 ∥ T005 ∥ T006 ∥ T007 (distinct files).
- **US1 tests**: T008 ∥ T009 ∥ T010 ∥ T011 ∥ T012 ∥ T013 (distinct files).
- **US1 impl**: T014 ∥ T015 (pure modules), then T016, then T017 ∥ T018, then T019→T020→T021.
- **US2 tests**: T022 ∥ T023 ∥ T024. **US3 tests**: T028 ∥ T029. **US4 tests**: T032 ∥ T033.
- **Polish**: T036 ∥ T037 ∥ T038 ∥ T039 (distinct files); validation passes T040–T045 sequential.

---

## Parallel Example: User Story 1 tests

```bash
# Launch US1 tests together (all distinct files, all expected to FAIL first):
Task: "Unit test attributes → AnyValue in tests/unit/transport-otlp/attributes.test.ts"
Task: "Unit test resource mapping in tests/unit/transport-otlp/resource.test.ts"
Task: "Unit test serializer in tests/unit/transport-otlp/otlp-serializer.test.ts"
Task: "Contract test OTLP payload in tests/contract/transport-otlp.contract.test.ts"
Task: "Happy-path integration in tests/integration/transport-otlp-host-module.integration.test.ts"
Task: "Bundle-shape security in tests/security/transport-otlp-bundle-shape.security.test.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE**
   (events export as conformant, vendor-neutral, in-budget OTLP/HTTP+JSON).

### Incremental delivery

US1 (export, MVP) → US2 (fail-safe) → US3 (auth) → US4 (federated) → Polish.
Each story keeps the suite + bundles invariant and is committed per-task
(repo convention).

---

## Notes

- Zero new runtime dependencies — the OTLP-JSON serializer is hand-written; no
  `@opentelemetry/*` import anywhere in `src/transport-otlp/**` (TO-7, D1).
- No tolerated test relaxations are planned. If one becomes necessary, record a
  written, named, time-bound removal condition here (Constitution §V/§VIII).
- Commit after each task or logical group; DCO `Signed-off-by` required.
