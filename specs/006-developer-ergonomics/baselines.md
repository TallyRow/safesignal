# Baselines: Developer Ergonomics & Supply-Chain Hygiene (F006)

Scratch file accumulating pre/post measurements for the invariance gates.

## Pre-feature baseline (T004)

Captured 2026-05-29 on branch `006-developer-ergonomics` (rebased onto `main`
@ v1.3.0), before any Biome format/lint baseline.

### Test suite

| Metric | Value |
| ------ | ----- |
| Test files | 48 |
| Tests passing | 1,088 |
| Tests todo | 10 |
| Tests failing | 0 |
| Unhandled errors | 0 |

### Bundle sizes (gzipped)

| Artifact | Bytes |
| -------- | ----- |
| `dist/index.mjs` | 8,162 |
| `dist/transport-beacon.mjs` | 3,101 |
| `dist/testing.mjs` | 2,724 |

### Coverage (v8)

95.16 stmts / 95.28 branch / 98.47 funcs / 95.16 lines (passes the existing
`vitest.config.ts` thresholds: 90% global, 100% on the four pipeline-security
files).

### Lint baseline shock (measured pre-fix)

Biome 2.4.16 on the never-linted tree: ~20 files need formatting; lint reports
238 findings — **222 `noNonNullAssertion`** (deliberate `!` idiom under strict
tsc + `noUncheckedIndexedAccess`), plus ~37 auto-fixable (useLiteralKeys,
useTemplate, noUnusedImports, …) and ~8 semantic (noExplicitAny ×2,
noPrototypeBuiltins ×4, noAssignInExpressions ×1, noUnusedVariables ×1).

**Decision (clarify + implement)**: disable `noNonNullAssertion` (fights the
intentional, tsc-proven-safe idiom); auto-fix the safe remainder; hand-review
the semantic handful; verify `dist/` bytes unchanged.

## Post-baseline measurements (T006) — 2026-05-29

Format + lint baseline applied via `biome check --write --unsafe` (Biome 2.4.16),
with `noNonNullAssertion` disabled and two scoped `biome-ignore` comments
(test-spy `any`; idiomatic `regexp.exec()` loop).

### Lint / format

- `npm run lint` → **0 findings** (clean).
- `npm run format:check` → **clean**.

### Test suite (invariant)

48 files / 1,088 passing / 10 todo / 0 failing — **identical** to baseline.

### Bundle sizes (one-time re-baseline)

| Artifact | Pre | Post | Δ (gz) | vs ±1 KiB gate |
| -------- | --- | ---- | ------ | -------------- |
| `dist/index.mjs` | 8,162 | 8,166 | +4 | ✅ within |
| `dist/transport-beacon.mjs` | 3,101 | 3,106 | +5 | ✅ within |
| `dist/testing.mjs` | 2,724 | 2,724 | 0 | ✅ identical |

**Finding**: tsup/esbuild emits non-minified output, so source formatting reaches
`dist/` by a few bytes — "byte-identical" (the spec's original FR-008/SC-007
wording) is not achievable while formatting `src/`. Deltas are well within the
existing bundle-invariance gate's ±1 KiB tolerance, so the gate passes; spec
reworded accordingly. New post sizes are the recorded baseline going forward.
