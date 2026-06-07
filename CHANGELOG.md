# Changelog

All notable changes to **SafeSignal** (`@tallyrow/safesignal`) are
documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `./transport-otlp`: Add opt-in OTLP protobuf encoding via `encoding: 'protobuf'`
  option (zero deps, hand-built wire format). Produces 30–60% smaller payloads
  and is accepted by a wider range of OTLP collectors. JSON remains the default.

## [1.4.0] — 2026-06-03

### Added — React error handling via `./framework-react` (Feature 018)

Opt-in `@tallyrow/safesignal/framework-react` subpath — the no-globals,
per-component counterpart to `./capture`. A `<LogErrorBoundary>` catches
descendant render/lifecycle errors and a `useLogError()` hook reports the errors
a boundary cannot (event handlers, async), both routed through a
consumer-provided `Logger`'s existing secure pipeline.

- **Fail-closed + fail-safe**: emits via `logger.error`, so messages, stacks, and
  the React component stack are redacted/sanitized (drop-on-failure) before any
  transport; a logging or `onError` throw is swallowed and the fallback still
  renders (no catch/render loop).
- **No globals** (Principle VIII): patches nothing, attaches no `window`
  listeners; errors flow only through the resolved logger (via `LoggerProvider`
  context or an explicit `logger` prop). With no logger resolvable, a safe no-op.
