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

- [ ] T016 [US1] Implement logger factories and root configuration flow in `src/api/logger.ts`
  Acceptance: `configureLogging()`, `createLogger()`, and `getRootLogger()` exist. Calls before `configureLogging()` use safe defaults (`warn`+, `NoopTransport`, env-unknown) and never throw. Re-calling `configureLogging()` shuts down the previous backend and transports, then installs the new config atomically without breaking existing logger references.
  Parallel: No

- [ ] T017 [P] [US1] Implement event building and level filtering in `src/pipeline/event-builder.ts` and `src/pipeline/level-filter.ts`
  Acceptance: `EventBuilder` assigns `timestamp` from `new Date().toISOString()` (consumer cannot supply). `LevelFilter` resolves effective level per `contracts/logger-config.md` (per-logger → root → `LevelMap[env]` → env default → `warn` fallback) and short-circuits drops before sanitize/redact run.
  Parallel: Yes

- [ ] T018 [US1] Implement the dispatcher and wire the emit path in `src/pipeline/dispatcher.ts`, `src/api/logger.ts`, and `src/index.ts`
  Acceptance: Logger methods route through `EventBuilder → LevelFilter → (placeholder Sanitizer/URLScrubber/Redactor/ControlCharGuard/Freeze for US3) → Dispatcher → TelemetryBackend → SafeTransport[]`. The dispatcher exposes named, swappable pass-through seams (no-op functions) for each future security stage so Phase 5 replaces functions in place rather than restructuring `dispatcher.ts`. `src/index.ts` re-exports `createLogger`, `configureLogging`, `getRootLogger`, `ConsoleTransport`, `NoopTransport`, `createRedactor`, `scrubUrl`, and all public types listed in `contracts/public-api.md`. (NOTE: `createRedactor` and `scrubUrl` implementations land in Phase 5; this task ensures the re-export wiring is present and the contract test in T019 verifies it.)
  Parallel: No

- [ ] T019 [US1] Add public-API and logger-behavior contract tests in `tests/contract/public-api.contract.test.ts`, `tests/contract/log-event.contract.test.ts`, and `tests/contract/level-behavior.contract.test.ts`
  Acceptance: PA-1..PA-9, LE-1..LE-11, and LC-1..LC-11 from the contracts are verified. Tests prove method-shape constancy, message-string-only behavior, package-assigned timestamps, separated `attributes` vs `context`, environment-aware level defaults, and that `getRootLogger()` returns a usable logger before `configureLogging()`.
  Parallel: No

- [ ] T020 [US1] Add negative API-shaping tests in `tests/contract/public-api.contract.test.ts` and `tests/unit/event-builder.test.ts`
  Acceptance: TypeScript tests fail (or `expectError`-pass) if a `logger.dump`, `logger.raw`, or `logger.log(obj)` style API is added. Runtime tests fail if a consumer-supplied `timestamp` is honored or if per-call `attributes` mutate `context.attributes`.
  Parallel: No

- [ ] T021 [US1] Add browser-runtime integration coverage in `tests/integration/emit-flow.integration.test.ts`
  Acceptance: All four levels emit synchronously without throwing under `happy-dom`. Production-mode defaults drop `debug`/`info`. Re-configuring transports mid-test does not break logger references.
  Parallel: No

- [ ] T022 [US1] Update basic consumer docs in `README.md` and `examples/host-app/index.ts`
  Acceptance: Docs and host-app example show structured-attribute usage, fixed-string messages (no template-interpolation of values), and the safe-defaults posture without referencing internal telemetry. No example logs whole objects, DOM nodes, or framework objects.
  Parallel: No

- [ ] T023 Review boundary: validate public API safety and bounded context entry across `src/api/`, `src/pipeline/`, `src/index.ts`, `README.md`, `examples/host-app/`, and `tests/contract/`
  Acceptance: Reviewer confirms the public logger API steers consumers toward safe usage, public-export contract is exact, and no "dump everything" easy path exists. Constitution Principles I, III, V hold.
  Parallel: No

**Checkpoint**: US1 is independently functional and safe-by-default at the public API layer.

---

## Phase 4: User Story 2 — Configure Safe Delivery Behavior (Priority: P2)

**Goal**: Safe dispatch, transport failure isolation, transport-security
contract, and the `/testing` helper that lets consumers verify their own
transports.

**Independent Test**: A consumer can swap or remove transports without changing
logger call sites; failures in backend or transport behavior never break host
application behavior; a misbehaving transport (URL-based delivery, mutating
events, etc.) fails the published contract helper.

