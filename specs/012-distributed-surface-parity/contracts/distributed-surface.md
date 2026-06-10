# Contract: distributed-surface parity gate

**Enforcement of**: Constitution Principle XI (distributed-surface honesty — "what ships matches what
is documented/contracted") via Principle X (mechanical enforcement). Closes the constitution Sync
Impact Report follow-up (**item b**).

**Mechanism**: `tests/contract/distributed-surface.contract.test.ts`, invoked by
`npm run surface:check` (and by `npm run test:contract`).
**CI**: runs in the `dependency-pins` job of `.github/workflows/ci.yml` (in the required
`ci-success` aggregate) and `.github/workflows/release.yml` (release pipeline).

## Documented public surface (source of truth)

This is the contracted distributed surface the gate enforces.

### Public subpaths (the `exports` keys)

| Subpath | Purpose |
|---------|---------|
| `.` | Core logging API. |
| `./testing` | Test helpers (contract battery, fixtures). |
| `./transport-beacon` | Beacon transport factory. |
| `./transport-otlp` | OTLP transport factory. |

`Object.keys(package.json.exports)` MUST equal this set exactly — no undocumented subpath added,
none documented-but-missing.

### In-surface rule (what may be packaged)

A packaged file is **in surface** iff it is one of:

- under `dist/` (the sole entry in `package.json` `files`), **or**
- `package.json`, **or**
- npm-mandatory metadata matching `/^(README|LICEN[CS]E)/i`.

Everything else packaged is a **stray** inclusion and fails the gate. This boundary is the
definition of the documented surface; it deliberately admits legitimate `dist/` **resolution-support
files** — source maps (`dist/*.map`), CommonJS declarations (`dist/*.d.cts`), and the shared
declaration chunk (`dist/types-*.d.ts`) — which no `exports` key names directly but which are part
of the shipped, contracted `dist/` surface.

## Inputs

| Input | Source | Notes |
|-------|--------|-------|
| Published file set | `npm pack --dry-run --json` → `[0].files[].path` | Authoritative; requires a prior `npm run build` (packs on-disk `dist/`). |
| Declared targets | `package.json` `exports[*].{types,import,require}` + `main`/`module`/`types` | Normalized: strip a leading `./`. |
| Documented subpaths | this contract (encoded in the test) | The four keys above. |

## Preconditions (honest prerequisites — Principle IX)

- If `dist/` (e.g., `dist/index.mjs`) is absent, the test MUST fail with an actionable message
  (`run \`npm run build\` first`). It MUST NOT pass silently (an unbuilt `dist/` would make `npm
  pack` omit the targets, which the rule below already flags — but the explicit guard gives a clear
  message).

## Rule (the gate)

The gate **fails closed** (non-zero) if any of the following holds:

| # | Condition | Drift class |
|---|-----------|-------------|
| 1 | A declared target is **not** in the published file set | `missingTargets` (FR-002) |
| 2 | A packed path is **not** in-surface (per the rule above) | `strayFiles` (FR-003) |
| 3 | `Object.keys(exports)` ≠ the documented subpath set | `subpathDrift` (FR-004) |

The gate passes only when all three are clean.

## Outputs

- A human-readable verdict; on failure, the specific drift(s) by class and path (FR-009):

  > Distributed-surface parity FAILED.
  >   Missing target(s) (declared in package.json but not shipped): dist/transport-otlp.d.ts
  >   Stray file(s) (packaged but outside dist/ + npm metadata): src/secret-config.ts
  >   Subpath drift: undocumented exports key './experimental'
  >   Fix: ensure every exports/entry target is built into dist/, keep `files` to `dist`, and
  >   update contracts/distributed-surface.md when intentionally changing the public subpaths.

- Exit code: `0` when parity holds; non-zero on any drift.

## Determinism & reproducibility

- `npm pack --dry-run --json` is deterministic and network-free, so the verdict and exit code are
  identical locally and in CI for the same source state (Principle IX).

## Self-referential enforcement (Principle X)

- The rule is documented in `CONTRIBUTING.md` with a direct reference to this contract, the
  `npm run surface:check` entrypoint, and the `dependency-pins` CI job (rule → check traceability).
- Removing or disabling this gate is itself subject to the constitution amendment process (FR-011),
  the same as relaxing the underlying Principle XI contract — documented in `CONTRIBUTING.md`
  alongside the gate.