- **React is an externalized optional peer** (`>=16.8`): the core entry and every
  other subpath stay React-free. Events carry `safesignal.source:
  'react-error-boundary'` / `'react-use-log-error'` and
  `safesignal.react.componentStack`. (Issue #17.)

### Added — Vue error handling via `./framework-vue` (Feature 020)

Opt-in `@tallyrow/safesignal/framework-vue` subpath — the Vue 3 counterpart of
`./framework-react`. A side-effect-free `createErrorHandler(logger)` factory and a
`safesignalErrorHandler` plugin wire `app.config.errorHandler`; `useLogError()`
reports caught errors and `useErrorCapture()` is a subtree boundary (wraps
`onErrorCaptured`, stopping propagation by default). All routed through a
consumer-provided `Logger`.

- **Fail-closed + fail-safe**: emits via `logger.error` (the same
  sanitize → redact pipeline); logging and `onError` throws are swallowed.
- **No globals** (Principle VIII): no `window` listeners, no patching; the logger
  is resolved explicitly or via `provide`/`inject` (`loggerKey`). With no logger
  resolvable, a safe no-op.
- **Vue is an externalized optional peer** (`>=3.0`): the core entry and every
  other subpath stay Vue-free. Events carry `safesignal.source:
  'vue-error-handler'` / `'vue-use-log-error'` / `'vue-error-captured'`, plus
  best-effort `safesignal.vue.info` / `safesignal.vue.componentName`. (Issue #18.)

### Docs — sharpened product focus (README)

The README now **leads with the shipped developer-value features** — a
"What you get" section headlining ⭐ silent-error capture (`./capture`,
uncaught exceptions + unhandled rejections), dev-mode console rendering
(`./dev-console`), error breadcrumbs, readable source-mapped error stacks
(`./stacks`), the React error boundary + hook (`./framework-react`), and the
Vue errorHandler adapter (`./framework-vue`) — each linking to its section.

It also **removes the forward-looking RUM/monitoring-backend scope** from the
roadmap, replacing it with a plain present-tense boundary: SafeSignal captures
your errors and ships them securely to any backend; it is **not** a
RUM/monitoring product or server. The legitimate OTLP/HTTP+protobuf transport
roadmap item is retained.

Living docs only — historical `specs/**` records are left as point-in-time
documents. No package code, public API, runtime behavior, or `exports` changed.
(Issue #19.)

### Changed — repository moved from GitLab to GitHub

SafeSignal's canonical home is now
[`github.com/TallyRow/safesignal`](https://github.com/TallyRow/safesignal)
(previously GitLab). CI/CD runs on GitHub Actions
(`.github/workflows/ci.yml`, `.github/workflows/release.yml`); releases
publish to npm **with provenance** via the GitHub Actions OIDC Trusted
Publisher. `v1.3.0` was the first release published from GitHub.

- Contributor docs, issue/PR templates, and governance/security policy
  updated for GitHub (pull requests, `gh`, branch ruleset, GitHub Private
  Vulnerability Reporting).
- Dependency automation moved to the **Renovate GitHub App**; the legacy
  GitLab CI configuration was removed.
- The GitLab project is archived read-only with a pointer to GitHub.
- No package code, public API, runtime behavior, or `exports` changed.
  (Feature 010.)

## [1.3.0] — 2026-05-30

### Added — outbound `traceparent` header injection (Feature 009)

Complete the logs-to-traces correlation at the transport layer. The
`./transport-otlp` transport gains an optional `injectTraceparent?: boolean`
(default `false`) on `OtlpTransportOptions`: when enabled, a delivery request
whose flushed batch all shares one valid trace context carries a standard W3C
`traceparent` (and, when uniform, `tracestate`) **request header**, so a backend
or collector can join the ingest request to its trace.

- **Homogeneous-only, fail-closed**: the header is set only when every event in
  the batch shares one identical valid trace context; an empty, trace-less, or
  multi-trace batch sets no header (no arbitrary "representative" event).
  `tracestate` rides along only when identical across the batch and within the
  512-char bound.
- **Off by default & additive**: with the option unset/`false`, OTLP deliveries
  are byte-identical to before — no request header, unchanged event payloads and
  OTLP `LogRecord` output.
- **Carry-only & fail-safe**: built from the events' existing `context.trace`;
  no ids are minted, and header construction never throws into a logging call or
  blocks delivery.
- **Secure**: the header carries only trace identifiers + bounded `tracestate`;
  it never overwrites, duplicates, or exposes a consumer `headers` auth/secret
  value (a consumer-supplied `traceparent` wins).
- **Scope**: `./transport-otlp` only — `navigator.sendBeacon` cannot set custom
  request headers, so `./transport-beacon` is out of scope. The
  `./transport-otlp` bundle stays `@opentelemetry`-free and within its size
  budget.

No new runtime export, subpath, or `exports`-map entry; no change to the
default entry, `./testing`, or `./transport-beacon`. Backward compatible.

## [1.2.0] — 2026-05-30

This release bundles everything since `1.0.1`. The `1.1.0` version number was
internal-only and never published to npm; the `./transport-otlp` subpath it
introduced (Feature 007) ships here alongside W3C trace-context (Feature 008).

### Added — W3C trace-context propagation (Feature 008)

Correlate frontend logs with backend traces. A new optional `context.trace`
field (`{ traceId, spanId, traceFlags?, traceState? }`) carries host-supplied
**W3C Trace Context** on every event, and the `./transport-otlp` serializer
populates the OTLP `LogRecord`'s standard `traceId` / `spanId` / `flags` fields.

- **`parseTraceparent(header, tracestate?)`** — a new pure helper (exported from
  the default entry) that turns a W3C `traceparent` string into the structured
  shape; returns `undefined` on invalid input (never throws).
- **`TraceContext`** type exported from the default entry.
- **Carry-only**: SafeSignal never mints trace/span ids — no supplied context
  means no trace fields (no misleading correlation).
- **Fail-closed**: malformed/invalid trace input (bad hex, wrong length,
  all-zero id, oversized `tracestate`) is dropped; the event still ships and no
  call throws. Both ids are required; an invalid optional part is omitted while
  valid ids are kept.
- **Secure & vendor-neutral**: trace ids pass through redaction unchanged,
  `tracestate` is bounded (≤ 512 chars), and the `./transport-otlp` bundle stays
  `@opentelemetry`-free.
- Supply via the existing context path (`configureLogging` context /
  `withContext()` / the per-emit `correlation()` hook) — no new ambient reads,
  no per-`Logger` cost.

No change for events without trace context. Additive; backward compatible.

### Added — `./transport-otlp` subpath (Feature 007)

A new, additive `./transport-otlp` subpath exporting `createOtlpTransport`
(+ the `OtlpTransportOptions` type). It delivers SafeSignal's events to any
OTLP-compatible backend (Datadog, Honeycomb, Grafana, an OpenTelemetry
Collector, ClickHouse, …) as **OTLP/HTTP+JSON** logs.

- **Vendor-neutral & zero-dependency**: the OTLP-JSON payload is
  hand-serialized — no `@opentelemetry/*` runtime import, nothing
  vendor-specific in the bundle (gated by a bundle-shape security test).
- **Identity → OTLP Resource**: `service.name` / `service.version` /
  `deployment.environment`; `module.*` per `LogRecord`. Levels map to OTLP
  severity (5/9/13/17).
- **Fail-safe, no retry**: `fetch` + `keepalive` delivery; failed batches are
  dropped with one rate-limited `onInternalError` notice per failure class;
  bounded memory (buffered + in-flight cap). Never throws into the caller.
- **Secure**: auth headers are sent only on the wire — never in payloads,
  diagnostics, or the bundle. HTTPS-only (loopback `http://` requires explicit
  `allowInsecureLoopback`).
- **Lightweight & federated**: configured once at the runtime level; host owns
  it; duplicate package copies are isolated.

No change to the default entry, `./testing`, or `./transport-beacon` — fully
backward compatible. OTLP/HTTP+protobuf encoding is a roadmap follow-up behind
an internal encoding seam (no future public-API change).

## [1.0.1] — 2026-05-29

### Operational hardening (Feature 005) — first stable OIDC/provenance release

Promotes `1.0.1-rc.2` to stable. This is the first `@tallyrow/safesignal`
version published under the `latest` dist-tag via the GitLab CI release
pipeline with OIDC trusted publishing + SLSA provenance attestation. It
supersedes the manual bootstrap `1.0.1-rc.1` (which only existed because
npm trusted publishing cannot create a brand-new package).

No consumer-visible API change since `1.0.0` — this release ships the
Feature 005 CI/CD + release-workflow hardening (quality-gate pipeline,
signed-tag release pipeline, `main` default branch + branch protection,
provenance publishing). See the `1.0.1-rc.2` entry below for the full
list of release-pipeline fixes.

## [1.0.1-rc.2] — 2026-05-29

### Release candidate — first OIDC-published artifact (real F005 release-pipeline dogfood)

v1.0.1-rc.2 is the first version published by the **GitLab CI
release pipeline via OIDC trusted publishing with provenance**
(under the `next` dist-tag). It dogfoods the Feature 005 release
pipeline end-to-end. Once the RC soaks, a `v1.0.1` stable release
publishes under `latest`.

### Release-pipeline fixes (Feature 005 — surfaced by dogfooding)

- **Tag verification**: CI verifies the tag's SSH signature against
  a committed `.gitlab/allowed_signers` allowlist via `git tag -v`,
  instead of an empty runner keyring. Release tags are SSH-signed.
- **OIDC audience** corrected to `npm:registry.npmjs.org` (npm
  rejects the registry-URL form).
- **Auth**: removed the manual `_authToken` step — npm ≥ 11.5.1
  auto-detects the `NPM_ID_TOKEN` id_token; the publish job upgrades
  npm first (node:22 ships npm 10.x).
- **Provenance**: added the `SIGSTORE_ID_TOKEN` (aud `sigstore`)
  id_token required for `npm publish --provenance` on GitLab — npm
  signs the Sigstore attestation with a token distinct from the npm
  auth token.
- **Pipeline order**: `build` runs before `typecheck`/`test` so the
  public-API/quickstart tests resolve `@tallyrow/safesignal` via the
  built `dist/`.

No consumer-visible API change.

## [1.0.1-rc.1] — 2026-05-28

### Release candidate — bootstraps the npm package

**First npm artifact published for `@tallyrow/safesignal`.** v1.0.0
was an in-repo milestone (see note on the v1.0.0 entry below) but
never shipped to npm. v1.0.1-rc.1 is the first installable version
on the npm registry, published under the `next` dist-tag via a
**manual bootstrap publish** — npm trusted publishing cannot create
a brand-new package, so the first publish used an interactive
2FA-authenticated token to claim the name. OIDC/provenance
publishing from CI takes over from v1.0.1-rc.2 onward.

### Operational hardening (Feature 005)

- `.gitlab-ci.yml` quality-gate pipeline runs on every MR + every
  default-branch push: typecheck × 2 Node versions (20, 22), full
  test suite × 2, build × 2, bundle-invariance audit (±1 KiB
  gzipped delta vs merge-base), dependency-pins regression
  (`tests/contract/dependency-pins.test.ts` + the two
  `bundle-shape.security.test.ts` files), DCO sign-off check.
- Release pipeline triggered by signed `v*.*.*` git tags:
  verifies tag signature + ancestor-of-`main`; runs full
  quality-gate set; validates CHANGELOG entry; publishes to npm
  with provenance via GitLab OIDC trusted-publisher (NO
  long-lived `NPM_TOKEN` in CI variables).
- Default branch renamed from `master` to `main`. Branch
  protections on `main`: require MR + at least 1 approval + CI
  green + resolved threads; no direct push; no force-push.
- `README.md` Project resources section gains a CI pipeline
  status badge.
- `CONTRIBUTING.md` gains a "Cutting a release" section
  documenting the manual-CHANGELOG-first workflow,
  `git tag -s vX.Y.Z` syntax, pipeline-stage descriptions, npm
  provenance verification, and rollback procedure.
- `GOVERNANCE.md` updated to reference Feature 005 (this work)
  where it previously referenced "Feature 006" (a numbering
  drift from earlier planning).

### Preserved

- No `src/**` or `tests/**` modifications. No `package.json`
  `dependencies` / `devDependencies` changes. No `exports` map
  shape changes. The full test suite (48 files / 1,088 passing /
  10 todo / 0 failing / 0 unhandled) passes unchanged. Bundle
  sizes (`dist/index.mjs` ≈ 8,162 B gz, `dist/transport-beacon.mjs`
  ≈ 3,101 B gz) hold within ±1 KiB of the v1.0.0 milestone.
- All 7 constitutional principles preserved verbatim;
  Principles IV (Secure by Default) and V (Testable, Minimal,
  Maintainable) are operationally strengthened at the
  supply-chain + CI-enforcement layers without amendment.

## [1.0.0] — 2026-05-28

> **Note**: v1.0.0 was an in-repo version-bump and rename milestone
> documenting the project's transition from `@your-org/frontend-logging-sdk`
> to **SafeSignal** (`@tallyrow/safesignal`). No npm artifact was
> published for this version — the publish pipeline shipped in
> Feature 005 (CI/CD). The first installable version on npm is
> **v1.0.1-rc.1** (release candidate, `next` dist-tag) followed
> by **v1.0.1** (stable, `latest` dist-tag). The v1.0.0 entry
> below documents the project state at the rename milestone for
> historical reference.

### Renamed to SafeSignal

This release renames the project from its working identity
(`@your-org/frontend-logging-sdk`) to **SafeSignal**, published on
npm as `@tallyrow/safesignal`. TallyRow is the publishing
organization (npm scope); SafeSignal is the product.

**Migration** (from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`): see the [migration note in
`README.md`](./README.md#renamed-from-frontend-logging-sdk) for the
install command and the import-statement find-and-replace pattern.
The subpath suffixes (`/testing`, `/transport-beacon`) are
unchanged; only the package-name segment moves.

### Preserved (no behavior change in this release)

No runtime behavior, public API symbol name, type name,
function signature, redaction default, sanitizer limit, URL-scrubber
behavior, level-filter default, or transport security contract
changes in this release. The `exports` map shape — `.`, `./testing`,
`./transport-beacon` — is preserved verbatim. The dependency pin
set is unchanged. The full test suite passes unchanged
(48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled). Bundle
sizes remain within ±1 KiB of the pre-rename gzipped baseline:
`dist/index.mjs` ≈ 8,162 B (gz), `dist/transport-beacon.mjs` ≈ 3,101 B (gz).

### Why a major bump

Consumer `import` statements change (the package-name segment on
the left of the slash moves from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`), which is a consumer call-site change under
the constitution's Principle I (Stable Consumer API & Clear
Boundaries). Per semver, that requires a major version bump even
though the public API surface and behavior are otherwise unchanged.

### Repository

The GitLab project slug is renamed to `safesignal` under the
`tallyrow/` namespace:
`https://gitlab.com/tallyrow/safesignal`. GitLab issues HTTP
redirects from the old slug for the lifetime of the project, so
external links to the previous URL continue to resolve.
