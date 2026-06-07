# Implementation Plan: Vue Error-Handling Adapter + Composables (`./framework-vue`)

**Branch**: `020-vue-error-handler` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-vue-error-handler/spec.md`

## Summary

Add a new opt-in `./framework-vue` subpath — the **Vue 3 counterpart to the shipped
`./framework-react` adapter** (feature 018 / issue #17). It routes Vue component-tree errors through
the consumer's existing `Logger` secure pipeline via `logger.error`, with **no globals** and **no side
effects**. Public surface: `createErrorHandler(logger)` (a side-effect-free factory returning a handler
for `app.config.errorHandler`), `safesignalErrorHandler` (a thin Vue plugin that wires the handler +
provides the logger), `loggerKey` (a Vue `InjectionKey<Logger>`, the parallel of React's
`LoggerContext`), `useLogError(loggerOverride?)` (stable manual-report callback), and
`useErrorCapture(options?)` (a subtree boundary wrapping `onErrorCaptured`, default stop-propagation).
`vue` is an externalized **optional peer** (`>=3.0.0`); the core `.` entry and every other subpath stay
Vue-free. **No new dependency in `dependencies`, no constitution change, no CI-workflow change.**

## Technical Context

**Language/Version**: TypeScript 5.x (strict), authored without JSX/SFCs — plain `.ts` using Vue's
runtime functions (`inject`, `provide`, `onErrorCaptured`, `getCurrentInstance`). ESM + CJS via tsup.

**Primary Dependencies**: **None new in `dependencies`.** `vue` (`>=3.0.0`) is an **optional peer**,
externalized from the bundle and provided by the consumer. Dev-only: `vue` (`^3.x`) for typecheck +
tests. The only intra-package import is **type-only** from `../api/types.js` (`Logger`, `Attributes`).

**Storage**: N/A.

**Testing**: Vitest + happy-dom. Mount/trigger via **raw `vue` `createApp`** into a happy-dom container
(no `@vue/test-utils` dependency — Principle VI; see research R7). Contract, integration, security
(redaction + bundle-shape), and import-boundary tests mirror the feature-018 set.

**Target Platform**: Modern browsers + SSR-safe; Vue 3 apps. Consumers on any framework keep the
Vue-free core.

**Project Type**: Reusable frontend package/library — additive distributed subpath.

**Performance Goals**: Zero per-`Logger` cost added; no timers, listeners, global patches, transports,
or ambient reads. The adapter is a pure function; composables only register a Vue lifecycle hook /
inject within an existing component instance.

**Constraints**: Browser-safe, privacy-safe, fail-closed (redaction drop-on-failure) and fail-safe
(swallow logging/callback throws). No globals (Principle VIII). Framework-neutral-preserving: `vue`
externalized so the core + every other subpath import zero Vue (Principle IV). Same verdict locally and
in CI (Principle IX).

**Scale/Scope**: `src/framework-vue/index.ts` (new); `package.json` (+exports triple, +optional peer,
+devDep); `tsup.config.ts` (+entry, +external); three hardcoded subpath-key lists reconciled; five new
test files; `README.md` section. Reused unchanged: the core `Logger` pipeline, all other subpaths.

## Constitution Check

> **Constitution version**: in-tree **v1.5.0**. This feature makes **no** constitution change.

- **Spec-Driven Development (I)** — ✅ Originates from spec.md; this plan precedes any code. Lifecycle
  followed: specify → (no clarify needed; forks resolved up front) → plan → tasks → analyze → implement.
- **Stable Consumer API & Deprecation (II)** — ✅ Purely **additive**: a new `exports` key + new
  optional peer. No existing API/type/behavior changes; nothing deprecated. The safe path is the easy
  path — defaults are fail-closed/fail-safe; examples never dump props/state or disable redaction.
- **Browser Resilience & Failure Safety (III)** — ✅ Every emission and consumer callback is wrapped so
  a throw/rejection cannot reach the consumer call site; redaction failures fail closed via the existing
  pipeline. A throwing logger never prevents the boundary's fallback or the app from continuing.
- **Framework-Neutral (IV)** — ✅ `vue` is an externalized optional peer; the core entry and all other
  subpaths import zero Vue. Host apps and federated modules consume via the same `Logger` contract. The
  adapter conforms to Vue's own published error hooks (`app.config.errorHandler`, `onErrorCaptured`)
  rather than inventing a capture mechanism.
- **Secure & Privacy-Safe by Default (V)** — ✅ All emission goes through `Logger.error`, so messages,
  stacks, the Vue `info` string, and consumer attributes are sanitized/URL-scrubbed/redacted before any
  transport. No new bypass. Props/state/component data are **not** auto-captured. No env/build-mode
  downgrade.
- **Log Integrity & Monitoring Suitability (VII)** — ✅ Emits ordinary structured `error` events,
  machine-parseable + origin-attributable, marked with `safesignal.source` (`vue-error-handler` /
  `vue-use-log-error` / `vue-error-captured`). No new drop/sample/batch/reorder beyond the pipeline's
  existing fail-closed drop.
- **Lightweight Logger & Federated Runtime (VIII)** — ✅ No per-`Logger` init, no shared mutable
  module-global. The adapter/composables operate solely through the explicitly resolved logger. `vue`
  externalized ⇒ duplicate package copies are **isolated**; host owns the runtime, modules don't
  replace it.
- **Reproducible Verification (IX)** — ✅ All checks run via `npm run verify` (+ `surface:check`),
  identical locally and in CI. Tests need built `dist/` for bundle-shape/parity — `verify` builds first.
  Test code under `tests/` held to `src/` standards. No tolerated relaxation.
- **Mechanical Enforcement (X)** — ✅ Each gate paired with a fail-closed test (mapping in
  `contracts/framework-vue.md`): API/emission contract, integration, redaction, bundle-shape,
  import-boundary, and the three parity lists. Adds enforcement, removes none.
- **Supply-Chain Integrity & Provenance (XI)** — ✅ Touches the distributed surface (adds one `exports`
  entry + one optional peer). `dependencies` stays empty; packaged files stay `["dist"]`; bundle
  externalizes `vue` and stays vendor-neutral. Attested publish, signed tags, DCO, and parity gate
  unchanged. Guarded by `distributed-surface.contract.test.ts`, `dependency-pins.test.ts`,
  `transport-beacon.contract.test.ts` (TB-12), and `framework-vue-bundle-shape.security.test.ts`.

**Result: PASS** (constitution v1.5.0; no amendment). Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/020-vue-error-handler/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/
│   └── framework-vue.md      # behavioral contract: surface, emission shape, FR-V# → test mapping
└── checklists/requirements.md
```