- [ ] T024 [US2] Implement backend-failure isolation in `src/pipeline/dispatcher.ts` and `src/internal/telemetry/otel/otel-backend.ts`
  Acceptance: `OtelLogsBackend.init()` failures fall back silently to `NoopBackend` and emit one `onInternalError`. `Backend.handle()` exceptions are caught by the dispatcher, which delivers the event to transports through a direct fallback path. No path propagates a throw or rejection to the logger call site.
  Parallel: No

- [ ] T025 [P] [US2] Implement transport-contract test helpers in `src/testing/assert-transport-contract.ts` and `src/testing/secret-fixtures.ts`
  Acceptance: `assertTransportContract(transport)` runs T-1..T-S5 from `contracts/transport.md` — including a hook that intercepts global `fetch` and `navigator.sendBeacon`, asserts no URL contains event-shaped data, asserts every cross-origin call uses HTTPS with POST/PUT body or a `Blob` `sendBeacon`, asserts event immutability, asserts `flush()`/`shutdown()` idempotency. `secret-fixtures.ts` exports `makeSecretFixture()` returning a stable bag of passwords, JWTs, bearer tokens, session IDs, cookies, and credit-card-shaped numbers.
  Parallel: Yes

- [ ] T026 [US2] Add transport contract tests in `tests/contract/transport.contract.test.ts`
  Acceptance: Verifies T-1..T-9 from `contracts/transport.md`. Includes a "swap transports mid-flight" test proving existing logger references continue to work, a multi-transport fan-out test proving one transport's failure does not block others, and a `NoopTransport` auto-install test when `transports` is undefined or `[]`.
  Parallel: No

- [ ] T027 [US2] Add failure-safety contract test in `tests/contract/failure-safety.contract.test.ts`
  Acceptance: Verifies FS-1..FS-17 from `contracts/failure-safety.md`, including the 1000-emission stress test (throwing transport, rejecting transport, throwing `correlation()`, custom redactor throwing on ~half of events, oversized cyclic input) that completes in under 100ms with no exception escape and no unhandled rejection.
  Parallel: No

- [ ] T028 [P] [US2] Add transport security contract test in `tests/security/transport-contract.security.test.ts`
  Acceptance: Uses `assertTransportContract` against (a) a sample beacon-style transport (must pass) and (b) a deliberately bad URL-based transport that pushes event data via `fetch('https://x?evt=...')` (must fail with a clear diagnostic). Asserts the bad transport's events never reach the network. Verifies T-S1..T-S5.
  Parallel: Yes

- [ ] T029 [US2] Document transport-boundary security requirements in `README.md`, `docs/safe-logging.md`, and `examples/shared/beacon-transport.ts`
  Acceptance: Consumer guidance explicitly requires body-only delivery (POST/PUT JSON or `sendBeacon` `Blob`), forbids URL-based delivery, requires HTTPS cross-origin, and shows `assertTransportContract` usage in a sample consumer test. The shared beacon transport at `examples/shared/beacon-transport.ts` is the canonical body-only sample; `examples/host-app/` imports it, and `examples/federated-module/` will reuse the same file in T056. Examples do NOT normalize URL-based or backend-vendor-specific patterns.
  Parallel: No

- [ ] T030 Review boundary: validate transport delivery safety, failure isolation, and the `/testing` subpath across `src/transport/`, `src/testing/`, `src/internal/telemetry/`, `tests/contract/`, `tests/security/`, `README.md`, and `docs/safe-logging.md`
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

- [ ] T031 [US3] Implement sanitizer in `src/pipeline/sanitizer.ts`
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

**Checkpoint**: All user stories are independently functional and preserve the shared security posture.

---

## Phase 7: Polish & Cross-Cutting

**Purpose**: Final validation, packaging, end-to-end sweeps, doc audit.

- [ ] T058 [P] Add end-to-end secret sweep in `tests/integration/secret-sweep.integration.test.ts`
  Acceptance: End-to-end version of the secret-leakage sweep that exercises the full pipeline including the OTel backend (when present) and an in-memory transport. Asserts every fixture value is masked even when routed through `OtelLogsBackend` (verifies that swapping the backend cannot bypass redaction).
  Parallel: Yes

- [ ] T059 [P] Validate quickstart and consumer docs in `specs/001-structured-logging-core/quickstart.md`, `README.md`, and `docs/safe-logging.md`
  Acceptance: Doc audit confirms every code snippet uses public exports only, every snippet compiles against the built `dist/`, and no snippet normalizes an insecure pattern (no template-string value interpolation, no raw object dump, no URL-based delivery, no logging of DOM/framework objects). The "Documented drops, transforms, and bounded behavior" section in `docs/safe-logging.md` is present and accurate.
  Parallel: Yes

