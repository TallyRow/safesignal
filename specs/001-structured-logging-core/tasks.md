# Tasks: Core Structured Logging API

**Input**: Design documents from `/specs/001-structured-logging-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED. Per constitution v1.1.0 every change touching
public API, runtime behavior, failure handling, metadata, redaction,
sanitization, environment-sensitive configuration, transport security, or
integrity-relevant transformations MUST include contract, security, integration,
or unit coverage.

**Organization**: Tasks are grouped by user story (US1–US4) so each story is
independently testable. Review-boundary tasks gate each phase.

## Format: `[ID] [P?] [Story?] Description`

- `- [ ]` checkbox prefix
- Task ID is sequential (`T001`...)
- `[P]` = parallelizable (different files, no blocking dependency)
- `[Story]` = `[US1]` / `[US2]` / `[US3]` / `[US4]` for story-phase tasks
- Every task names exact file paths and an acceptance check

## Path Conventions

- Runtime source: `src/`
- Tests: `tests/contract/`, `tests/security/`, `tests/integration/`, `tests/unit/`
- Examples: `examples/host-app/`, `examples/federated-module/` (each is a
  standalone consumer project)
- Docs: `README.md`, `docs/safe-logging.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding, build/test configuration, source/test trees,
documentation skeletons.

