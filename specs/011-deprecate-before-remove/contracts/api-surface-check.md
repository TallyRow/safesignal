# Contract: `api-surface-check` gate

**Enforcement of**: Constitution Principle II (deprecate-before-remove) via Principle X
(mechanical enforcement). Closes the constitution Sync Impact Report follow-up (item a).

**Mechanism**: `scripts/api/check-surface.mjs` (cross-platform Node ESM entrypoint; no Bash
wrapper), invoked by `npm run api:check`.
**CI job**: `api-surface` in `.github/workflows/ci.yml` runs `npm run api:check`, included in the
`ci-success` aggregate.

## Inputs

| Input | Source | Notes |
|-------|--------|-------|
| Current public surface | `dist/*.d.ts` (built) via `scripts/api/extract-surface.mjs` | Requires a prior `npm run build`. |
| Frozen baseline | `api/surface.json` | Last published release surface; committed. |
| Reviewed overrides | `api/surface-allow.json` | Usually `[]`. |

## Preconditions (honest prerequisites — Principle IX)

- If `dist/*.d.ts` is absent, the script MUST exit non-zero with an actionable message
  (`run \`npm run build\` first`). It MUST NOT pass silently.
- If `api/surface.json` is absent (first adoption), the gate MUST pass and emit guidance to seed
  the baseline (`npm run api:extract`), treating "no prior baseline" as nothing-to-break.

## Rule (the gate)

For each baseline symbol identified by `(entry, name)`:

| Condition | Classification | Verdict |
|-----------|----------------|---------|
| Present in baseline, absent in current | REMOVED | **FAIL** unless baseline `deprecated: true` |
| Present in both, `signature` differs | CHANGED | **FAIL** unless baseline `deprecated: true` **or** a matching `AllowEntry` (`entry,name,from,to`) exists |
| Absent in baseline, present in current | ADDED | PASS (informational) |

The gate **fails closed**: any unexcused REMOVED or CHANGED symbol → non-zero exit.

## Outputs

- A human-readable verdict table (entry, name, class, excused-by / VIOLATION), in the style of
  `bundle-invariance-check.sh`.
- Exit code: `0` when no violations; `1` when ≥1 violation.

## Determinism & reproducibility

- Same source state ⇒ identical verdict and exit code locally and in CI (Principle IX): sorted
  symbols, stable serialization, network-free reads.
- No environment-dependent behavior; no `CI_*` var is *required* for the core diff (the baseline
  is a committed file, not a git-history lookup).
- The entrypoint is a Node ESM module, so the verdict is identical on Windows/macOS/Linux (no Bash
  dependency). The contract test imports the same comparison logic via the module's `.d.mts`
  declaration, so `tsc --noEmit -p tests/tsconfig.json` and Vitest agree on the same source.

## Failure message (FR-010)

On violation, output MUST name each offending symbol and state the remediation:

> `createLogger` (`.`) was REMOVED but was not `@deprecated` in the last published release.
> Deprecate-before-remove: ship it `@deprecated` with a working replacement and a documented
> migration path, keep it for at least one minor release, then remove. Or revert this change.

## Self-referential enforcement (Principle X)

- The rule is documented in `CONTRIBUTING.md` with a direct reference to this contract, the
  `npm run api:check` entrypoint, and the `api-surface` CI job (rule → check traceability). The
  constitution's generic Principle X discoverability clause already covers it; naming the
  mechanism in the constitution is an optional patch-level refinement (FR-011).
- Removing or disabling this gate is itself subject to the constitution amendment process
  (FR-012), the same as relaxing the underlying Principle II contract — and that discipline is
  documented in `CONTRIBUTING.md` alongside the gate.