### Source / repository files affected

```text
Source (new):
└── src/framework-vue/index.ts          # NEW: createErrorHandler, safesignalErrorHandler (plugin),
                                         #      loggerKey, useLogError, useErrorCapture
                                         #      runtime import 'vue'; type-only '../api/types.js'

Wiring (mirror ./framework-react):
├── package.json                        # + "./framework-vue" exports triple;
│                                       #   + peerDependencies.vue ">=3.0.0";
│                                       #   + peerDependenciesMeta.vue.optional: true;
│                                       #   + devDependencies.vue "^3.x"  (dependencies stays empty)
└── tsup.config.ts                      # + entry 'framework-vue': 'src/framework-vue/index.ts';
                                         #   + 'vue' in external[]

Three hardcoded subpath-key lists (add './framework-vue', sorted — after './framework-react'):
├── tests/contract/distributed-surface.contract.test.ts   # PUBLIC_SUBPATHS + HONEST_PKG.exports
├── tests/contract/dependency-pins.test.ts                # Object.keys().sort() + triple it.each
└── tests/contract/transport-beacon.contract.test.ts      # TB-12 keys + describe title string

Tests (new; mirror feature 018):
├── tests/contract/framework-vue.contract.test.ts         # API shape + emission contract
├── tests/integration/framework-vue.integration.test.ts   # pipeline + propagation + fail-safe
├── tests/security/framework-vue-redaction.security.test.ts   # fail-closed redaction
├── tests/security/framework-vue-bundle-shape.security.test.ts # vue externalized + default-entry isolation
└── tests/contract/vue-import-boundary.test.ts            # only src/framework-vue/** imports vue; no globals

Docs:
└── README.md                           # + "Catch Vue errors — ./framework-vue subpath" section

Unchanged (explicitly): the constitution, .github/workflows/ci.yml, the core `.` entry, src/api/,
every other subpath, dist/ shape for non-Vue entries.
```

**Structure Decision**: Mirror the proven `./framework-react` layout exactly — one self-contained
`src/framework-vue/index.ts`, `vue` as an externalized optional peer, the same fail-closed/fail-safe
emission through `Logger.error`, and the same five-test enforcement set plus the three parity lists.
Only the framework-binding layer differs (Vue's `app.config.errorHandler` / `onErrorCaptured` /
provide-inject in place of React's error boundary / context).

## Complexity Tracking

> No Constitution Check violations. Complexity Tracking is empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| (none) | — | — |
