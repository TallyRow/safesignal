# Tasks: Beacon Transport (first-party HTTPS peer transport)

**Input**: Design documents from `/specs/002-beacon-transport/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED. Per constitution v1.2.0 every change touching
public API, transport delivery, failure handling, redaction, sanitization, or
integrity-relevant transformations MUST include contract, security, integration,
or unit coverage. This feature additionally requires lightweight-construction
and federated-runtime coverage (Principle VII).

**Organization**: Tasks are grouped by user story (US1–US3) so each story is
independently testable. Review-boundary tasks gate each phase.

## Format: `[ID] [P?] [Story?] Description`

- `- [ ]` checkbox prefix
- Task ID is sequential (`T001`...)
- `[P]` = parallelizable (different files, no blocking dependency)
- `[Story]` = `[US1]` / `[US2]` / `[US3]` for story-phase tasks
- Every task names exact file paths and an acceptance check

## Path Conventions

- Runtime source: `src/transport-beacon/` (new); `src/` for everything else (unchanged from feature 001)
- Tests: `tests/contract/`, `tests/security/`, `tests/integration/`, `tests/unit/transport-beacon/`, `tests/performance/`
- Examples: `examples/host-app/`, `examples/federated-module/`, `examples/shared/`
- Docs: `README.md`, `docs/safe-logging.md`
- Build: `tsup.config.ts`, `package.json` `exports`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build/test plumbing for the new subpath; placeholders that
later phases fill in.

- [X] T001 Add subpath entry plumbing in `tsup.config.ts`, `package.json`, and create `src/transport-beacon/` directory
  Acceptance: `tsup.config.ts` `entry` map gains `'transport-beacon': 'src/transport-beacon/index.ts'`. `package.json` `exports` gains `"./transport-beacon": { "types": "./dist/transport-beacon.d.ts", "import": "./dist/transport-beacon.mjs", "require": "./dist/transport-beacon.cjs" }`. `src/transport-beacon/` directory exists with a `.gitkeep` placeholder so subsequent tasks can write files without race. `npm run build` succeeds (emitting empty `dist/transport-beacon.{mjs,cjs,d.ts}`).
  Parallel: No

- [X] T002 [P] Create beacon-network test doubles in `tests/helpers/beacon-network.ts`
  Acceptance: Helpers expose `installSendBeaconDouble(opts)`, `installFetchDouble(opts)`, `installAddEventListenerSpy()`, `installSetTimeoutSpy()`, each returning an `uninstall()` cleanup. Doubles record calls (endpoint, body, init, listener type, timer delay) for assertion. The fetch double can be configured to resolve with a status, reject with a reason, or be undefined. The sendBeacon double returns a configurable boolean. No vendor SDK imports; no `src/internal/**` imports.
  Parallel: Yes

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Subpath skeleton, error class, low-level primitives, and the
bundle-shape guard that every subsequent phase relies on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [X] T003 Create subpath entry stub in `src/transport-beacon/index.ts`
  Acceptance: Exports a `createBeaconTransport` function (initial body: `throw new Error('not implemented')`) and `BeaconTransportOptions` interface so test scaffolding can compile. Imports types ONLY from `../api/types.js` (`LogEvent`, `Transport`) via `import type` syntax. No runtime imports from anywhere in `src/`. `npm run build` emits a non-empty `dist/transport-beacon.mjs` (gzipped well under 5 KiB at this stage).
  Parallel: No

- [X] T004 [P] Implement subpath-owned error class in `src/transport-beacon/errors.ts`
  Acceptance: Exports `BeaconErrorCode` (union of `'oversized_event' | 'beacon_batch_drop' | 'beacon_unavailable' | 'transport_send_failed' | 'transport_shutdown_failed'`) and `BeaconError extends Error` with readonly `code: BeaconErrorCode`, readonly `transportName: string`, optional `cause?: unknown`. Constructor sets `.name = 'BeaconError'` and `.cause` via `Object.defineProperty` for ES2022 compatibility. NOT re-exported from `src/transport-beacon/index.ts` (internal-only). Zero imports from `src/internal/**` or any other top-level source dir.
  Parallel: Yes

- [X] T005 [P] Implement endpoint validation in `src/transport-beacon/endpoint-validation.ts`
  Acceptance: Exports `validateEndpoint(endpoint: string, allowInsecureLoopback: boolean): URL` that returns a parsed `URL` on success and throws a typed error matching F-1's matrix on every violation (non-string endpoint, parse failure, non-HTTPS without flag, non-loopback HTTP with flag). Loopback allowlist: `localhost`, `127.0.0.1`, `[::1]` (the bracketed-IPv6 form is canonicalised by `URL` to host `[::1]` — accept the `URL.hostname` form which is `'[::1]'`). Error messages name the field, the violation, and the offending value. Pure function; no side effects.
  Parallel: Yes

- [X] T006 [P] Implement delivery primitives in `src/transport-beacon/delivery.ts`
  Acceptance: Exports `tryBeacon(endpoint: string, payload: string): boolean` (wraps `navigator.sendBeacon` with a `Blob('application/json')`; returns false on unavailable or false-return; never throws) and `tryFetchKeepalive(endpoint: string, payload: string): Promise<boolean>` (POST + keepalive + `credentials: 'same-origin'`; resolves true on 2xx, false on non-2xx or unavailable; rejection bubbles to caller). Exports `getPayloadByteLength(payload: string): number` using `new TextEncoder().encode(payload).length`. Exports `BEACON_SIZE_LIMIT_BYTES = 65536` constant. Zero imports from `src/internal/**`.
  Parallel: Yes

- [X] T007 [P] Implement lazy lifecycle helper in `src/transport-beacon/lifecycle.ts`
  Acceptance: Exports `installPagehideHandler(handler: () => void): () => void` that adds a `'pagehide'` listener (gated by `typeof globalThis.addEventListener === 'function'`) and returns an `uninstall()` function. Calling `install...` twice is a no-op on the second call (uses a closure-private `installed` flag in the returned API: in practice the caller maintains the flag — this module only provides the primitives). Module is side-effect-free at import.
  Parallel: Yes

- [X] T008 Add bundle-shape & boundary security test in `tests/security/transport-beacon-bundle-shape.security.test.ts`
  Acceptance: Asserts (a) every `.ts` file under `src/transport-beacon/**` has no import statement resolving to `src/internal/**`, `src/runtime/**`, `src/pipeline/**`, `src/config/**`, `src/context/**`, or `src/transport/**` (regex scan over the source — type-only imports from `'../api/types.js'` are permitted); (b) the built `dist/transport-beacon.{mjs,cjs}` does not contain any vendor-package name (`@opentelemetry`, `@datadog`, `dd-rum`, `@sentry`) or vendor-identifier (mirror of feature 001's T049 list); (c) the built `dist/index.{mjs,cjs,d.ts}` does not contain `createBeaconTransport`, `BeaconError`, the `oversized_event` / `beacon_batch_drop` / `beacon_unavailable` literal strings, or other beacon-source-distinctive symbols; (d) `gzipSync(readFileSync('dist/transport-beacon.mjs')).length <= 5120`. Build step is a hard prerequisite (mirror feature 001's `beforeAll` pattern).
  Parallel: No

- [X] T009 [P] Add public-API contract test scaffolding in `tests/contract/transport-beacon.contract.test.ts`
  Acceptance: Tests assert TB-1..TB-12 from `contracts/transport-beacon-public-api.md`. TB-1 (exactly 2 exports), TB-2 (default entry surface unchanged from v1), TB-3 (returned `Transport` shape), TB-7 (default-config `assertTransportContract` from `./testing` passes; batching-config variant exists as a skipped test until US3), TB-8 (`name` defaulting/override), TB-9 (multi-instance independence), TB-10 (synchronous construction + sync `send`), TB-12 (`exports` map gains exactly one entry; no new deps). With only T003's stub in place, every test fails — the suite is the contract bar for US1 to clear.
  Parallel: Yes

**Checkpoint**: Foundation ready — Phase 3 (US1) can begin in parallel
with Phase 4 (US2) and Phase 5 (US3).

---

## Phase 3: User Story 1 — Host application configures HTTPS delivery without writing transport plumbing (Priority: P1) 🎯 MVP

**Goal**: A single-app consumer can `import { createBeaconTransport }` from the
new subpath, pass an HTTPS endpoint, and ship structured events over the wire
with body-only delivery, pagehide-safe.

**Independent Test**: Configure a fresh runtime with one beacon transport
pointed at an HTTPS endpoint; emit one `warn` event; assert exactly one
HTTPS body-only network call leaves the page; assert no fixture value reaches
the URL.

### Tests for User Story 1 ⚠️

> Write these tests FIRST, ensure they FAIL against T003's stub before
> implementing T016/T017.

- [X] T010 [P] [US1] Endpoint validation matrix in `tests/unit/transport-beacon/endpoint-validation.test.ts`
  Acceptance: Covers F-1's matrix and TB-5 + TB-6. Cases: `'https://logs.example.com/ingest'` (pass), `'http://logs.example.com'` (throws, names scheme constraint), `'ws://...'` / `'file:///...'` / `''` / non-string (throws), `'http://localhost'` with `allowInsecureLoopback: false` (throws), `'http://localhost'` with `allowInsecureLoopback: true` (pass), `'http://127.0.0.1:4318'` with flag (pass), `'http://[::1]'` with flag (pass), `'http://example.com'` with flag (throws — non-loopback), `'http://my-dev-server'` with flag (throws — non-loopback). All thrown errors name the field + violation + offending value.
  Parallel: Yes

- [X] T011 [P] [US1] Delivery primitives unit tests in `tests/unit/transport-beacon/delivery.test.ts`
  Acceptance: Covers D-2..D-7, F-2, F-3, F-4, F-7. Uses `tests/helpers/beacon-network.ts` doubles. Cases: payload is exactly `JSON.stringify(event)` (D-2); size check precedes primitive call (D-3, F-2); `sendBeacon` called with `Blob('application/json')` (D-4); fetch fallback call shape matches `{ method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' }, credentials: 'same-origin' }` (D-5); sendBeacon true → no fetch (D-6); sendBeacon false → fetch called once (D-6); sendBeacon undefined → fetch called once (D-6); both undefined → drop with `beacon_unavailable` notice (D-7, F-3); fetch rejects → drop with `transport_send_failed` notice carrying `.cause` (F-4, F-7); fetch non-2xx → drop with `transport_send_failed` (D-5 / F-4).
  Parallel: Yes

- [X] T012 [P] [US1] Lifecycle unit tests in `tests/unit/transport-beacon/lifecycle.test.ts`
  Acceptance: Covers D-10, D-12. Cases: first `send()` installs exactly one `'pagehide'` listener (D-10); second `send()` installs zero additional listeners; `shutdown()` removes the listener; `shutdown()` called twice is a no-op (idempotent — D-12); `send()` after `shutdown()` is a no-op (no encoding, no primitive call, no notice — D-12); `installAddEventListenerSpy` confirms no `visibilitychange` or `beforeunload` listener is ever installed.
  Parallel: Yes

- [X] T013 [P] [US1] End-to-end secret sweep in `tests/security/transport-beacon-secret-sweep.security.test.ts`
  Acceptance: Mirrors feature 001's `tests/integration/secret-sweep.integration.test.ts`. Configures a runtime with one beacon transport (test-double sendBeacon recording bodies) and emits 100+ events whose attributes/message/error/context carry every value from `makeSecretFixture()` (from `@your-org/frontend-logging-sdk/testing`). Asserts: (a) every recorded body parses as a JSON `LogEvent`, (b) `JSON.stringify` of every recorded body matches none of the fixture values (i.e., redaction happened upstream and the wire never carries them), (c) every recorded URL is exactly the configured endpoint string (no fixture value reaches the URL). Locks SC-004.
  Parallel: Yes

- [X] T014 [P] [US1] Construction-sweep performance test in `tests/performance/transport-beacon-construction.performance.test.ts`
  Acceptance: Constructs 1,000 beacon transports in a tight loop with `installAddEventListenerSpy` + `installSetTimeoutSpy` + a `fetch` / `sendBeacon` call counter installed. Asserts: zero listener installations, zero timer creations, zero `fetch` calls, zero `sendBeacon` calls, zero reads of `window.location` / `document.cookie` / `localStorage` (asserted via property-access proxies installed before the loop). Asserts memory use is O(N) — total allocations measured via a per-test allocation probe stay within a documented per-instance budget × 1000. Locks SC-006, TB-4.
  Parallel: Yes

- [X] T015 [P] [US1] Extend `assertTransportContract` integration in `tests/contract/transport-beacon.contract.test.ts`
  Acceptance: Extends T009's scaffolding. The TB-7 default-config block now runs the full `assertTransportContract` helper from `@your-org/frontend-logging-sdk/testing` against `createBeaconTransport({ endpoint: 'https://logs.example.com/ingest' })`. T-1..T-9 and T-S1..T-S5 all pass. The batching-config variant remains skipped (US3 will unskip).
  Parallel: Yes

### Implementation for User Story 1

- [X] T016 [US1] Implement default-mode `createBeaconTransport` in `src/transport-beacon/beacon-transport.ts`
  Acceptance: Composes T004 (BeaconError) + T005 (endpoint-validation) + T006 (delivery primitives) + T007 (lifecycle). Construction: validates options shape (data-model.md validation rules); validates endpoint; allocates instance state (`buffer = []`, `pagehideInstalled = false`, `shutdownComplete = false`, `notified = { ...all false }`); returns a plain-object `Transport` with `name`, `send`, `flush`, `shutdown` methods. `send(event)`: if `shutdownComplete`, no-op; encode + size-check + dispatch per D-3..D-7; on async fetch rejection emit `transport_send_failed` via `options.onInternalError` once per session. `flush()`: no-op (default mode). `shutdown()`: removes pagehide listener, marks `shutdownComplete`, resolves. Idempotent. NEVER throws from `send`/`flush`/`shutdown`. Every notice is rate-limited per `state.notified[code]`. T010..T015 pass.
  Parallel: No (depends on T004–T007)

- [X] T017 [US1] Wire subpath exports in `src/transport-beacon/index.ts`
  Acceptance: Replaces T003's `throw new Error('not implemented')` stub with the real export. Re-exports `createBeaconTransport` from `./beacon-transport.js` and `BeaconTransportOptions` from `./beacon-transport.js` (or wherever the public type ends up). No other names exported. `tests/contract/transport-beacon.contract.test.ts` TB-1 (exactly 2 names) passes. `npm run build` produces a bundle whose gzipped size is well under 5 KiB.
  Parallel: No (depends on T016)

- [X] T018 [US1] Update host-app example in `examples/host-app/index.ts` and `examples/host-app/package.json`
  Acceptance: `index.ts` imports `createBeaconTransport` from `@your-org/frontend-logging-sdk/transport-beacon`, removes any hand-rolled fallback, and demonstrates the quickstart five-minute path with `onInternalError` wired into both `configureLogging` and `createBeaconTransport`. `package.json` does not depend on any vendor SDK. The example builds standalone.
  Parallel: No (depends on T017)

- [X] T019 [US1] Validate quickstart against a scripted harness in `tests/integration/transport-beacon-quickstart.integration.test.ts`
  Acceptance: A new vitest integration test (running under happy-dom) embeds the exact "Five-minute path (single application)" code block from `quickstart.md` and asserts it compiles + runs successfully. The test imports `createBeaconTransport` from the package's published subpath (resolved via the package's `exports` map, not a relative source path), configures the runtime, emits one `warn` and one `error` event, and asserts both reach the test-double `sendBeacon` with the documented body shape. The test also asserts the `quickstart.md` code block matches the test's embedded source line-for-line (a small fixture-comparison helper guards against drift). No "manual" validation path.
  Parallel: No (depends on T018)

- [X] T019a [US1] Review boundary: confirm US1 acceptance
  Acceptance: TB-1..TB-12 (excluding TB-7 batching variant), D-1..D-12, F-1..F-4, F-7 all pass against the implementation. SC-001 (≤5-minute configure-and-ship), SC-002 (default-config `assertTransportContract` passes), SC-004 (no fixture leak), SC-006 (1,000-transport construction sweep), SC-007 (default entry bit-identical-or-smaller against pre-feature snapshot) verified. `tests/security/transport-beacon-bundle-shape.security.test.ts` passes including the 5 KiB gzipped budget. No regressions in feature 001's existing test groups.
  Parallel: No

**Checkpoint**: US1 fully functional. The package now ships a first-party
HTTPS beacon transport for single-app consumers. MVP ready.

---

## Phase 4: User Story 2 — Federated modules share the host's beacon transport without setup or interference (Priority: P2)

**Goal**: A federated module developer's module loads into a host application
that has already configured the beacon transport at boot. The module calls
`createLogger({ module })` and emits events. Events flow through the host's
transport, attributed to the module via `context.module`.

**Independent Test**: One host configures one beacon transport; 50 synthetic
module loggers each emit 20 events through it; assert exactly 1,000 events
delivered, each carrying correct module identity, no additional listeners
attached after the first emission.

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Multi-module integration test in `tests/integration/transport-beacon-host-module.integration.test.ts`
  Acceptance: One host calls `configureLogging({ transports: [createBeaconTransport({ endpoint, onInternalError })] })`. 50 synthetic module loggers are created via `createLogger({ module: { name: `mod-${i}` } })`. Each emits 20 events at mixed levels. Asserts: exactly 1,000 network calls (recorded via the sendBeacon double); every recorded body's `context.module.name` is in the set `{ mod-0, ..., mod-49 }` with exactly 20 occurrences per module; no two recorded bodies are byte-identical (covers FR-023, SC-005). Asserts exactly one `'pagehide'` listener installed across all 1,000 emissions (FR-024).
  Parallel: Yes

- [X] T021 [P] [US2] Multi-instance independence test in `tests/integration/transport-beacon-host-module.integration.test.ts` (same file as T020)
  Acceptance: Configures TWO beacon transports against TWO different endpoints in the same runtime. 100 events emitted via one logger; each transport's recorded bodies asserted equal (every transport receives every event). Each transport installs ITS OWN `'pagehide'` listener (asserted via the `addEventListener` spy: two install calls, distinct handler references). A drop forced on one transport (configure its fetch double to reject) emits a notice naming that transport's `name`; the other transport's notices are not affected. Locks FR-024, TB-9.
  Parallel: Yes

### Implementation for User Story 2

- [X] T022 [US2] Update federated-module example in `examples/federated-module/index.ts`
  Acceptance: The module imports `createLogger` from `@your-org/frontend-logging-sdk` only — it does NOT import `createBeaconTransport` and does NOT call `configureLogging`. The module's emissions flow through the host's runtime. The example's README explains the host-owns-transport contract referencing FR-030..FR-032 from feature 001.
  Parallel: No

- [X] T023 [US2] Update host-app example to drive a federated-module-style scenario
  Acceptance: The host-app example now configures the runtime once at boot and demonstrates importing two synthetic "modules" each calling `createLogger({ module })`. The example's output (in `console.log` or recorded to a fixture) shows distinct `context.module.name` per logger.
  Parallel: No

- [X] T023a [US2] Review boundary: confirm US2 acceptance
  Acceptance: SC-005 verified (1,000 events delivered with correct module attribution, no duplication, no loss). FR-024 verified (multi-instance coexistence with independent listeners). No second listener installed when only the host transport is configured. T020 and T021 pass. Federated-module example builds and runs.
  Parallel: No

**Checkpoint**: US1 + US2 functional. Federated modules work without
their own transport setup.

---

## Phase 5: User Story 3 — Opt-in micro-batching surfaces every drop through the diagnostic hook (Priority: P3)

**Goal**: A consumer with high-volume telemetry opts into batching. Every
forced drop surfaces through `onInternalError` exactly once per batch with a
documented code.

**Independent Test**: Enable batching. Drive a scenario where exactly one
batch is forced to drop (sendBeacon returns false AND fetch rejects). Assert:
zero events delivered for that batch, exactly one `onInternalError` notice
with `code === 'beacon_batch_drop'` and the documented drop count, all
subsequent batches deliver normally.

### Tests for User Story 3 ⚠️

- [X] T024 [P] [US3] Batcher state-machine unit tests in `tests/unit/transport-beacon/batcher.test.ts`
  Acceptance: Tests B-5 (single-flush-attempt + buffer cleared before delivery) and B-8 (one-shot maxAge timer, armed once per batch, cancelled on flush). Uses `installSetTimeoutSpy`. Cases: pushing N < maxBatchSize events does not flush; pushing the (maxBatchSize)-th event flushes synchronously at the end of `push`; clearing the buffer happens BEFORE the network primitive is invoked (asserted by injecting a re-entrant push during the primitive's call); flush failure doesn't re-push events; timer is armed exactly once when the first event enters an empty batch; timer is cleared at flush; subsequent push after flush re-arms the timer.
  Parallel: Yes

- [X] T025 [P] [US3] Batching integration tests in `tests/integration/transport-beacon-batching.integration.test.ts`
  Acceptance: Covers B-1..B-12, F-2 (batch eject), F-5, F-8, and SC-010 (reconfigure-during-in-flight-batch). Cases (using `tests/helpers/beacon-network.ts` doubles): envelope shape `{ events: LogEvent[] }` with no extra fields (B-2); order preservation across 1,000 events with ascending `attributes.seq` (B-4); flush triggers (size, age, pagehide, shutdown, flush()) all fire correctly (B-3); oversized envelope (configure maxBatchSize × per-event-size > 64 KiB) → `beacon_batch_drop` notice (B-6); oversized single event ejected, remaining batch flushes (B-7, F-2); pagehide-fired flush failure emits one notice (B-9); shutdown with non-empty buffer + flush failure emits one notice and listener removed (B-10); drop notice payload contains no event content (B-11); `flush()` synchronizes against current batch only, returns immediately on empty buffer (B-12); rate-limit per code per transport per session (F-8). The `oversized_event` notice fires exactly once per session even across multiple oversized events. **SC-010 case**: call `configureLogging({ transports: [bt1] })` where `bt1` is a batching beacon transport against endpoint A; emit N < maxBatchSize events so `bt1` holds a pending batch; call `configureLogging({ transports: [bt2] })` with a different transport against endpoint B; assert (a) `bt1`'s pending batch was driven to completion (delivered to A) **OR** (b) exactly one `beacon_batch_drop` notice fired on `bt1`'s `onInternalError` — never both, never neither, never partial. Mirrors feature 001's `tests/integration/reconfigure-existing-references.integration.test.ts` precedent.
  Parallel: Yes

- [X] T026 [P] [US3] Unskip the batching variant of `assertTransportContract` in `tests/contract/transport-beacon.contract.test.ts`
  Acceptance: Removes the skip on T015's batching-config block. Runs `assertTransportContract(createBeaconTransport({ endpoint: 'https://logs.example.com/ingest', batching: { maxBatchSize: 10 } }))` and confirms T-1..T-9 and T-S1..T-S5 all pass against the batched transport. Locks SC-003, TB-7 batching variant.
  Parallel: Yes

### Implementation for User Story 3

- [ ] T027 [US3] Implement batcher state machine in `src/transport-beacon/batcher.ts`
  Acceptance: Exports `createBatcher(opts: { maxBatchSize: number; maxBatchAgeMs?: number; flush: (events: LogEvent[]) => void })` returning `{ push, flush, shutdown }`. State: `{ buffer: LogEvent[]; maxAgeTimer: ReturnType<typeof setTimeout> | null }`. `push(event)`: append to buffer; if `buffer.length === 1 && maxBatchAgeMs != null` arm a one-shot timer that calls `flush` once; if `buffer.length >= maxBatchSize`, call `flush(buffer)` after cancelling the timer and resetting state. `flush()`: if buffer is non-empty, copy out + clear buffer + cancel timer + call the provided flush callback. `shutdown()`: cancel timer; null the callback reference so timer callbacks queued before shutdown are no-ops. The module is import-pure; no listeners attached at module scope.
  Parallel: No (depends on T004–T007)

- [ ] T028 [US3] Wire batching path through `createBeaconTransport` in `src/transport-beacon/beacon-transport.ts`
  Acceptance: When `options.batching` is present and validated, instance state acquires a `batcher` from T027 whose `flush` callback runs the same delivery path as default-mode `send()` but with the envelope `{ events: LogEvent[] }` JSON-encoded and size-checked. Oversized envelope short-circuits to `beacon_batch_drop` notice (B-6). Oversized single event is ejected pre-push with `oversized_event` notice (B-7). `flush()` API method delegates to the batcher. `shutdown()` drains the batcher's buffer with one best-effort flush, then proceeds with listener removal. T024..T026 pass. T010..T015 still pass (default-mode regression).
  Parallel: No (depends on T027)

- [ ] T029 [US3] Update `quickstart.md` and `docs/safe-logging.md` with batching guidance
  Acceptance: `quickstart.md`'s "Opt-in batching" section is exercised by an integration test (similar to T019) that confirms the code sample compiles and runs. `docs/safe-logging.md` gains a "Beacon transport batching" subsection covering: envelope shape, when to enable, the `maxBatchSize × per-event-size < 64 KiB` rule, drop-notice routing, the recommendation to wire `onInternalError` to both places. No insecure-pattern normalization (e.g., no URL-based fallback discussion outside of explicit "rejected — forbidden by T-S1..T-S5" framing).
  Parallel: No

- [ ] T029a [US3] Review boundary: confirm US3 acceptance
  Acceptance: SC-003 (batching `assertTransportContract` passes), SC-009 (one drop notice per forced batch drop), SC-010 (reconfigure during in-flight batch drives drain or one drop notice) verified. B-1..B-12, F-2 batch path, F-5, F-8 all pass. Order preservation across 1,000 events asserted. T024..T029 pass. No regression in T010..T021.
  Parallel: No

**Checkpoint**: All three user stories functional. Feature is feature-complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Audits, regressions, documentation, and the consumer-example
migration that completes the feature.

- [ ] T030 [P] Extend `tests/contract/dependency-pins.test.ts` (feature 001) with a beacon-subpath audit
  Acceptance: The existing dependency-pins test gains a new block that asserts after this feature: `package.json` `dependencies` is still empty (no new runtime deps); `package.json` `devDependencies` adds no new vendor SDK; `package.json` `exports` map contains exactly three entries (`.`, `./testing`, `./transport-beacon`) with the documented `types` / `import` / `require` shape on each. Locks TB-12.
  Parallel: Yes

- [ ] T031 [P] Remove the obsolete consumer example in `examples/shared/beacon-transport.ts`
  Acceptance: The file is deleted. Any imports of it from `examples/host-app/` and `examples/federated-module/` already migrated to the first-party transport in T018 / T022 are double-checked. The `examples/shared/` directory may keep a README pointing readers at the first-party transport, but the JavaScript file is gone (feature 001's "consumer example" contract is satisfied by the first-party transport now). `git grep -l 'examples/shared/beacon-transport'` returns nothing.
  Parallel: Yes

- [ ] T032 [P] Document the beacon transport in `docs/safe-logging.md`
  Acceptance: New section "Beacon transport (first-party HTTPS peer transport)" covers: import path; HTTPS-only construction with the loopback opt-in pattern (explicit, never ambient); body-only delivery guarantee; the documented drop scenarios with their `BeaconErrorCode` values; the recommendation to wire `onInternalError` into both `configureLogging` and `createBeaconTransport`; multi-instance coexistence; the migration note from `examples/shared/beacon-transport.ts`. No insecure-pattern normalization. Locks SC-011.
  Parallel: Yes

- [ ] T033 [P] Update top-level README.md quickstart
  Acceptance: The "Quickstart" section in `README.md` is updated to show the new beacon transport as the recommended HTTPS path (alongside `ConsoleTransport` and `NoopTransport`). The example uses the same shape as `quickstart.md`'s five-minute path. Existing v1 quickstart content remains; the beacon section is additive.
  Parallel: Yes

- [ ] T034 Final secret-sweep regression
  Acceptance: Re-runs `tests/security/transport-beacon-secret-sweep.security.test.ts` against the final implementation. Expands the fixture set to include batching scenarios (configure batching: 10; emit 100 events with fixture values; assert zero fixture leak across recorded envelopes too). SC-004 fully verified for both default and batching modes.
  Parallel: No

- [ ] T035 Final lightweight-construction regression
  Acceptance: Re-runs `tests/performance/transport-beacon-construction.performance.test.ts` against the final implementation. Confirms 1,000-instance construction still passes the zero-listener / zero-timer / zero-ambient-read / O(N)-memory invariants. Locks SC-006, FR-027.
  Parallel: No

- [ ] T036 Final bundle-shape regression
  Acceptance: Re-runs `tests/security/transport-beacon-bundle-shape.security.test.ts`. Confirms (a) default entry `dist/index.{mjs,cjs,d.ts}` is bit-identical or smaller than the pre-feature snapshot (SC-007) — checked via the existing feature-001 size snapshot file or a freshly captured pre-feature snapshot; (b) `dist/transport-beacon.mjs` gzipped ≤ 5120 bytes (SC-008); (c) no vendor SDK references; (d) no source-boundary violations. Includes a check that the `examples/shared/beacon-transport.ts` removal has not regressed any other test.
  Parallel: No

- [ ] T037 Final review boundary: Constitution v1.2.0 compliance + SC verification
  Acceptance: A documented checklist run-through:
  - **I. Stable Consumer API**: default entry surface bit-identical to v1 (verified by surface-reflection test); only one new subpath; safe path is the easy path.
  - **II. Browser Resilience**: every primitive wrapped; never throws from `send`/`flush`/`shutdown`; `SafeTransport` defense-in-depth verified.
  - **III. Framework-Neutral Structured Observability**: JSON-encoded events or `{events: LogEvent[]}` envelope; no vendor data model; bounded shape inherited from the pipeline.
  - **IV. Secure & Privacy-Safe**: HTTPS at construction; loopback opt-in only; body-only; no Authorization header; no cross-origin cookies.
  - **V. Testable, Minimal, Maintainable**: dedicated test groups; first-party transport replaces the consumer example; documentation models safe usage.
  - **VI. Log Integrity**: every drop notice surfaces with a documented code; no silent reorder/dedup/mutate; batching preserves emission order.
  - **VII. Lightweight & Federated Runtime**: 1,000-transport construction sweep verified; multi-instance coexistence verified; isolated duplicate-copy classification inherited from feature 001.
  - **SC-001..SC-012** each cross-referenced to its locking test. Any SC without a locking test is flagged for follow-up.
  Output: a single markdown file `specs/002-beacon-transport/checklists/final-review.md` recording the pass status of each item. Outstanding items (if any) blocked from merge.
  Parallel: No

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. T003 depends on T001. T004–T007 depend on T003. T008 depends on T001 (needs build output) and T003 (needs subpath source to scan). T009 depends on T003.
- **User Stories (Phase 3+)**: Depend on Foundational. With staffing, US1, US2, and US3 can run in parallel after Phase 2.
- **Polish (Phase 6)**: Depends on US1, US2, and US3 completion.

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2. Delivers the MVP.
- **US2 (P2)**: Depends on Phase 2 directly; integrates with US1's `createBeaconTransport` implementation (T016). May start its tests (T020, T021) in parallel with US1's implementation but the tests fail until T016 lands. Implementation tasks (T022, T023) depend on T017.
- **US3 (P3)**: Depends on Phase 2 directly; integrates with US1's default-mode implementation. Tests can be drafted in parallel with US1 but their assertions need T016+T027+T028 to pass.

### Within Each User Story

- All tests within a story are independent of each other (different files) → marked `[P]`.
- Tests precede implementation (TDD pattern from feature 001).
- Implementation tasks are sequential when they share a file (T016 → T017, T027 → T028).
- Documentation tasks depend on implementation.
- Review-boundary task closes the story.

### Parallel Opportunities

- T002 (Setup helpers) parallel with T001 once T001's directory creation lands.
- T004, T005, T006, T007 (Foundational primitives) all parallel after T003.
- T009 (contract scaffolding) parallel with T004–T007 once T003 lands.
- Within US1: T010, T011, T012, T013, T014, T015 all parallel.
- Within US2: T020, T021 parallel; T022 and T023 parallel (different files).
- Within US3: T024, T025, T026 parallel.
- Polish: T030, T031, T032, T033 parallel.

---

## Parallel Example: User Story 1 implementation kickoff

```bash
# Once Phase 2 completes, launch all US1 tests in parallel:
Task: "Endpoint validation matrix in tests/unit/transport-beacon/endpoint-validation.test.ts"
Task: "Delivery primitives unit tests in tests/unit/transport-beacon/delivery.test.ts"
Task: "Lifecycle unit tests in tests/unit/transport-beacon/lifecycle.test.ts"
Task: "End-to-end secret sweep in tests/security/transport-beacon-secret-sweep.security.test.ts"
Task: "Construction-sweep performance test in tests/performance/transport-beacon-construction.performance.test.ts"
Task: "Extend assertTransportContract integration in tests/contract/transport-beacon.contract.test.ts"

# Then implementation (sequential — same file):
Task: "Implement default-mode createBeaconTransport in src/transport-beacon/beacon-transport.ts"
Task: "Wire subpath exports in src/transport-beacon/index.ts"
Task: "Update host-app example in examples/host-app/index.ts"
Task: "Validate quickstart against the host-app example"
Task: "Review boundary: confirm US1 acceptance"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (BLOCKS all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: TB-1..TB-12, D-1..D-12, F-1..F-4, F-7, SC-001/002/004/006/007.
5. Ship MVP: HTTPS-only single-app beacon transport with no batching, no federated coordination logic.

### Incremental Delivery

1. Setup + Foundational → Foundation ready.
2. Add US1 (HTTPS single-app) → Test independently → Ship MVP.
3. Add US2 (federated module) → Test independently → Ship.
4. Add US3 (opt-in batching) → Test independently → Ship.
5. Polish phase closes the feature.

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together.
2. Once Foundational done:
   - Developer A: US1 (delivers the MVP).
   - Developer B: US2 (depends on US1's implementation file but can write tests in parallel).
   - Developer C: US3 (depends on US1's implementation file but can write batcher + tests in parallel).
3. Stories complete and integrate independently.

---

## Notes

- `[P]` tasks = different files, no dependency on incomplete tasks.
- `[Story]` label maps task to specific user story for traceability.
- Each user story is independently completable and testable.
- Verify every test fails against the stub before its implementation lands (TDD discipline from feature 001).
- Commit after each task or logical group (auto-commit cadence per `/home/johng/.claude/projects/.../memory/feedback_auto_commit_per_task.md`).
- Stop at any checkpoint to validate the story independently.
- Avoid: vague task scope, same-file conflicts, cross-story dependencies that break independence, drift from the contracts (TB / D / B / F numbering is the spec — keep tasks anchored to those IDs).