- [X] T001 Create package scaffolding in `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `src/`, and `tests/` directories
  Acceptance: `package.json` declares browser-targeted ESM + CJS dual output via `tsup`, `sideEffects: false`, exports map exposes only `.` (root) and `./testing` subpaths, and Vitest is configured with `happy-dom`. `tsup.config.ts` injects a build-time global `__DEV__` via `define` (`true` for dev builds, `false` for production) — `__DEV__` is the only build-time flag the runtime code may consult, and the package source never reads `process.env`. `tsconfig.json` declares `__DEV__` in a `global.d.ts` so it is statically typed. Test scripts run all four suites (`contract`, `security`, `integration`, `unit`) and exit non-zero on missing coverage targets.
  Parallel: No

- [X] T002 [P] Create root and testing entrypoints in `src/index.ts` and `src/testing/index.ts`
  Acceptance: `src/index.ts` is the ONLY public runtime entry. `src/testing/index.ts` is reachable only via the `./testing` subpath of the `exports` map. Nothing under `src/internal/**` is re-exported from either entry.
  Parallel: Yes

- [X] T003 [P] Create shared test helpers in `tests/helpers/failing-transport.ts`, `tests/helpers/assert-no-unhandled.ts`, and `tests/helpers/event-fixtures.ts`
  Acceptance: Helpers expose a configurable throwing/rejecting transport, an unhandled-rejection assertion utility (browser + Node), and reusable `LogEvent` fixtures. Helpers do not import from `src/internal/**` or `@opentelemetry/*`.
  Parallel: Yes

- [X] T004 [P] Create documentation and example scaffolding in `README.md`, `docs/safe-logging.md`, `examples/host-app/`, and `examples/federated-module/`
  Acceptance: `README.md` and `docs/safe-logging.md` exist with section placeholders matching `quickstart.md`. Each example directory contains its own `package.json` and `index.ts` skeleton so the host-app and federated-module examples can be built independently.
  Parallel: Yes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared types, configuration, telemetry adapter
boundaries, transports, and contract-level guards required by every story.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T005 Define public types in `src/api/types.ts`
  Acceptance: Exports `Logger`, `LogLevel`, `LogEvent`, `LogContext`, `AppIdentity`, `ModuleIdentity`, `Attributes`, `AttributeValue`, `ErrorInfo`, `LoggerConfig`, `CreateLoggerOptions`, `LevelMap`, `SanitizerLimits`, `Transport`, `TransportFactory`, `Redactor`, `RedactionRule`, `ScrubUrlOptions`. `Attributes` is a recursive constrained union (no `unknown`/`object`). The only `unknown` parameter in the public surface is the optional `error` arg of `logger.error()`.
  Parallel: No

- [X] T006 [P] Implement environment defaults and config normalization in `src/config/config.ts` and `src/config/env-defaults.ts`
  Acceptance: Unknown/missing environment resolves to `warn`. `SanitizerLimits` values above documented Max clamp to Max and below Min clamp to Min, both emitting one `onInternalError` notice per `configureLogging()` call. The package never reads `process.env`, `import.meta.env`, `location`, or `document.cookie`.
  Parallel: Yes

- [X] T007 [P] Implement context identity and merge in `src/context/identity.ts` and `src/context/context-merge.ts`
  Acceptance: Merge precedence (`configureLogging.context` → `createLogger.context` → `logger.child` chain → `correlation()` return) is deterministic and tested at unit level. Shallow merge for `application`/`module`/`environment`, deep merge for `context.attributes`.
  Parallel: Yes

- [X] T008 [P] Implement internal error markers in `src/internal/errors/internal-errors.ts`
  Acceptance: A private symbol marker distinguishes package-internal errors from consumer-thrown errors so the dispatcher can route them via `onInternalError` without losing stack info.
  Parallel: Yes

- [X] T009 [P] Define the telemetry backend interface and noop backend in `src/internal/telemetry/backend.ts` and `src/internal/telemetry/noop-backend.ts`
  Acceptance: `TelemetryBackend` interface declares `init`, `handle`, `shutdown`. `NoopBackend` forwards events directly to transports and does NOT import `@opentelemetry/*`.
  Parallel: Yes

- [X] T010 [P] Implement the OTel adapter in `src/internal/telemetry/otel/otel-backend.ts`, `src/internal/telemetry/otel/event-bridge.ts`, and `src/internal/telemetry/otel/mapping.ts`
  Acceptance: All `@opentelemetry/*` imports live ONLY in these three files. `mapping.ts` exposes `toLogRecord(event)` and `fromLogRecord(record)`. `event-bridge.ts` is a `LogRecordProcessor` that converts records back to `LogEvent` and forwards to the configured transports. `otel-backend.ts` catches all init errors and reports them via `onInternalError` so `OtelLogsBackend` can fall back to `NoopBackend`.
  Parallel: Yes

- [X] T011 [P] Implement transport wrappers and built-ins in `src/transport/safe-transport.ts`, `src/transport/console-transport.ts`, and `src/transport/noop-transport.ts`
  Acceptance: `SafeTransport` catches sync throws and Promise rejections from any wrapped transport; emits one `onInternalError` per transport per session on first failure. `ConsoleTransport` calls `console[level](event.message, event)` (object as second arg, never interpolated) and falls back to `console.log(event.message, event)` only when `console[level]` is not a function. `NoopTransport` is a silent fire-and-forget.
  Parallel: Yes

- [X] T012 Reserve transport bridges directory in `src/transport/bridges/.gitkeep`
  Acceptance: Empty placeholder directory exists so the future application/platform ingestion adapters have a documented home without exporting anything in v1.
  Parallel: No

- [X] T013 Add declaration-surface and ambient-state guard tests in `tests/contract/declarations-surface.test.ts` and `tests/contract/no-ambient-state.test.ts`
  Acceptance: `declarations-surface.test.ts` fails if generated `.d.ts` contains the strings `opentelemetry` or `@opentelemetry`, or if forbidden public names (`SeverityNumber`, `LoggerProvider`, `Span`, `Trace*`, `Exporter`, `Processor`, etc.) appear in the root entry's declarations. `no-ambient-state.test.ts` scans `src/**` (excluding `src/internal/telemetry/otel/**`) for direct reads of `process.env`, `import.meta.env`, `window.location`, `document.cookie`, and fails if any are found.
  Parallel: No

- [X] T014 Add source-tree boundary scan in `tests/contract/internal-import-boundary.test.ts`
  Acceptance: Test fails if any source file outside `src/internal/telemetry/otel/**` imports from `@opentelemetry/*`, or if any source file outside `src/api/` and `src/index.ts` is re-exported from `src/index.ts`. **Implementation note**: the "outside src/api/" clause conflicts with T018's design (which re-exports `ConsoleTransport`/`scrubUrl`/etc. from `src/transport/` and `src/pipeline/` per `contracts/public-api.md`). The test enforces the architectural intent — no `src/internal/**` or `src/testing/**` leakage from `src/index.ts`, and no `src/internal/**` leakage from `src/testing/index.ts` — while leaving the exact public surface lock to T019's contract test. See the file's header comment for full rationale.
  Parallel: No

- [X] T015 Review boundary: validate foundational surface and package boundaries against `src/api/`, `src/config/`, `src/context/`, `src/internal/`, `src/transport/`, and `tests/contract/`
  Acceptance: Reviewer confirms public types match `contracts/public-api.md`, the OTel adapter is isolated, no ambient state is read, sanitizer-limit clamping is in place, and `Transport` / `TelemetryBackend` interfaces match the plan. Constitution gates I, II, III, IV, VI all hold for the foundational layer.
  Parallel: No
  **Approved 2026-05-26**: All 18 public types present per `contracts/public-api.md`; OTel imports confined to the three permitted adapter files (5 imports total) and locked by T013/T014; no `src/**` file reads `process.env`/`import.meta.env`/`location`/`document.cookie`; `resolveSanitizerLimits()` clamps to documented Min/Max and emits a `PackageError('sanitizer_limit_clamped')` per clamp; `Transport` and `TelemetryBackend` shapes match `plan.md` and `data-model.md`. Gate IV holds at the type/seam level; runtime sanitizer/redactor land in Phase 5 as planned. 67/67 contract tests green; build + both tsconfig typechecks clean.

**Checkpoint**: Foundational layer ready; user-story work can begin.

---

## Phase 3: User Story 1 — Emit Structured Application Logs (Priority: P1) 🎯 MVP

**Goal**: Stable, structured, browser-safe public logger API with
production-safe level defaults and bounded contextual input.

**Independent Test**: A consumer configures the package, creates loggers, emits
`debug`/`info`/`warn`/`error` events with structured attributes, and observes
consistent `LogEvent` output without using internal APIs.

- [X] T016 [US1] Implement logger factories and root configuration flow in `src/api/logger.ts`
  Acceptance: `configureLogging()`, `createLogger()`, and `getRootLogger()` exist. Calls before `configureLogging()` use safe defaults (`warn`+, `NoopTransport`, env-unknown) and never throw. Re-calling `configureLogging()` shuts down the previous backend and transports, then installs the new config atomically without breaking existing logger references.
  Parallel: No

- [X] T017 [P] [US1] Implement event building and level filtering in `src/pipeline/event-builder.ts` and `src/pipeline/level-filter.ts`
  Acceptance: `EventBuilder` assigns `timestamp` from `new Date().toISOString()` (consumer cannot supply). `LevelFilter` resolves effective level per `contracts/logger-config.md` (per-logger → root → `LevelMap[env]` → env default → `warn` fallback) and short-circuits drops before sanitize/redact run.
  Parallel: Yes

- [X] T018 [US1] Implement the dispatcher and wire the emit path in `src/pipeline/dispatcher.ts`, `src/api/logger.ts`, and `src/index.ts`
  Acceptance: Logger methods route through `EventBuilder → LevelFilter → (placeholder Sanitizer/URLScrubber/Redactor/ControlCharGuard/Freeze for US3) → Dispatcher → TelemetryBackend → SafeTransport[]`. The dispatcher exposes named, swappable pass-through seams (no-op functions) for each future security stage so Phase 5 replaces functions in place rather than restructuring `dispatcher.ts`. `src/index.ts` re-exports `createLogger`, `configureLogging`, `getRootLogger`, `ConsoleTransport`, `NoopTransport`, `createRedactor`, `scrubUrl`, and all public types listed in `contracts/public-api.md`. (NOTE: `createRedactor` and `scrubUrl` implementations land in Phase 5; this task ensures the re-export wiring is present and the contract test in T019 verifies it.)
  Parallel: No

- [X] T019 [US1] Add public-API and logger-behavior contract tests in `tests/contract/public-api.contract.test.ts`, `tests/contract/log-event.contract.test.ts`, and `tests/contract/level-behavior.contract.test.ts`
  Acceptance: PA-1..PA-9, LE-1..LE-11, and LC-1..LC-11 from the contracts are verified. Tests prove method-shape constancy, message-string-only behavior, package-assigned timestamps, separated `attributes` vs `context`, environment-aware level defaults, and that `getRootLogger()` returns a usable logger before `configureLogging()`.
  Parallel: No
  **Phase 5 follow-up**: LE-5 (sanitization), LE-8 (redaction), LE-9 (URL scrubbing), LE-10 (control-char escaping) carry `it.todo()` markers — they activate when T031–T035 ship the pipeline-stage bodies (security suite at T041–T049 will be the substantive coverage).

- [X] T020 [US1] Add negative API-shaping tests in `tests/contract/public-api.contract.test.ts` and `tests/unit/event-builder.test.ts`
  Acceptance: TypeScript tests fail (or `expectError`-pass) if a `logger.dump`, `logger.raw`, or `logger.log(obj)` style API is added. Runtime tests fail if a consumer-supplied `timestamp` is honored or if per-call `attributes` mutate `context.attributes`.
  Parallel: No

- [X] T021 [US1] Add browser-runtime integration coverage in `tests/integration/emit-flow.integration.test.ts`
  Acceptance: All four levels emit synchronously without throwing under `happy-dom`. Production-mode defaults drop `debug`/`info`. Re-configuring transports mid-test does not break logger references.
  Parallel: No

- [X] T022 [US1] Update basic consumer docs in `README.md` and `examples/host-app/index.ts`
  Acceptance: Docs and host-app example show structured-attribute usage, fixed-string messages (no template-interpolation of values), and the safe-defaults posture without referencing internal telemetry. No example logs whole objects, DOM nodes, or framework objects.
  Parallel: No

- [X] T023 Review boundary: validate public API safety and bounded context entry across `src/api/`, `src/pipeline/`, `src/index.ts`, `README.md`, `examples/host-app/`, and `tests/contract/`
  Acceptance: Reviewer confirms the public logger API steers consumers toward safe usage, public-export contract is exact, and no "dump everything" easy path exists. Constitution Principles I, III, V hold.
  Parallel: No
  **Approved 2026-05-26**: Public exports exactly match `contracts/public-api.md` (5 functions + 2 transport factories + 18 types); host-app example typechecks against the real published surface. No "dump everything" easy path: `Logger.error`'s optional `error` arg is the only `unknown` in the surface; `Attributes` is a constrained recursive union excluding `unknown`/`object`/class instances; `Logger` has exactly 6 methods (T020 negative-shape tests + structural `Object.keys` check verify). README and host-app example demonstrate structured-attribute usage with explicit DO/DON'T patterns; no example logs whole objects/DOM nodes/framework objects. Gates I, III, V hold; Gate IV deliberately Phase-5 scope.

---

## Phase 4: User Story 2 — Configure Safe Delivery Behavior (Priority: P2)

**Goal**: Safe dispatch, transport failure isolation, transport-security
contract, and the `/testing` helper that lets consumers verify their own
transports.

**Independent Test**: A consumer can swap or remove transports without changing
logger call sites; failures in backend or transport behavior never break host
application behavior; a misbehaving transport (URL-based delivery, mutating
events, etc.) fails the published contract helper.

- [X] T024 [US2] Implement backend-failure isolation in `src/pipeline/dispatcher.ts` and `src/internal/telemetry/otel/otel-backend.ts`
  Acceptance: `OtelLogsBackend.init()` failures fall back silently to `NoopBackend` and emit one `onInternalError`. `Backend.handle()` exceptions are caught by the dispatcher, which delivers the event to transports through a direct fallback path. No path propagates a throw or rejection to the logger call site.
  Parallel: No

- [X] T025 [P] [US2] Implement transport-contract test helpers in `src/testing/assert-transport-contract.ts` and `src/testing/secret-fixtures.ts`
  Acceptance: `assertTransportContract(transport)` runs T-1..T-S5 from `contracts/transport.md` — including a hook that intercepts global `fetch` and `navigator.sendBeacon`, asserts no URL contains event-shaped data, asserts every cross-origin call uses HTTPS with POST/PUT body or a `Blob` `sendBeacon`, asserts event immutability, asserts `flush()`/`shutdown()` idempotency. `secret-fixtures.ts` exports `makeSecretFixture()` returning a stable bag of passwords, JWTs, bearer tokens, session IDs, cookies, and credit-card-shaped numbers.
  Parallel: Yes

- [X] T026 [US2] Add transport contract tests in `tests/contract/transport.contract.test.ts`
  Acceptance: Verifies T-1..T-9 from `contracts/transport.md`. Includes a "swap transports mid-flight" test proving existing logger references continue to work, a multi-transport fan-out test proving one transport's failure does not block others, and a `NoopTransport` auto-install test when `transports` is undefined or `[]`.
  Parallel: No

- [X] T027 [US2] Add failure-safety contract test in `tests/contract/failure-safety.contract.test.ts`
  Acceptance: Verifies FS-1..FS-17 from `contracts/failure-safety.md`, including the 1000-emission stress test (throwing transport, rejecting transport, throwing `correlation()`, custom redactor throwing on ~half of events, oversized cyclic input) that completes in under 100ms with no exception escape and no unhandled rejection.
  Parallel: No

- [X] T028 [P] [US2] Add transport security contract test in `tests/security/transport-contract.security.test.ts`
  Acceptance: Uses `assertTransportContract` against (a) a sample beacon-style transport (must pass) and (b) a deliberately bad URL-based transport that pushes event data via `fetch('https://x?evt=...')` (must fail with a clear diagnostic). Asserts the bad transport's events never reach the network. Verifies T-S1..T-S5.
  Parallel: Yes

- [X] T029 [US2] Document transport-boundary security requirements in `README.md`, `docs/safe-logging.md`, and `examples/shared/beacon-transport.ts`
  Acceptance: Consumer guidance explicitly requires body-only delivery (POST/PUT JSON or `sendBeacon` `Blob`), forbids URL-based delivery, requires HTTPS cross-origin, and shows `assertTransportContract` usage in a sample consumer test. The shared beacon transport at `examples/shared/beacon-transport.ts` is the canonical body-only sample; `examples/host-app/` imports it, and `examples/federated-module/` will reuse the same file in T056. Examples do NOT normalize URL-based or backend-vendor-specific patterns.
  Parallel: No

- [X] T030 Review boundary: validate transport delivery safety, failure isolation, and the `/testing` subpath across `src/transport/`, `src/testing/`, `src/internal/telemetry/`, `tests/contract/`, `tests/security/`, `README.md`, and `docs/safe-logging.md`
  Acceptance: Reviewer confirms FS-1..FS-17 and T-1..T-S5 are testable and tested. `/testing` is reachable only via the `./testing` subpath. Constitution Principles II, VI hold for this phase.
  Parallel: No

**Checkpoint**: US2 is independently functional with safe transport and failure-isolation behavior.

---

## Phase 5: User Story 3 — Protect Sensitive Data in Log Events (Priority: P3)

**Goal**: Enforce the pipeline order `Sanitize → URL-scrub → Redact →
ControlCharGuard → Freeze(dev) → Dispatcher` upstream of every backend and
transport. Implement fail-closed redaction. Cover every security FR/SC with a
dedicated test.

**Independent Test**: A consumer emits events containing tokens, credentials,
session identifiers, nested sensitive values, URL-derived secrets, arbitrary
objects, untrusted strings, or oversized cyclic input and observes bounded,
sanitized, redacted output — or safe event dropping.

### Pipeline implementation

- [X] T031 [US3] Implement sanitizer in `src/pipeline/sanitizer.ts`
  Acceptance: Honors every row of the input/output table in `contracts/sanitization.md` (S-1..S-10). Type-tags class instances, DOM nodes, and framework objects (`Element`, `Document`, `Window`, `Node`, `Event`, `Promise`, `Map`, `Set`, `WeakMap`, `WeakSet`, `Request`, `Response`, `Blob`, `FormData`, `URL`) instead of recursing — getters are never invoked. Never throws. Respects `SanitizerLimits` from config.
  Parallel: No

- [ ] T032 [P] [US3] Implement URL scrubber and export `scrubUrl()` in `src/pipeline/url-scrubber.ts` and `src/index.ts`
  Acceptance: `scrubUrl(url, options?)` strips query/fragment parameters whose names match the default denylist (case-insensitive); accepts `ScrubUrlOptions.extraParams` and `ScrubUrlOptions.fragment`. Returns input unchanged if it does not parse as an http(s) URL. Pipeline integration runs the scrubber against every string value before redaction. `scrubUrl` is re-exported from `src/index.ts`.
  Parallel: Yes

- [ ] T033 [P] [US3] Implement dev-only deep freeze in `src/pipeline/freeze.ts`
  Acceptance: The freeze module gates its behavior on the build-time global `__DEV__` (injected by `tsup`'s `define` in T001). When `__DEV__` is `true`, it recursively `Object.freeze`s the post-redaction event before dispatch. When `__DEV__` is `false`, the bundler dead-code-eliminates the freeze body so production builds carry zero runtime cost. The source file MUST NOT read `process.env`, `import.meta.env`, or any other ambient state — `__DEV__` is the only build-time flag consulted.
  Parallel: Yes

- [ ] T034 [P] [US3] Implement control-character guard in `src/pipeline/control-char-guard.ts`
  Acceptance: Escapes ASCII control characters (`\x00`–`\x1F` except `\t`, `\n`, `\r`) and U+2028 / U+2029 in every string value in `event.message`, `event.attributes`, `event.context.attributes`, and `event.error.*`. Never throws.
  Parallel: Yes

- [ ] T035 [US3] Implement default + custom redactor in `src/pipeline/redactor.ts` and export `createRedactor()` in `src/index.ts`
  Acceptance: Default rules in `contracts/redaction.md` (R-1..R-10) — key denylist plus JWT/Bearer shape rules — apply to `event.attributes`, `event.context.attributes`, `event.message` (shape only), and `event.error.{name,message,stack}` (shape only). Custom `Redactor` fully replaces the default. Redactor that throws or returns a non-event/non-null value causes the dispatcher to drop the event and invoke `onInternalError` (fail-closed).
  Parallel: No

- [ ] T036 [US3] Wire the locked pipeline order in `src/pipeline/dispatcher.ts`
  Acceptance: Dispatcher runs `EventBuilder → LevelFilter → Sanitizer → URLScrubber → Redactor → ControlCharGuard → Freeze(dev) → backend.handle()`. Pipeline order is locked as a contract test in T048. No transport or backend can run before the redactor.
  Parallel: No

### Pipeline unit tests

- [ ] T037 [P] [US3] Add sanitizer unit tests in `tests/unit/pipeline/sanitizer.test.ts`
  Acceptance: Verifies every row of the input/output table (S-1..S-9). Includes a class instance with a `password` getter and asserts the getter is NOT invoked.
  Parallel: Yes

- [ ] T038 [P] [US3] Add URL-scrubber unit tests in `tests/unit/pipeline/url-scrubber.test.ts`
  Acceptance: Covers well-formed and malformed URLs, repeated query params, fragments, custom `extraParams`, and `fragment: false`. Asserts `scrubUrl()` never throws.
  Parallel: Yes

- [ ] T039 [P] [US3] Add control-char-guard unit tests in `tests/unit/pipeline/control-char-guard.test.ts`
  Acceptance: Covers every control-char range, U+2028, U+2029, mixed strings, and verifies `\t`/`\n`/`\r` are preserved.
  Parallel: Yes

- [ ] T040 [P] [US3] Add redactor unit tests in `tests/unit/pipeline/redactor.test.ts`
  Acceptance: Covers each default key rule, each default shape rule, custom rule replacement, custom rule composition pattern from the contract, and the fail-closed behavior when the redactor throws or returns a non-event value.
  Parallel: Yes

### Security tests (FR-012..FR-021 / SC-008..SC-010 coverage)

- [ ] T041 [P] [US3] Add secret-leakage sweep in `tests/security/secret-leakage.test.ts`
  Acceptance: Uses `makeSecretFixture()`. Places each fixture value in `attributes`, nested `attributes`, `context.attributes`, `message`, and `error.message`. Asserts every value is masked in the `LogEvent` received by an in-memory transport. Covers FR-012, FR-014, FR-015 and SC-008.
  Parallel: Yes

- [ ] T042 [P] [US3] Add URL-query leakage sweep in `tests/security/url-query-leakage.test.ts`
  Acceptance: URLs containing `?token=...`, `?session_id=...`, `?access_token=...`, and `#auth=...` placed in attributes have their sensitive params replaced via the URL scrubber. Asserts safe params on the same URL are preserved. Covers FR-013 (query-string secrets), FR-014.
  Parallel: Yes

- [ ] T043 [P] [US3] Add log-injection resistance test in `tests/security/log-injection.test.ts`
  Acceptance: Attribute and message values containing `\n`, `\r`, U+2028, U+2029, ANSI escapes, and forged-record-like payloads (e.g., `'\n{"level":"error","message":"forged"}\n'`) are escaped at the output boundary. Asserts `ConsoleTransport`'s output cannot produce a forged second record when parsed line-by-line. Covers FR-017.
  Parallel: Yes

- [ ] T044 [P] [US3] Add serialization-safety test in `tests/security/serialization-safety.test.ts`
  Acceptance: Cyclic objects, depth > 8, arrays > 1000, strings > 8192 chars, DOM nodes (`HTMLElement`), framework objects (`Event`, `Promise`, `Map`, `Set`, `Request`, `Response`, `Blob`, `FormData`, `URL`), functions, and class instances all produce documented coercion outputs. Asserts the sanitizer never throws on any input. Covers FR-016, FR-018.
  Parallel: Yes

- [ ] T045 [P] [US3] Add over-redaction test in `tests/security/over-redaction.test.ts`
  Acceptance: Safe values containing denylist substrings in non-key positions are NOT mangled (e.g., a string value `"tokenizer is great"` under key `"product"`, a description field saying "authorization is required"). Asserts redaction matches keys (case-insensitive) and value shapes (JWT/Bearer), never arbitrary substrings inside non-key string values. Locks R-3 from `contracts/redaction.md`.
  Parallel: Yes

- [ ] T046 [P] [US3] Add fail-closed redaction test in `tests/security/fail-closed-redaction.test.ts`
  Acceptance: A redactor that throws causes the affected event to be dropped (never partially emitted, never emitted raw) and `onInternalError` is invoked. A redactor that returns a non-event value behaves the same. Surviving transports receive zero events from those failing emissions. Covers FR-019, FR-020.
  Parallel: Yes

- [ ] T047 [P] [US3] Add sanitizer-limit clamp test in `tests/security/sanitizer-limit-clamp.test.ts`
  Acceptance: Setting `sanitizerLimits.maxDepth = 99` clamps to 16 and emits one `onInternalError`. Setting `maxStringLength = 0` clamps to 64 and emits the notice. The package never allows a limit above the documented Max regardless of consumer input. Locks LC-10 and S-10.
  Parallel: Yes

- [ ] T048 [P] [US3] Add pipeline-order contract test in `tests/security/pipeline-order.security.test.ts`
  Acceptance: Test injects observable spies at each pipeline stage and asserts the runtime order is exactly `EventBuilder → LevelFilter → Sanitizer → URLScrubber → Redactor → ControlCharGuard → Freeze(dev) → Dispatcher`. Asserts no transport `send()` receives an event that has not passed through Sanitizer and Redactor. Locks the security boundary.
  Parallel: Yes

- [ ] T049 [P] [US3] Add bundle-shape security test in `tests/security/bundle-shape.security.test.ts`
  Acceptance: Runs after the build. Asserts the built `dist/index.d.ts` contains no occurrences of `opentelemetry` / `@opentelemetry` and no OTel-derived identifiers. Asserts the built `dist/index.{mjs,cjs}` does not re-export from `dist/internal/**` or `dist/testing/**`. Verifies PA-5 and the bundle-shape claim in the plan.
  Parallel: Yes

### Documentation

- [ ] T050 [US3] Update safe-logging documentation in `docs/safe-logging.md`, `README.md`, and `examples/host-app/index.ts`
  Acceptance: A "Logging safely" section enumerates DO and DON'T patterns from `quickstart.md`, demonstrates `scrubUrl()` and `createRedactor()` extension, and explicitly forbids logging raw auth/session data, DOM nodes, framework objects, and full application state. A "Documented drops, transforms, and bounded behavior" section satisfies Principle VI by enumerating: level-filter drops, redactor-fail drops, sanitizer truncation markers (depth/size/count/array), URL-scrubber query/fragment replacements, control-char escaping, `NoopTransport` swallowing, and the v1 no-batching / no-sampling stance.
  Parallel: No

- [ ] T051 Review boundary: validate sanitization, redaction, injection resistance, and pipeline-order enforcement across `src/pipeline/`, `tests/security/`, `tests/unit/pipeline/`, `docs/safe-logging.md`, and `README.md`
  Acceptance: Reviewer confirms FR-012..FR-021 and SC-008..SC-010 each map to at least one named test, the pipeline order is locked by T048, fail-closed redaction is verified, sanitizer limits cannot be raised above documented Max, and the safe-logging docs enumerate every drop/transform behavior. Constitution Principles IV, V, VI all hold.
  Parallel: No

**Checkpoint**: US3 is independently functional with enforced secure logging.

---

## Phase 6: User Story 4 — Distinguish Context Across Host and Module Boundaries (Priority: P4)

**Goal**: Deterministic context propagation and origin attribution across host
apps and independently deployed modules without weakening the security
posture.

**Independent Test**: Host and module consumers emit logs through the same
package contract and receive distinguishable, sanitized, redacted context in
emitted events.

- [ ] T052 [US4] Implement child-logger and module-context propagation in `src/api/logger.ts` and `src/context/context-merge.ts`
  Acceptance: `child(context)` and `withContext(context)` return new loggers with context layered over the parent's. Parents are unaffected by child mutations. Federated modules attach `module.{name,version}` independently of host config; events from each remain distinguishable.
  Parallel: No

- [ ] T053 [P] [US4] Add federated-context integration test in `tests/integration/federated-context.test.ts`
  Acceptance: Simulates a host logger and a module logger sharing one `configureLogging()` call. Asserts events from each carry distinct `context.module.name` and shared `context.application.name`. Asserts `child()` derivation does not mutate the parent.
  Parallel: Yes

- [ ] T054 [P] [US4] Add context-merge unit test in `tests/unit/context/context-merge.test.ts`
  Acceptance: Verifies the merge precedence from `data-model.md` (root → per-logger → child → correlation), shallow merge for top-level keys, deep merge for `context.attributes`.
  Parallel: Yes

- [ ] T055 [P] [US4] Add context-boundary security test in `tests/security/context-boundary-safety.test.ts`
  Acceptance: Fails if `correlation()` or `child()` context bypasses the sanitizer or redactor — i.e., placing a JWT, raw DOM node, `Map`, or unbounded cyclic object in `correlation()` output produces a sanitized/redacted `LogEvent.context` (not raw data) at the transport. Confirms US4 cannot regress US3.
  Parallel: Yes

- [ ] T056 [US4] Build the federated-module example in `examples/federated-module/`
  Acceptance: A standalone consumer project with its own `package.json`. Shows the federated module attaching `module.{name,version}` and reusing the shared body-only beacon transport from `examples/shared/beacon-transport.ts` (factored out during T029 as the canonical body-only transport for both examples). Docs explicitly call out that the module MUST NOT log host secrets, ambient browser state, or full host application state.
  Parallel: No

- [ ] T057 Review boundary: validate host/module context integrity across `src/api/`, `src/context/`, `tests/integration/`, `tests/security/`, and `examples/federated-module/`
  Acceptance: Reviewer confirms origin attribution stays clear, child loggers do not mutate parents, and the federated path does not create a backdoor for unsanitized/unredacted context. Constitution Principles III, IV, VI hold for the federated path.
  Parallel: No

**Checkpoint**: All user stories US1–US4 are independently functional and preserve the shared security posture. US5 (scalable, federated runtime) follows in Phase 7 to land the per-page scalability and federated-deployment guarantees added in spec.md v1.1 (FR-029..FR-033 / SC-011..SC-013) and constitution v1.2.0 Principle VII.

---

## Phase 7: User Story 5 — Scale to Many Lightweight Logger Instances (Priority: P5)

**Purpose**: Lock the lightweight-`Logger` + shared-runtime architecture and the federated host/module ownership contract introduced by spec.md v1.1 and constitution v1.2.0 Principle VII. v1 also nails down the OpenTelemetry decision (Option B: deferred; `NoopBackend` is the default and only shipped backend) and the duplicate-package-copy classification (**isolated**).

**Goal**: `Logger` is a cheap, side-effect-free context handle over a single shared `ConfiguredRuntime`; expensive resources never multiply per Logger; host owns configuration; modules use `createLogger`/`child`/`withContext`; duplicate physical copies stay isolated.

**Independent Test**: A host configures the runtime once; many module loggers (≥1,000 instances combining root + per-module + derived) are created against that runtime; backend/`TransportFactory` initialization happens at most once; events from each module remain origin-distinguishable; existing Logger references survive re-configuration; two physical copies of the package on a page each own an independent runtime.

- [ ] T058 [US5] Implement `ConfiguredRuntime` and the module-scoped active-runtime slot in `src/runtime/configured-runtime.ts` and `src/runtime/runtime-ref.ts`
  Acceptance: `ConfiguredRuntime` is an internal record `{ config, transports (already-wrapped `SafeTransport[]`), redactor, sanitizerLimits, onInternalError, correlation }`. **No `backend` field** — the v1 architecture is vendor-neutral and the dispatcher fans events out directly to transports (see plan.md "Vendor-Neutral Core Architecture"; T067 does the matching dispatcher refactor). `runtime-ref.ts` exposes module-scoped `getActiveRuntime()` / `installRuntime(rt)` that read/write a single module-private slot — **no `globalThis` access, no `Symbol.for` registry, no `window`/`document` write**. `configureLogging()` builds the new runtime, atomically swaps the slot via `installRuntime`, then calls `flush()`/`shutdown()` on the previous runtime's transports (each wrapped in try/catch). `getRootLogger()` and `createLogger()` route emissions through `getActiveRuntime()` at emit time so retained Logger references automatically pick up the new runtime after a swap (locks FR-031 / SC-012).
  Parallel: No
  **Touches `src/api/logger.ts`**: moves the runtime-bag construction out of `installState()` and into `configured-runtime.ts`; the existing FR-031 atomicity behavior is preserved.

- [ ] T059 [P] [US5] Lightweight-`Logger` contract test in `tests/performance/lightweight-logger.contract.test.ts`
  Acceptance: Installs spies on `EventTarget.prototype.addEventListener`, `setTimeout`, `setInterval`, `queueMicrotask`, `requestAnimationFrame`, `console.*`, `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `window.onerror` setters, and `window.onunhandledrejection` setters; asserts that `createLogger()`, `child()`, `withContext()`, and `getRootLogger()` invoke zero of them. Also installs spies on every configured `TransportFactory` and asserts the factory is invoked **exactly once during `configureLogging()`** and **zero additional times** across 100 subsequent `createLogger` / `child` calls. Counts allocations via a per-test probe and asserts each handle creation allocates only a small constant number of objects. Locks FR-029.
  Parallel: Yes

- [ ] T060 [P] [US5] Many-`Logger` scale test in `tests/performance/many-logger-scale.performance.test.ts` and `tests/performance/shared-runtime-fanout.test.ts`
  Acceptance: `many-logger-scale.performance.test.ts` creates ≥1,000 Loggers (mix of root + per-module + derived `child()`/`withContext()`) against a single `configureLogging()` call. Asserts `TransportFactory` invocation count stays at the one-per-configureLogging baseline, `TelemetryBackend.init()` is invoked exactly once, and total allocation count is O(N) in logger count (not O(N×K) where K = transports or attribute count). `shared-runtime-fanout.test.ts` emits from many module loggers and asserts every configured transport receives every event exactly once with consistent ordering. Locks SC-011.
  Parallel: Yes

- [ ] T061 [P] [US5] Re-configure with retained Logger references in `tests/integration/reconfigure-existing-references.integration.test.ts`
  Acceptance: Retains multiple `Logger` references created at different times (before and after the first `configureLogging()`, plus derived `child()` references). Calls `configureLogging()` again with a fresh transport set. Asserts (a) every retained reference emits through the **new** transports after the swap; (b) the previous runtime's `flush()` and `shutdown()` are invoked, each isolated in try/catch; (c) no exception escapes; (d) early-config Loggers held before the very first `configureLogging()` also pick up the new runtime. Locks FR-031 and SC-012.
  Parallel: Yes

- [ ] T062 [P] [US5] Child-non-mutation test in `tests/performance/child-non-mutation.test.ts`
  Acceptance: A parent Logger creates many `child()` and `withContext()` derivations. Deep-compares the parent's merged context before and after every derivation and after every event emitted through derived loggers. Asserts that the parent's context is structurally unchanged and that derived-logger context mutations do not propagate to the parent. Complements T053/T054 with an explicit immutability assertion at scale.
  Parallel: Yes

- [ ] T063 [P] [US5] Host + many module loggers integration test in `tests/integration/host-many-module-loggers.integration.test.ts`
  Acceptance: One `configureLogging()` call by the simulated host. Many simulated module entry points each call `createLogger({ module: { name, version }, context })`. Asserts every module's events reach the host-configured transports, `context.module.name` is distinct per module, `context.application.name` is the host's value on every event, and the host's redactor + sanitizerLimits apply uniformly to every module's events. Locks SC-013.
  Parallel: Yes

- [ ] T064 [P] [US5] Duplicate-package-copy isolation integration test in `tests/integration/duplicate-copy-isolation.integration.test.ts`
  Acceptance: Simulates two physical loads of the package via `vi.isolateModules()` (or two distinct path-aliased imports of the same source). Configures runtime A in copy 1 with transports T_A and runtime B in copy 2 with transports T_B. Asserts (a) emitting through copy 1's logger reaches only T_A, (b) emitting through copy 2's logger reaches only T_B, (c) configuring copy 1 does not affect copy 2's active runtime, (d) no `globalThis`/`window`/`document`/`Symbol.for` channel cross-routes events between copies, and (e) `Logger` references from copy 1 cannot be passed to copy 2's `configureLogging` and vice versa without breaking. Locks the **isolated** classification of FR-033.
  Parallel: Yes

- [ ] T065 [US5] Document host/module configuration ownership + duplicate-package-copy classification + module-federation singleton guidance + vendor-neutral core posture in `README.md`, `docs/safe-logging.md`, `quickstart.md`, and the federated example
  Acceptance: A dedicated "Configuration ownership" section explains that hosts call `configureLogging()` at boot, modules use `createLogger`/`child`/`withContext`, and a module calling `configureLogging()` is a documented (non-default) override. A "Duplicate package copies" section documents the **isolated** classification: each physical copy owns an independent runtime; no global registry; for cross-copy sharing, consumers MUST configure their bundler's module-federation `shared` map to mark this package as a singleton (with a brief Webpack 5 example snippet that exists only in docs, not in the package). A "Vendor neutrality" section states the core has no observability-vendor SDKs and that OpenTelemetry, Datadog, Sentry, and other vendors are future optional transport adapters. `examples/federated-module/` README links to the configuration-ownership section and shows a module using `createLogger` against the host's already-configured runtime. Updates `quickstart.md`'s "Logging safely" section so the federated story is internally consistent with FR-029..FR-033.
  Parallel: No

- [ ] T066 [US5] Refactor dispatcher to drop the `TelemetryBackend.handle()` default-path call in favor of direct `SafeTransport` fan-out in `src/pipeline/dispatcher.ts` and `src/api/logger.ts`
  Acceptance: `dispatcher.ts`'s post-pipeline step becomes a direct iteration over `runtime.transports` calling `transport.send(event)` (each transport `SafeTransport`-wrapped at `configureLogging()` time). The `backend: TelemetryBackend` parameter is removed from `dispatch()`'s signature and from `ConfiguredRuntime`. `src/api/logger.ts`'s emit path drops the `current.backend` argument it passes to `dispatch()`. `src/internal/telemetry/{backend,noop-backend}.ts` and `src/internal/telemetry/otel/**` remain in the source tree (reframed as future-adapter seam per plan.md "Vendor-Neutral Core Architecture") but are unreachable from `src/index.ts` and not constructed by any v1 code path. Existing T024 acceptance (backend.handle exception isolation) becomes moot for v1 because there is no backend call on the default path; the dispatcher's existing transport-error isolation (each transport wrapped in try/catch in the new direct-fan-out loop) covers the equivalent failure mode. Existing pipeline-order tests (T048), bundle-shape (T049), and the new vendor-free audit (T070) all continue to pass. Per-emission semantics unchanged from the consumer's perspective.
  Parallel: No
  **Supersedes the OTel/backend portions of T018 and T024 on the default path** (T010 OTel adapter code is retained but reframed; see plan.md Vendor-Neutral Core Architecture). Other concerns of T018 (event-builder/level-filter wiring) and T024 (no exception propagation to caller) remain in force.

- [ ] T067 [US5] Review boundary: validate the US5 surface + vendor-neutral architecture across `src/api/`, `src/runtime/`, `src/pipeline/dispatcher.ts`, `tests/performance/`, `tests/integration/{host-many-module-loggers,reconfigure-existing-references,duplicate-copy-isolation}.integration.test.ts`, `README.md`, `docs/safe-logging.md`, `quickstart.md`, and `examples/federated-module/`
  Acceptance: Reviewer confirms (a) `Logger` construction does no init/wrap/listener/timer/network/ambient-read/vendor-SDK-init work (locked by T059); (b) `configureLogging()` is the **only** public API that installs a runtime; module-load of the package itself has zero side effects on the active runtime (FR-032); (c) retained Logger references survive re-configuration through the documented active-runtime slot (FR-031 / SC-012); (d) the duplicate-copy classification is **isolated** and the module-federation singleton-sharing pattern is the documented cross-copy escape hatch (FR-033); (e) the dispatcher fan-out is direct (T066) — no `TelemetryBackend.handle()` is on the default emit path; (f) the public surface contains zero vendor-specific symbols (`SeverityNumber`, `LoggerProvider`, `Span`, `Trace*`, `Exporter`, `Processor`, `Hub`, etc.); (g) Constitution v1.2.0 Principles I, II, III, IV, VI, **VII** all hold; (h) the existing security pipeline order, fail-closed redaction, and bundle-shape guarantees are not weakened by the runtime refactor. T058 + T066's logger.ts/dispatcher.ts touches are reviewed in particular for FR-031 atomicity and direct-fan-out correctness.
  Parallel: No
  **Was**: prior T066, extended to cover the dispatcher refactor (T066-new) and vendor-neutral guarantees.

**Checkpoint**: US5 is independently functional. v1's scalability, federated-ownership, and vendor-neutral-core guarantees are locked.

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: Final validation, packaging, end-to-end sweeps, doc audit. Renumbered from prior Phase 7 to make room for Phase 7 (US5).

- [ ] T068 [P] Add end-to-end secret sweep in `tests/integration/secret-sweep.integration.test.ts`
  Acceptance: End-to-end version of the secret-leakage sweep that exercises the full default pipeline (LevelFilter → EventBuilder → Sanitizer → URLScrubber → Redactor → ControlCharGuard → Freeze(dev) → direct transport fan-out → in-memory transport). Asserts every fixture value is masked. When future vendor adapter features (OTel, Datadog, Sentry) land, each one ships its own equivalent sweep against its own transport adapter; v1's core sweep does NOT exercise any vendor adapter because none is on the default path (see plan.md "Vendor-Neutral Core Architecture").
  Parallel: Yes
  **Was**: prior T067 / original T058.

- [ ] T069 [P] Validate quickstart and consumer docs in `specs/001-structured-logging-core/quickstart.md`, `README.md`, and `docs/safe-logging.md`
  Acceptance: Doc audit confirms every code snippet uses public exports only, every snippet compiles against the built `dist/`, and no snippet normalizes an insecure pattern (no template-string value interpolation, no raw object dump, no URL-based delivery, no logging of DOM/framework objects, no vendor-specific code paths). Confirms the "Documented drops, transforms, and bounded behavior" section in `docs/safe-logging.md` is present and accurate, and that the "Configuration ownership", "Duplicate package copies", and "Vendor neutrality" sections from T065 are present and accurate.
  Parallel: Yes
  **Was**: prior T068 / original T059.

- [ ] T070 Final package + vendor-free audit in `package.json`, `src/index.ts`, `src/testing/index.ts`, and `tests/contract/dependency-pins.test.ts`
  Acceptance: `package.json` `exports` map exposes only `.` and `./testing`, `sideEffects: false`. A new contract test `tests/contract/dependency-pins.test.ts` parses `package.json` and asserts (a) `dependencies` contains **no** `@opentelemetry/*`, `@datadog/*` / `dd-rum`, `@sentry/*`, or any other observability-vendor package — the core is vendor-free; (b) any OTel types referenced by the documented-seam adapter code under `src/internal/telemetry/otel/**` are present only in `devDependencies`, used only by that adapter's own unit tests; (c) the built default entry (`dist/index.{mjs,cjs}`) does **not** import any vendor SDK and does not re-export from `dist/internal/**`; (d) `dist/index.d.ts` contains no vendor-specific identifier (`SeverityNumber`, `LoggerProvider`, `Span`, `Trace*`, `Exporter`, `Processor`, `Hub`, etc.). Built bundle size (gzipped) for the **vendor-free core path** (security pipeline + direct fan-out + `ConsoleTransport`/`NoopTransport`) is within the plan's ≤15 KB target. All five test suites (`contract`, `security`, `integration`, `unit`, `performance`) pass and meet coverage targets (100% in `sanitizer.ts`, `redactor.ts`, `url-scrubber.ts`, `control-char-guard.ts`; ≥90% in the rest of `src/pipeline/`, `src/transport/`, `src/internal/`, `src/runtime/`; 100% of public exports executed by contract tests).
  Parallel: No
  **Was**: prior T069 / original T060, extended to lock the vendor-neutral guarantee across all observability vendors (not just OTel) and to require any OTel devDependencies used by the seam tests to stay out of `dependencies`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — starts immediately
- **Phase 2 (Foundational)** — depends on Phase 1; blocks all stories
- **Phase 3 (US1)** — depends on Phase 2
- **Phase 4 (US2)** — depends on Phase 2 and the dispatcher wiring from US1
- **Phase 5 (US3)** — depends on Phase 2 and the dispatcher wiring from US1. Replaces the placeholder Sanitizer/Redactor/Guard installed in T018.
- **Phase 6 (US4)** — depends on Phase 2 and benefits from US3's sanitized/redacted pipeline
- **Phase 7 (US5)** — depends on Phase 3 (US1 logger factories) and Phase 4 (US2 dispatcher backend-failure isolation). Independent of US3 secure pipeline at the architecture level, but US5 tests in `tests/performance/` and `tests/integration/duplicate-copy-isolation.integration.test.ts` assume the v1 default backend is `NoopBackend` per plan.md "OpenTelemetry Decision".
- **Phase 8 (Polish)** — depends on all desired user stories

### Review boundaries

- After **T015**: foundational layer & package boundaries
- After **T023**: public API safety & bounded context entry
- After **T030**: transport delivery safety & failure isolation
- After **T051**: sanitization, redaction, injection resistance, pipeline-order enforcement
- After **T057**: host/module context integrity under the shared security posture
- After **T067**: lightweight-`Logger` architecture, federated host/module configuration ownership, duplicate-package-copy isolation classification, dispatcher direct-fan-out refactor (T066), and the vendor-neutral core posture

### Story independence

- **US1 (P1)** — MVP. No dependency on later stories.
- **US2 (P2)** — uses the core logger/dispatcher flow from US1 but is independently testable.
- **US3 (P3)** — builds the secure pipeline boundary on top of US1. Each implementation task is paired with its security test in the same phase.
- **US4 (P4)** — extends context behavior and verifies that host/module metadata still respects the secure pipeline (T055).
- **US5 (P5)** — refactors the runtime ownership model into the explicit `ConfiguredRuntime` + module-scoped active-runtime slot (T058), refactors the dispatcher to direct `SafeTransport` fan-out (T066, dropping the default-path `TelemetryBackend.handle()` call to align with plan.md's vendor-neutral core architecture), and locks scale, federated ownership, and duplicate-copy isolation as testable invariants (T059..T064). Touches `src/api/logger.ts` and `src/pipeline/dispatcher.ts` but does not change the public Logger surface; the spec.md FR-031/FR-032/FR-033 contract is met without new public symbols.

### Files touched by multiple phases (merge discipline)

- `src/pipeline/dispatcher.ts` — touched by **T018 (US1)**, **T024 (US2)**, **T036 (US3)**, and **T066 (US5 refactor)**. The T051 review verifies the secure pipeline order and fail-closed redaction. The T067 review verifies the T066 refactor: the dispatcher's post-pipeline step is direct `SafeTransport` fan-out — no `TelemetryBackend.handle()` is called on the default path. The OTel/backend portions of T018 and T024 are superseded by T066 for the default path; the adapter code under `src/internal/telemetry/**` remains as future-adapter seam.
- `src/api/logger.ts` — touched by **T016 (US1)**, **T052 (US4)**, **T058 (US5)**, and **T066 (US5 refactor — drops the `current.backend` arg passed to `dispatch()`)**. The T067 review must verify the final `logger.ts` keeps the public surface unchanged while moving runtime construction into `src/runtime/configured-runtime.ts`, reading the active runtime via the module-scoped slot from `src/runtime/runtime-ref.ts`, and no longer threading a backend reference through the emit path.
- `src/index.ts` — touched by **T002 (Setup)**, **T018 (US1)**, **T032 (US3)**, **T035 (US3)**. The T070 final audit verifies the exact public surface AND the vendor-free guarantee (no vendor SDK import from the default entry); US5 does NOT add any new public symbol.

### Parallel opportunities

- T002, T003, T004 run together after T001.
- T006 through T011 run in parallel once T005 establishes the shared type contracts. **Exception**: T010 (OTel adapter) depends on T009's `TelemetryBackend` interface — T010 must wait for T009's file to land before its parallel implementation can begin (typically a few minutes of staggering, not a separate phase).
- T013 and T014 (foundational contract tests) run together.
- T017 runs parallel to T016 because event-builder/level-filter are isolated.
- T025 proceeds in parallel with T024 (testing subpath is independent of the dispatcher edit).
- T028 runs in parallel with T026 (different file, same conceptual area).
- Within Phase 5: T031 must land first (the sanitizer is the foundation), then T032/T033/T034 run in parallel. T035 depends on the sanitizer. T037..T049 all run in parallel once their corresponding source file exists.
- T053, T054, T055 run together once T052 lands.
- Within Phase 7: T058 must land first (the `ConfiguredRuntime` refactor is the foundation), then T059..T064 all run in parallel. T065 documentation lands sequentially. T066 (dispatcher direct-fan-out refactor) runs sequentially after T058 and any of T059..T064 that depend on backend-free behavior; it may run in parallel with T065. T067 review is last in the phase.
- T068 and T069 run together during the final polish phase. T070 is sequential.

---

## Parallel Example — User Story 3 implementation

```bash
# After T031 (sanitizer) lands, these can run in parallel:
Task: "T032 Implement URL scrubber and export scrubUrl() in src/pipeline/url-scrubber.ts and src/index.ts"
Task: "T033 Implement dev-only deep freeze in src/pipeline/freeze.ts"
Task: "T034 Implement control-character guard in src/pipeline/control-char-guard.ts"

# After T035 (redactor) lands, all eight security tests can run in parallel:
Task: "T041 secret-leakage.test.ts"
Task: "T042 url-query-leakage.test.ts"
Task: "T043 log-injection.test.ts"
Task: "T044 serialization-safety.test.ts"
Task: "T045 over-redaction.test.ts"
Task: "T046 fail-closed-redaction.test.ts"
Task: "T047 sanitizer-limit-clamp.test.ts"
Task: "T048 pipeline-order.security.test.ts"
Task: "T049 bundle-shape.security.test.ts"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational); approve **T015** review.
2. Complete Phase 3 (US1); approve **T023** review.
3. Stop, validate the public API boundary, demo a structured-logging consumer against `ConsoleTransport`.

### Incremental delivery

1. Setup + Foundational → approve **T015**.
2. Add US1 → approve **T023** → ship MVP.
3. Add US2 → approve **T030** → consumers can ship body-only HTTP delivery.
4. Add US3 → approve **T051** → secure logging contract is enforced end-to-end.
5. Add US4 → approve **T057** → federated modules supported.
6. Add US5 → approve **T067** → scalable many-`Logger` runtime, federated host/module ownership, duplicate-copy isolation, and vendor-neutral direct-fan-out dispatcher (T066) locked.
7. Run polish (T068–T070).

### Parallel team strategy

After **T015** clears:

- Engineer A — US1 (T016..T023)
- Engineer B — US2 (T024..T030) once T018 is done
- Engineer C — US3 (T031..T051) once T018 is done
- Engineer D — US4 (T052..T057) once T031..T035 land (US3 pipeline foundation)
- Engineer E — US5 (T058..T067) once T024 (US2 dispatcher backend-failure isolation) lands. Tests in T059..T064 run in parallel after T058 completes the `ConfiguredRuntime` refactor. T066 dispatcher direct-fan-out refactor (the change that removes the default-path `TelemetryBackend.handle()` call) lands after T058 and before the T067 review.

Stories integrate independently. The dispatcher merge discipline above
(T018 / T024 / T036 / T066) is the cross-engineer coordination point for
US1–US3 + US5. US5 also adds `src/api/logger.ts` as a coordination point
(T016 / T052 / T058 / T066) that the T067 review verifies.
