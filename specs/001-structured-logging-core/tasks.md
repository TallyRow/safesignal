# Tasks: Core Structured Logging API

**Input**: Design documents from `/specs/001-structured-logging-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for this project. Every change that affects public API,
runtime behavior, failure handling, metadata, redaction, sanitization, or
environment-sensitive configuration MUST include contract, integration, and unit
coverage.

**Organization**: Tasks are grouped by user story to enable independent
implementation and testing, with explicit review boundaries after each
security-sensitive milestone.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependency)
- **[Story]**: Which user story this task belongs to (`[US1]` ... `[US4]`)
- Every task includes exact file paths, an acceptance check, and whether it can run
  in parallel

## Path Conventions

- Runtime package source: `src/`
- Test suites: `tests/contract/`, `tests/integration/`, `tests/unit/`,
  `tests/security/`
- Consumer-facing docs/examples: `README.md`, `docs/`, `examples/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish package scaffolding, build/test configuration, and the runtime
and testing directories required by the plan.

- [ ] T001 Create package scaffolding in `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, and `src/` / `tests/` directories
  Acceptance: Build and test scripts exist for runtime, contract, integration, unit, and security suites with browser-safe defaults.
  Parallel: No

- [ ] T002 [P] Create entrypoint and export scaffolding in `src/index.ts`, `src/testing/index.ts`, and `src/internal/telemetry/index.ts`
  Acceptance: Root and `./testing` subpath entrypoints exist without exposing internal telemetry files from the package root.
  Parallel: Yes

- [ ] T003 [P] Create test harness helpers in `tests/helpers/event-fixtures.ts`, `tests/helpers/failing-transport.ts`, and `tests/helpers/assert-no-unhandled.ts`
  Acceptance: Reusable helpers exist for secret fixtures, failing transports, and no-throw/unhandled-rejection assertions used across later suites.
  Parallel: Yes

- [ ] T004 [P] Create documentation scaffolding in `README.md`, `docs/safe-logging.md`, `examples/basic.ts`, and `examples/federated-module.ts`
  Acceptance: Consumer docs/example placeholders exist for later safe-logging guidance without normalizing insecure patterns.
  Parallel: Yes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared package contracts and internal structure that MUST be
complete before user story work can proceed safely.

**⚠️ CRITICAL**: No user story work should begin until this phase is complete.

- [ ] T005 Define public types and bounded input contracts in `src/api/types.ts`
  Acceptance: `Logger`, `LogLevel`, `LogEvent`, `LogContext`, `Attributes`, `AttributeValue`, `LoggerConfig`, `Transport`, `Redactor`, and sanitizer-limit types match the design docs and avoid raw `unknown` payloads outside `logger.error(..., error?)`.
  Parallel: No

- [ ] T006 [P] Implement environment defaults and config normalization in `src/config/defaults.ts` and `src/config/normalize-config.ts`
  Acceptance: Unknown or missing environment resolves to `warn`, sanitizer limits clamp to documented bounds, and no ambient browser or build globals are read.
  Parallel: Yes

- [ ] T007 [P] Implement context merge utilities in `src/context/merge-context.ts` and `src/context/correlation.ts`
  Acceptance: Root config, logger context, child logger context, and per-emit correlation merge deterministically with base-context failure isolation.
  Parallel: Yes

- [ ] T008 [P] Implement telemetry abstraction boundaries in `src/internal/telemetry/backend.ts`, `src/internal/telemetry/noop-backend.ts`, and `src/internal/telemetry/otel/otel-backend.ts`
  Acceptance: Internal backend interface exists with noop fallback and no public export path for OpenTelemetry-specific names or types.
  Parallel: Yes

- [ ] T009 [P] Implement transport wrappers and built-ins in `src/transport/safe-transport.ts`, `src/transport/console-transport.ts`, and `src/transport/noop-transport.ts`
  Acceptance: Safe transport isolation, console transport, and noop transport exist with fire-and-forget semantics and immutable-event expectations.
  Parallel: Yes

- [ ] T010 Add foundational contract coverage in `tests/contract/public-api-contract.test.ts`, `tests/contract/logger-config-contract.test.ts`, and `tests/contract/declarations-surface.test.ts`
  Acceptance: Tests fail if public types drift, unsafe ambient env reads appear, or OpenTelemetry identifiers leak into published declarations or root exports.
  Parallel: No

- [ ] T011 Review boundary: validate public API shaping and package/internal separation using `src/api/`, `src/config/`, `src/internal/telemetry/`, and `tests/contract/`
  Acceptance: Review confirms the safe public contract is bounded, internal telemetry remains hidden, and the package root exports only approved runtime and testing surfaces.
  Parallel: No

**Checkpoint**: Public API and foundational boundaries are ready for story work.

---

## Phase 3: User Story 1 - Emit Structured Application Logs (Priority: P1) 🎯 MVP

**Goal**: Deliver the stable, structured, browser-safe public logger API with
production-safe defaults and bounded contextual input.

**Independent Test**: A consumer can configure the package, create loggers, emit
`debug`/`info`/`warn`/`error` events with structured attributes, and observe
consistent `LogEvent` output without using internal APIs.

- [ ] T012 [US1] Implement logger factories and root configuration flow in `src/api/logger.ts`
  Acceptance: `configureLogging()`, `createLogger()`, and `getRootLogger()` produce stable logger instances with safe defaults before and after configuration.
  Parallel: No

- [ ] T013 [P] [US1] Implement event building and level filtering in `src/pipeline/event-builder.ts` and `src/pipeline/level-filter.ts`
  Acceptance: Canonical events receive package-assigned timestamps, level-based dropping, separated `attributes` vs `context`, and no consumer-controlled `timestamp`.
  Parallel: Yes

- [ ] T014 [US1] Wire the core emit path in `src/api/logger.ts`, `src/pipeline/dispatcher.ts`, and `src/index.ts`
  Acceptance: Logger methods route through the internal pipeline and backend/transport boundary without exposing internal types or requiring consumers to change call-site shape by environment.
  Parallel: No

- [ ] T015 [US1] Add contract tests for the public logger surface in `tests/contract/public-api-contract.test.ts` and `tests/contract/log-event-contract.test.ts`
  Acceptance: Tests verify method presence, message-string-only API behavior, package-assigned timestamps, structured `attributes`, separated `context`, and environment-aware level defaults.
  Parallel: No

- [ ] T016 [US1] Add negative API-shaping tests in `tests/contract/public-api-contract.test.ts` and `tests/unit/event-builder.test.ts`
  Acceptance: Tests fail if arbitrary raw payload APIs are introduced, `timestamp` from consumer input is honored, or per-call `attributes` bleed into `context.attributes`.
  Parallel: No

- [ ] T017 [US1] Add browser-runtime integration coverage in `tests/integration/structured-logging-flow.test.ts`
  Acceptance: Integration test proves emit calls remain synchronous and non-throwing across all levels with `warn`/`error` as the default production baseline.
  Parallel: No

- [ ] T018 [US1] Update basic consumer docs in `README.md` and `examples/basic.ts`
  Acceptance: Docs show structured logging with intentional fields, avoid raw object dumping, and explain safe production defaults without mentioning internal telemetry.
  Parallel: No

- [ ] T019 Review boundary: validate API safety defaults and bounded context entry in `src/api/`, `src/pipeline/`, `README.md`, and `tests/contract/`
  Acceptance: Review confirms the public logger API steers consumers toward structured input and does not create an unsafe arbitrary-context easy path.
  Parallel: No

**Checkpoint**: User Story 1 is independently functional and safe-by-default at the
public API layer.

---

## Phase 4: User Story 2 - Configure Safe Delivery Behavior (Priority: P2)

**Goal**: Deliver safe dispatch, transport isolation, transport contract enforcement,
and package-level guarantees for future application-owned ingestion.

**Independent Test**: A consumer can swap or remove transports without changing logger
call sites, and failures in backend or transport behavior do not break host
application behavior.

- [ ] T020 [US2] Implement dispatcher fallback and backend failure isolation in `src/pipeline/dispatcher.ts` and `src/internal/telemetry/noop-backend.ts`
  Acceptance: Backend init/handle failures fall back safely, preserved events still reach surviving transports, and no error escapes logger call sites.
  Parallel: No

- [ ] T021 [P] [US2] Implement transport contract test helpers in `src/testing/assert-transport-contract.ts` and `src/testing/make-secret-fixture.ts`
  Acceptance: `./testing` helpers can verify HTTPS/body-only delivery, immutable events, and absence of event data in URL paths, query strings, or fragments.
  Parallel: Yes

- [ ] T022 [US2] Add transport contract and multi-transport tests in `tests/contract/transport-contract.test.ts` and `tests/integration/transport-failure-isolation.test.ts`
  Acceptance: Tests verify safe transport wrapping, one-transport-fails/others-survive semantics, noop fallback, and transport replacement without call-site changes.
  Parallel: No

- [ ] T023 [US2] Add negative secure-transport tests in `tests/contract/transport-contract.test.ts`
  Acceptance: Tests fail when a transport sends event data via URL/query/fragment, mutates received events, or depends on sync throw propagation for control flow.
  Parallel: No

- [ ] T024 [US2] Document transport-boundary security requirements in `README.md`, `docs/safe-logging.md`, and `examples/basic.ts`
  Acceptance: Consumer guidance explicitly requires body-based delivery and avoids normalizing unsafe URL-based ingestion examples or backend-specific assumptions.
  Parallel: No

- [ ] T025 Review boundary: validate structured output and transport-prep behavior in `src/transport/`, `src/testing/`, `tests/contract/`, and `docs/`
  Acceptance: Review confirms package-level transport guarantees are testable and future ingestion guidance stays package-centric rather than backend-specific.
  Parallel: No

**Checkpoint**: User Story 2 is independently functional with safe transport and
failure-isolation behavior.

---

## Phase 5: User Story 3 - Protect Sensitive Data in Log Events (Priority: P3)

**Goal**: Deliver enforced sanitization, URL scrubbing, redaction, control-character
protection, and fail-closed handling for sensitive or unsafe input.

**Independent Test**: A consumer can emit events containing tokens, credentials,
session identifiers, nested sensitive values, URL-derived secrets, arbitrary
objects, or untrusted strings and observe bounded, sanitized, redacted output or
safe event dropping.

- [ ] T026 [US3] Implement safe normalization and bounded serialization in `src/pipeline/sanitizer.ts` and `src/pipeline/url-scrubber.ts`
  Acceptance: Strings, arrays, plain objects, errors, URLs, cyclic references, class instances, DOM/framework objects, and oversize input normalize to the documented safe shapes without throwing.
  Parallel: No

- [ ] T027 [US3] Add sanitization and unsafe-object tests in `tests/unit/sanitizer.test.ts` and `tests/security/arbitrary-object-sanitization.test.ts`
  Acceptance: Tests verify truncation, max-depth/count markers, class-instance type tagging, DOM/framework tagging, unsafe getter avoidance, and prevention of full application-state dumping.
  Parallel: No

- [ ] T028 [US3] Implement default redaction and nested sensitive-data handling in `src/pipeline/redactor.ts`
  Acceptance: Built-in redaction covers documented sensitive keys and shape-based matches across attributes, context, message, and serialized error data after sanitization.
  Parallel: No

- [ ] T029 [US3] Add redaction and leakage-prevention tests in `tests/contract/redaction-contract.test.ts` and `tests/security/secret-redaction.test.ts`
  Acceptance: Tests cover nested tokens, credentials, session identifiers, authorization values, cookies, and query-derived secrets, and prove transports never see unredacted events.
  Parallel: No

- [ ] T030 [US3] Implement control-character escaping and output-safety guardrails in `src/pipeline/control-char-guard.ts` and `src/transport/console-transport.ts`
  Acceptance: String fields are escaped before delivery, console transport preserves structured object output, and no package path relies on raw string concatenation for event output.
  Parallel: No

- [ ] T031 [US3] Add log-injection and untrusted-input resistance tests in `tests/security/log-injection-resistance.test.ts` and `tests/unit/control-char-guard.test.ts`
  Acceptance: Tests prove untrusted newlines/control characters cannot forge downstream records and that message interpolation remains a discouraged pattern in package output.
  Parallel: No

- [ ] T032 [US3] Implement fail-closed redaction and secure pipeline error handling in `src/pipeline/dispatcher.ts`, `src/pipeline/redactor.ts`, and `src/pipeline/control-char-guard.ts`
  Acceptance: Redactor or secure-output failures drop the affected event, invoke `onInternalError`, and never leak partially processed data downstream.
  Parallel: No

- [ ] T033 [US3] Add failure-safety and secure-handling tests in `tests/contract/failure-safety-contract.test.ts` and `tests/security/fail-closed-redaction.test.ts`
  Acceptance: Tests cover throwing redactors, malformed inputs, failed secure-handling stages, no unhandled rejections, and continued host-app safety under repeated failures.
  Parallel: No

- [ ] T034 [US3] Update safe-logging docs and examples in `README.md`, `docs/safe-logging.md`, and `examples/basic.ts`
  Acceptance: Documentation demonstrates safe structured logging, `scrubUrl()` usage, explicit field extraction from rich objects, and forbids insecure examples involving raw auth/session data or full state dumps.
  Parallel: No

- [ ] T035 Review boundary: validate sanitization, redaction, and injection-resistance milestones in `src/pipeline/`, `tests/security/`, and `docs/safe-logging.md`
  Acceptance: Review confirms the security boundary is implemented in the right pipeline order and backed by direct negative tests for leakage and log-forging risks.
  Parallel: No

**Checkpoint**: User Story 3 is independently functional with enforced secure
logging behavior.

---

## Phase 6: User Story 4 - Distinguish Context Across Host and Module Boundaries (Priority: P4)

**Goal**: Deliver deterministic context propagation and origin attribution across host
apps and independently deployed modules without weakening the security posture.

**Independent Test**: Host and module consumers can emit logs through the same package
contract and receive distinguishable, sanitized, redacted context in emitted events.

- [ ] T036 [US4] Implement child-logger and module-context propagation in `src/api/logger.ts` and `src/context/merge-context.ts`
  Acceptance: `child()` / `withContext()` merge context deterministically across application, module, environment, and correlation slots without mutating previous logger state.
  Parallel: No

- [ ] T037 [US4] Add host/module integration and context-boundary tests in `tests/integration/federated-context.test.ts` and `tests/unit/context-merge.test.ts`
  Acceptance: Tests verify origin attribution across host and module loggers, preserved separation of `context` from per-call `attributes`, and deterministic merge precedence.
  Parallel: No

- [ ] T038 [US4] Add negative context-safety tests in `tests/security/context-boundary-safety.test.ts`
  Acceptance: Tests fail when correlation or child context introduces unbounded objects, session identifiers, or query-derived secrets that bypass sanitization/redaction.
  Parallel: No

- [ ] T039 [US4] Update federated-usage docs in `docs/safe-logging.md` and `examples/federated-module.ts`
  Acceptance: Examples show safe module/application identity, correlation fields, and explicit avoidance of logging browser runtime internals or ambient secrets.
  Parallel: No

- [ ] T040 Review boundary: validate host/module context integrity and security preservation in `src/context/`, `tests/integration/`, and `examples/federated-module.ts`
  Acceptance: Review confirms origin attribution remains clear without creating a backdoor for unsafe context payloads.
  Parallel: No

**Checkpoint**: All user stories are independently functional and preserve the shared
security posture.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, packaging, and cross-story hardening before execution
closes.

- [ ] T041 [P] Add end-to-end secret sweep and stress coverage in `tests/integration/end-to-end-secret-sweep.test.ts` and `tests/security/no-throw-stress.test.ts`
  Acceptance: Full-pipeline tests exercise repeated mixed failures, secret fixtures, oversized inputs, and surviving transport delivery without host-app breakage.
  Parallel: Yes

- [ ] T042 [P] Validate quickstart and consumer documentation in `specs/001-structured-logging-core/quickstart.md`, `README.md`, and `docs/safe-logging.md`
  Acceptance: Quickstart and docs align with implemented APIs, safe defaults, secure transport guidance, and do not normalize insecure logging examples.
  Parallel: Yes

- [ ] T043 Final package audit in `package.json`, `src/index.ts`, `src/testing/index.ts`, and `tests/contract/`
  Acceptance: Build/export configuration, runtime/testing subpaths, and contract coverage match the approved public surface and final security guarantees.
  Parallel: No

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: Start immediately.
- **Phase 2 (Foundational)**: Depends on Phase 1 and blocks all story work.
- **Phase 3 (US1)**: Depends on Phase 2.
- **Phase 4 (US2)**: Depends on Phase 2; can proceed after US1 if shared logger wiring is stable.
- **Phase 5 (US3)**: Depends on Phase 2 and the core emit path from US1.
- **Phase 6 (US4)**: Depends on Phase 2 and benefits from the sanitized/redacted context behavior from US3.
- **Phase 7 (Polish)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: MVP; no dependency on later stories.
- **US2 (P2)**: Uses the core logger/dispatcher flow from US1 but remains independently testable once that flow exists.
- **US3 (P3)**: Builds the secure pipeline boundary on top of the core emit path; negative tests must land immediately after each security implementation task.
- **US4 (P4)**: Extends context/origin behavior and validates that host/module metadata still respects the secure pipeline.

### Review Boundaries

- After **T011**: Public API shaping and internal telemetry separation.
- After **T019**: Safe public logger API behavior and bounded context entry.
- After **T025**: Structured output and secure transport-prep behavior.
- After **T035**: Sanitization/redaction/injection-resistance boundary.
- After **T040**: Host/module context integrity under the shared security posture.

### Parallel Opportunities

- `T002`, `T003`, and `T004` can run together after `T001`.
- `T006` through `T009` can run in parallel once `T005` establishes the shared type contracts.
- `T021` can proceed while `T020` is being finalized because it targets the testing subpath.
- `T041` and `T042` can run together during the final phase.

---

## Parallel Example: User Story 2

```bash
# Work in parallel after the foundational phase and US1 core emit path:
Task: "T020 Implement dispatcher fallback and backend failure isolation in src/pipeline/dispatcher.ts and src/internal/telemetry/noop-backend.ts"
Task: "T021 Implement transport contract test helpers in src/testing/assert-transport-contract.ts and src/testing/make-secret-fixture.ts"
```

## Parallel Example: User Story 3

```bash
# Keep implementation and its related negative tests adjacent, but independent
# areas can still be staffed separately:
Task: "T026 Implement safe normalization and bounded serialization in src/pipeline/sanitizer.ts and src/pipeline/url-scrubber.ts"
Task: "T030 Implement control-character escaping and output-safety guardrails in src/pipeline/control-char-guard.ts and src/transport/console-transport.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1.
2. Complete Phase 2.
3. Complete Phase 3.
4. Stop at **T019** and review the public API boundary before expanding the
   security-sensitive pipeline.

### Incremental Delivery

1. Setup + Foundational → approve **T011** review boundary.
2. Add US1 → approve **T019** review boundary.
3. Add US2 → approve **T025** review boundary.
4. Add US3 → approve **T035** review boundary.
5. Add US4 → approve **T040** review boundary.
6. Run final validation tasks `T041`–`T043`.
