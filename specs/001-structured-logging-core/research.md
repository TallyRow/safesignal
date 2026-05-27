# Phase 0 Research: Core Structured Logging API

This document resolves the technical unknowns for the core structured logging
package and records the decisions, rationales, and rejected alternatives that
inform Phase 1 (data model, contracts, quickstart) and Phase 2 (tasks).

All `NEEDS CLARIFICATION` items from Technical Context are resolved below.

> **Revision note 2026-05-27 (constitution v1.2.0, plan revision)**:
> R1's "OTel as default core backend" decision below is SUPERSEDED by
> plan.md's "OpenTelemetry Decision" section. The current decision is
> **Option B**: v1 ships only `NoopBackend` as the default; the OTel
> adapter is retained as a documented internal seam but is not on the
> default path. Bundle target ≤15 KB applies to the OTel-free default
> path. The R1/R2 mitigations below remain valid as the design seam
> for the future opt-in OTel feature, but the *default-backend choice*
> stated in R1 is no longer current. Treat plan.md as the source of
> truth.
>
> R-add-1 (this revision) also adds the Runtime Scale Architecture
> decision (`ConfiguredRuntime` + module-scoped active-runtime slot;
> duplicate-copy classification: **isolated**) — see plan.md's
> "Runtime Scale Architecture" section. Constitution Principle VII
> (new in v1.2.0) governs.

---

## R1. Internal foundation for structured logging

**Decision**: Use `@opentelemetry/api-logs` + `@opentelemetry/sdk-logs` as the
internal foundation, hidden behind a `TelemetryBackend` interface and never
exposed in public types. Sanitization and redaction sit **upstream** of the
backend, so swapping the backend cannot weaken security guarantees.

**Rationale**: Structured log record model maps cleanly to our `LogEvent`;
opens a path to OTLP/trace correlation without a second migration; isolation
prevents OTel API churn from breaking consumers.

**Alternatives considered**:
- Roll our own emitter — forfeits ecosystem reuse. Rejected.
- `pino` browser build — Node-centric, awkward in browsers. Rejected.
- `loglevel` + custom plugins — too thin; we'd re-invent the SDK. Rejected.

---

## R2. Isolating the experimental OTel Logs API

**Decision**: All `@opentelemetry/*` imports restricted to
`src/internal/telemetry/otel/**`. Enforced by a source-tree scan test and a
`.d.ts` contract test that fails if `opentelemetry` appears in published
declarations.

**Rationale**: One chokepoint for breaking changes; `NoopBackend` fallback
keeps the package functional if OTel init fails or deps are absent.

---

## R3. Public API shape & safe-path-is-easy-path design

**Decision**:
- One `Logger` interface (`debug|info|warn|error|child|withContext`).
- Factories: `createLogger(options?)`, `configureLogging(config)`,
  `getRootLogger()`.
- Built-in `ConsoleTransport`, `NoopTransport`.
- Security helpers: `createRedactor()`, `scrubUrl()`.
- `LogLevel` is a string union for tree-shaking and to avoid OTel
  `SeverityNumber` naming.
- `message` is always `string` (never `unknown`).
- `attributes` is typed as `Record<string, AttributeValue>` where
  `AttributeValue` is a constrained recursive union — no `unknown`, no
  `object`. This makes raw object dumping type-friction without forbidding it
  outright (the sanitizer still coerces stragglers).
- `error` arg on `logger.error()` is the **only** `unknown` parameter; it is
  immediately reduced to `{name, message, stack?}`.
- No `logger.dump`, `logger.raw`, or any "log this object" easy path exists.

**Rationale**: Mirrors familiar logger ergonomics while making the unsafe path
deliberately awkward. Spec FR-013, FR-016, FR-025 require the safe path to be
the default and easy.

**Alternatives considered**:
- Class-based `Logger` — worse tree-shaking and mocking. Rejected.
- Numeric severity model — internal mapping handles that. Rejected.
- Loose `attributes: Record<string, unknown>` — invites unsafe dumping at the
  type level. Rejected; constrain the type.

---

## R4. Environment-aware level defaults

**Decision**:

| Environment   | Default minimum level |
|---------------|------------------------|
| `production`  | `warn`                 |
| `development` | `debug`                |
| `test`        | `warn`                 |
| unknown       | `warn`                 |

Resolution order: per-logger `level` → root `LoggerConfig.level` (single or
per-env map) → env default → hard fallback `warn`. Environment is **never**
auto-detected.

**Rationale**: Satisfies FR-004, FR-021, SC-005. Treating unknown as `warn`
is the safest default for a package that cannot infer the environment.

---

## R5. Identity and correlation flow

