# Quickstart: Developer Ergonomics & Supply-Chain Hygiene (F006)

What changes for contributors once F006 lands. (No change for package
*consumers* — this is dev tooling only.)

## One-time setup per clone

```bash
npm ci                              # installs Biome (new devDependency)
git config core.hooksPath scripts/hooks   # opt in to local pre-commit + commit-msg hooks
```

## Day-to-day

```bash
npm run lint          # Biome lint — must be clean
npm run format:check  # Biome format check — must be clean
npm run format        # auto-format (write) before committing
npm run test:coverage # full suite + coverage thresholds (same as CI)
```

With hooks enabled, `git commit` runs lint + format-check on your **staged**
files and verifies the DCO `Signed-off-by:` trailer **before** the commit lands —
catching issues in seconds instead of in a failed pipeline. On a violation the
commit is **blocked** with a pointer to the offending file and the fix command;
nothing is auto-formatted or re-staged for you. Use `git commit -s` to sign off.

## What CI now enforces on every MR

| Gate | Pass condition |
|------|----------------|
| `lint` | `biome lint` clean |
| `format-check` | no Biome formatting drift |
| `coverage` | meets `vitest.config.ts` thresholds (≥90% global; 100% on the four pipeline-security files) |
| `secret_detection` | no non-allowlisted secret findings |
| `dependency_scanning` | no dependency advisories at/above severity |

These run alongside the existing F005 gates (build/typecheck/test ×2,
bundle-invariance, dependency-pins, DCO). CI is authoritative — the local hooks
are a convenience layer; an un-hooked clone still can't bypass anything.

## Dependency updates

Renovate opens dependency-update MRs automatically (weekly): minor/patch batched
into one MR, each major in its own. Each MR runs the full quality gate above, so
reviewing a bump is a read-and-merge task. You don't run Renovate yourself.

## Maintainer-side one-time ops (not contributor steps)

- Create a `safesignal`-scoped Project Access Token (Developer, `api`) and store
  it as the masked/protected CI variable `RENOVATE_TOKEN`.
- Enable a weekly **scheduled pipeline** for the Renovate config.
- Confirm the Secret-Detection + Dependency-Scanning templates run on the free
  tier and that the allowlist yields zero false positives.
- (Recommended) ratify constitution v1.3.0 so the spec's Principle VIII/IX
  citations resolve on `main`.

## Verifying the format baseline was safe

```bash
npm test          # expect 48 files / 1,088 passing / 10 todo / 0 failing
npm run build
# gzipped sizes must equal: index.mjs 8,162 B · transport-beacon.mjs 3,101 B · testing.mjs 2,724 B
```