- [ ] T060 Final package audit in `package.json`, `src/index.ts`, `src/testing/index.ts`, and `tests/contract/dependency-pins.test.ts`
  Acceptance: `package.json` `exports` map exposes only `.` and `./testing`, `sideEffects: false`. A new contract test `tests/contract/dependency-pins.test.ts` parses `package.json` and asserts the three OTel deps (`@opentelemetry/api-logs`, `@opentelemetry/sdk-logs`, `@opentelemetry/api`) each use the documented caret-locked range and that no other `@opentelemetry/*` deps have been added. Built bundle size (gzipped) for the core path is within the plan's ≤15 KB target. All four test suites (`contract`, `security`, `integration`, `unit`) pass and meet coverage targets (100% in `sanitizer.ts`, `redactor.ts`, `url-scrubber.ts`, `control-char-guard.ts`; ≥90% in the rest of `src/pipeline/`, `src/transport/`, `src/internal/`; 100% of public exports executed by contract tests).
  Parallel: No

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — starts immediately
- **Phase 2 (Foundational)** — depends on Phase 1; blocks all stories
- **Phase 3 (US1)** — depends on Phase 2
- **Phase 4 (US2)** — depends on Phase 2 and the dispatcher wiring from US1
- **Phase 5 (US3)** — depends on Phase 2 and the dispatcher wiring from US1. Replaces the placeholder Sanitizer/Redactor/Guard installed in T018.
- **Phase 6 (US4)** — depends on Phase 2 and benefits from US3's sanitized/redacted pipeline
- **Phase 7 (Polish)** — depends on all desired user stories

### Review boundaries

- After **T015**: foundational layer & package boundaries
- After **T023**: public API safety & bounded context entry
- After **T030**: transport delivery safety & failure isolation
- After **T051**: sanitization, redaction, injection resistance, pipeline-order enforcement
- After **T057**: host/module context integrity under the shared security posture

### Story independence

- **US1 (P1)** — MVP. No dependency on later stories.
- **US2 (P2)** — uses the core logger/dispatcher flow from US1 but is independently testable.
- **US3 (P3)** — builds the secure pipeline boundary on top of US1. Each implementation task is paired with its security test in the same phase.
- **US4 (P4)** — extends context behavior and verifies that host/module metadata still respects the secure pipeline (T055).

### Files touched by multiple phases (merge discipline)

- `src/pipeline/dispatcher.ts` — touched by **T018 (US1)**, **T024 (US2)**, and **T036 (US3)**. The T051 review must verify the final dispatcher covers all three concerns: base emit path, backend-failure fallback, and the locked secure pipeline order with fail-closed redaction.
- `src/api/logger.ts` — touched by **T016 (US1)** and **T052 (US4)**.
- `src/index.ts` — touched by **T002 (Setup)**, **T018 (US1)**, **T032 (US3)**, **T035 (US3)**. The T060 final audit verifies the exact public surface.

### Parallel opportunities

- T002, T003, T004 run together after T001.
- T006 through T011 run in parallel once T005 establishes the shared type contracts. **Exception**: T010 (OTel adapter) depends on T009's `TelemetryBackend` interface — T010 must wait for T009's file to land before its parallel implementation can begin (typically a few minutes of staggering, not a separate phase).
- T013 and T014 (foundational contract tests) run together.
- T017 runs parallel to T016 because event-builder/level-filter are isolated.
- T025 proceeds in parallel with T024 (testing subpath is independent of the dispatcher edit).
- T028 runs in parallel with T026 (different file, same conceptual area).
- Within Phase 5: T031 must land first (the sanitizer is the foundation), then T032/T033/T034 run in parallel. T035 depends on the sanitizer. T037..T049 all run in parallel once their corresponding source file exists.
- T053, T054, T055 run together once T052 lands.
- T058 and T059 run together during the final phase.

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
6. Run polish (T058–T060).

### Parallel team strategy

After **T015** clears:

- Engineer A — US1 (T016..T023)
- Engineer B — US2 (T024..T030) once T018 is done
- Engineer C — US3 (T031..T051) once T018 is done
- Engineer D — US4 (T052..T057) once T031..T035 land (US3 pipeline foundation)

Stories integrate independently. The dispatcher merge discipline above
(T018 / T024 / T036) is the only cross-engineer coordination point.