**Decision**: Three fixed slots on `LogContext` — `application`, `module`,
`environment` — plus a free `attributes: Attributes` slot for correlation
values (trace ids, route, etc.). A `correlation()` callback fires per-emit
for dynamic data. The callback runs inside the dispatcher's try/catch and
cannot crash emit.

**Rationale**: Three explicit slots address the spec's three concerns (host,
module, environment) without inviting ad-hoc keys. The free slot keeps
correlation extensible. Per-emit callback covers dynamic values without
forcing static config to know them.

---

## R6. Sensitive-data redaction strategy

**Decision**: A `Redactor` is `(event: LogEvent) => LogEvent | null`,
synchronous. Built-in `createRedactor()` returns a redactor that walks
`attributes`, `context.attributes`, `message`, and the serialized `error`
object, masking values whose **key** matches the denylist
**and** values whose **shape** matches a known sensitive pattern (JWT,
common API-key prefixes, credit card / SSN digits).

Default denylist keys (case-insensitive regex match, key-name only — never
value substring):

```
^password$ | ^passwd$
^token$ | access[_-]?token | refresh[_-]?token | bearer[_-]?token
^authorization$ | ^auth$
^cookie$ | ^set-cookie$
^secret$ | api[_-]?key
session[_-]?id | sid
^ssn$ | credit[_-]?card | ^cardNumber$ | ^cvv$
^email$ (configurable; off by default — too lossy for many apps)
```

Default shape rules:
- JWT-shape: `^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$`
- Bearer prefix: `^Bearer\s+[A-Za-z0-9._\-]+$`
- Generic long high-entropy key (>= 32 char base64/hex): masked when key name
  also suggests a credential (intersection rule, to keep false positives low)

If a redactor throws, the dispatcher drops the event and invokes
`onInternalError` (**fail-closed**).

**Rationale**: Key-name matching avoids false positives in safe value text
(e.g., a product called `"tokenizer"` is not mangled). Shape rules catch
common credentials regardless of key name. Fail-closed prevents accidental
leakage during failures. Email is off by default because most apps log it
intentionally.

**Alternatives considered**:
- Allowlist instead of denylist — better safety, worse adoption. Rejected for
  v1; consumers can layer it via custom `Redactor`.
- Async redactor — adds Promise plumbing to a hot path. Rejected.
- Substring matching on values — catches more secrets but produces many
  false positives. Rejected; documented limitation.

---

## R7. Safe serialization & sanitizer

**Decision**: Add a `Sanitizer` stage to the pipeline that runs **before** the
redactor. Sanitization rules:

| Input                         | Output |
|-------------------------------|--------|
| Primitives                    | kept (with NaN/Infinity → null, bigint → String) |
| `Date`                        | ISO string |
| `Error`                       | `{name, message, stack?}` |
| Plain object                  | recursed (capped by depth, count) |
| Array                         | recursed (capped at 1000 elements) |
| Class instance, DOM node, framework object (Event, Promise, Map, Set, Window, etc.) | `"[<TypeTag>]"` — never recursed |
| Function                      | `"[Function]"` |
| Symbol                        | `"[Symbol]"` |
| Cyclic                        | `"[Circular]"` |
| Depth > 8                     | `"[MaxDepth]"` |
| > 256 total attribute keys    | excess replaced with one `"[Truncated]"` marker |
| String > 8192 chars           | truncated + `"...[truncated]"` suffix |

Sanitization **never throws** — every branch has a fallback. Consumers can
**tighten** limits via `LoggerConfig.sanitizerLimits` but cannot raise them
above the documented maxima (attempts clamp and emit one `onInternalError`).

**Rationale**: Spec FR-015, FR-016, FR-017, FR-018 require conservative safe
handling of unknown/oversized input. Type-tagging framework objects (instead
of recursing) avoids accidental traversal of large object graphs and avoids
invoking side-effectful getters (which is the path by which a `password`
getter could leak through a class instance).

**Alternatives considered**:
- Reject unknown input — too disruptive; rejected.
- Use `JSON.stringify` with a replacer — fails on cyclic refs and BigInt;
  weaker control over depth/size. Rejected.

---

## R8. Log-injection & output safety

**Decision**:
- `LogEvent` is the only thing transports receive. The package never emits a
  single concatenated newline-delimited string.
- A `ControlCharGuard` step in the pipeline escapes ASCII control characters
  (`\x00`–`\x1F` except `\t`, `\n`, `\r`) and the U+2028 / U+2029 line
  separators in every string value.
- Built-in `ConsoleTransport` passes the event as the **second argument** to
  `console[level]`. The first argument is the (escaped) `message` string.
  This prevents a user-controlled newline from forging a second log record in
  log files that pipe `console` output.
