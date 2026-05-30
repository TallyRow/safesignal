# Final-Review Record: Developer Ergonomics & Supply-Chain Hygiene (Feature 006)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Branch**: `006-developer-ergonomics` (+ increment branches; merged via MRs !15/!16/!17)
**Review date**: 2026-05-30
**Constitution**: v1.3.0 (ratified on `main` during this feature)

## Acceptance statement

Feature 006's **automated quality + supply-chain floor is complete and live on
`main`**, delivered in incremental, dogfood-verified MRs. Every merge request now
runs, in addition to the F005 gates (build/typecheck/test ×2, bundle-invariance,
dependency-pins, DCO): **lint**, **format-check**, **coverage**, and a gating
**secret-scan**. Local **pre-commit + commit-msg hooks** mirror these. **Renovate**
runs weekly and opens dependency-update MRs (each gated by the full pipeline).

Two items are intentionally deferred (tracked, not blocking): the **osv-scanner
dependency-scan gate** waits on the dev-toolchain major upgrades (happy-dom 20,
vitest 4) that Renovate now drives; those upgrades are ongoing maintenance.

## Story outcomes

| Story | Status | Evidence |
|---|---|---|
| Foundation — Biome lint+format baseline | ✅ | 68-file mechanical baseline; suite 48/1,088/10/0/0; bundles within ±1 KiB (MR !15) |
| **US2** lint + format-check gates | ✅ | green CI jobs (MR !15) |
| **US5** coverage gate | ✅ | enforces existing vitest thresholds (90%/100%); ~95% baseline (MR !15) |
| **US3** pre-commit + commit-msg hooks | ✅ | built + verified (block + pass paths) + dogfooded (MR !15) |
| **US1** secret-scan (gitleaks) | ✅ | green; allowlist covers fakes (MR !16) |
| **US1** dependency-scan (osv-scanner) | ⏸ deferred | all 7 advisories dev-toolchain-only; fixes = major upgrades (T009) |
| **US4** Renovate | ✅ live | config + bot account + token + weekly schedule; opened MRs !18/!19 + Dependency Dashboard |

## Key decisions & deviations (recorded in spec Clarifications)

- **Biome** as the single lint+format tool; `noNonNullAssertion` disabled (fights the intentional `!`-with-`noUncheckedIndexedAccess` idiom).
- **Full format baseline**; "byte-identical bundle" (FR-008/SC-007) reworded to **"within the ±1 KiB invariance gate"** — tsup emits non-minified output, so formatting reaches `dist/` (~+4/+5 B); empirically discovered.
- **US1 pivot to OSS scanners** (gitleaks + osv-scanner): GitLab-native Dependency Scanning is Ultimate-only and Secret Detection doesn't gate on free tier.
- **FR-014 bot credential**: GitLab Project Access Tokens require Premium ($29/user/mo); least-privilege achieved free via a **dedicated `safesignal-bot` account** scoped to this one project.

## Dogfood findings (caught by the gates, fixed)

1. 96 pre-existing test typecheck errors → already fixed in F005; Biome surfaced the remainder.
2. Biome unsafe `Object.hasOwn` fix broke ES2020 `tsc` → bumped `tests/tsconfig` to ES2022.
3. Pre-existing `secret-sweep` flake (cvv `'123'` vs timestamp ms) → excluded the auto-timestamp from the leak scan.
4. Renovate "Authentication failure" → removed a self-referential `RENOVATE_TOKEN` CI variable.

## Invariants held

- Test suite: **48 / 1,088 / 10 / 0 / 0** (Node 20 + 22) — unchanged.
- Bundles: within the ±1 KiB invariance gate (index 8,166 / transport-beacon 3,106 / testing 2,724 B gz; one-time format re-baseline recorded).
- **OIDC-only npm publish** posture preserved — the Renovate bot token is GitLab-only, non-publish.

## Remaining (tracked, non-blocking)

- **T009** — add the osv-scanner `dependency-scan` gate after Renovate lands the happy-dom 20 / vitest 4 upgrades (clean tree).
- Review/merge Renovate's update MRs as ongoing maintenance (the gate verifies each).

## Recommendation

**Feature 006's automation is complete and self-sustaining.** Every MR is now
mechanically gated on style, format, coverage, and secrets (Principle IX), all
checks reproduce locally (Principle VIII), and dependency freshness is automated.
The deferred dependency-scan + the toolchain upgrades are tracked maintenance, not
feature gaps.