- Docs explicitly recommend `logger.info("payment failed", { code })` over
  template-string interpolation of values into the message.

**Rationale**: Spec FR-016, FR-017 require structured-only output and clean
boundaries between intended fields and untrusted input. Control-char escaping
is cheap and addresses the most common log-injection vector in browser
contexts (untrusted form input flowing into log messages).

---

## R9. Transport & transmission safety

**Decision**: The package does NOT ship an HTTP/beacon transport in v1.
`contracts/transport.md` requires consumer transports to:

- Use request body (POST/PUT JSON, or `navigator.sendBeacon` with a
  `Blob('...', { type: 'application/json' })`).
- NEVER place `LogEvent` data in URL paths, query strings, or fragments.
- Use HTTPS for any cross-origin delivery.
- Treat the received `LogEvent` as immutable.
- Tolerate multiple `flush()`/`shutdown()` calls.

The package supplies a test helper, `assertTransportContract(transport)`,
that consumer test suites can run to verify these properties — including a
hook that intercepts `fetch` and asserts no URL contains event-shaped data.

**Rationale**: Spec FR-013, FR-022, FR-023 require avoiding query-string
secret leakage and supporting application-owned ingestion. Not shipping an
HTTP transport keeps the public API small and the security contract explicit
at the transport boundary, where it can be tested.

**Alternatives considered**:
- Ship an HTTP transport — useful but locks in delivery shape. Rejected for
  v1; revisit in a future feature once ingestion patterns are firmer.

---

## R10. Behavior when no transport is configured

**Decision**: `NoopTransport` installed automatically when `transports` is
undefined or empty. Pipeline still runs (so sanitize/redact stay
observable in tests). One-time `onInternalError` notice in `production`.

**Rationale**: Matches FR-011, FR-019, FR-020. Pipeline running through noop
keeps the behavior predictable across environments.

---

## R11. Federated/module compatibility

**Decision**: No module-level singletons that touch globals.
`configureLogging()` writes to a module-scoped variable; each loaded copy of
the package owns its own root logger. Events stay distinguishable via
`context.application.name` and `context.module.name`.

**Rationale**: Module federation often loads the same package multiple times.
A `window`-scoped singleton would impose a sharing strategy we cannot
guarantee.

---

## R12. Build, packaging, and target

**Decision**:
- `tsup` ESM + CJS dual output, `.d.ts` declarations.
- ES2020 browser target.
- `package.json` `exports` map:
  - `.` → public runtime entry (no `internal/**` reachable).
  - `./testing` → test helpers (`assertTransportContract`,
    `makeSecretFixture`).
- `sideEffects: false`.

**Rationale**: Standard low-friction setup. Restricted `exports` prevents
consumers from reaching internals. Separate `/testing` subpath isolates test
helpers from runtime bundles.

---

## R13. Testing toolchain & security test discipline

**Decision**: `vitest` with `happy-dom`. Contract tests import only from the
package public entry. A dedicated `tests/security/` group ties every security
behavior to one or more FR/SC IDs from the spec. Coverage gates:
- 100% of public API exports executed by contract tests.
- 100% line coverage in `src/pipeline/sanitizer.ts`, `redactor.ts`,
  `url-scrubber.ts`, `control-char-guard.ts`.
- ≥ 90% line coverage in the rest of `src/pipeline/`, `src/transport/`,
  `src/internal/`.

**Rationale**: Security-critical code paths warrant 100% coverage gates so
regressions surface immediately. Tying each test to an FR/SC keeps audit
mapping cheap.

---

## R14. Performance envelope

**Decision**: Emission is O(N) in the size of the (bounded) attributes
object. The hot path is: level check → event-builder → sanitize → URL scrub →
redact → control-char guard → dispatch. Transport work is fire-and-forget.
No batching in v1.

**Rationale**: Spec FR-010, FR-020 require non-interruption of rendering /
interactions. The bounded sanitizer guarantees the cost is bounded even when
input is hostile.

---

## R15. Documentation and examples scope

**Decision**: Phase 1 produces `quickstart.md` (consumer onboarding) and
`contracts/*.md` (machine-readable-enough contracts: public-api, transport,
log-event, logger-config, failure-safety, redaction, sanitization). Two
example projects (`examples/host-app`, `examples/federated-module`) are
scaffolded at Phase 2. Both example HTTP transports use body-only delivery;
the quickstart includes a "Logging safely" section calling out anti-patterns.

**Rationale**: Per Principle V, examples that model unsafe behavior are
themselves a security defect — must be planned alongside the code.

---

All open clarifications resolved. Phase 1 proceeds.
