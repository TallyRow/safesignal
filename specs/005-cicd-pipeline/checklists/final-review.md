# Final-Review Record: CI/CD Pipeline & Release Workflow (Feature 005)

**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Plan**: [005-cicd-pipeline/plan.md](../plan.md)
**Branch**: `005-cicd-pipeline` (merged to `main` via MR !5; follow-ups !9/!10/!11)
**Review date**: 2026-05-29 (updated after end-to-end dogfood + stable release)
**Ships as**: `@tallyrow/safesignal` **v1.0.1** (stable, live under `latest` with SLSA provenance) — preceded by the manual `v1.0.1-rc.1` bootstrap and the OIDC `v1.0.1-rc.2` dogfood (`next`)

## Acceptance statement

Feature 005 is **complete and shipped.** Both pipelines are proven
end-to-end against the live project, not merely by inspection:

- **Quality-gate pipeline** runs green on every MR + `main` push
  (build → typecheck → test ×2 Node, bundle-invariance,
  dependency-pins, DCO).
- **Release pipeline** has published twice via GitLab OIDC trusted
  publishing with verified SLSA provenance attestation:
  `v1.0.1-rc.2` (→ `next`) and the stable `v1.0.1` (→ `latest`).

The maintainer-side ops (T002–T007) are done and verified, and the
two dogfood gates (T012, T017) passed. Reaching green required fixing
**seven latent issues** the release half had been hiding (it had never
run); see "Dogfood findings" below.

## Contract outcomes

| Contract | Status | Evidence |
|----------|--------|----------|
| `contracts/audit-script.md` | ✅ PASS | T024: all required files + exec bits; no `NPM_TOKEN` in CI; master-sweep clean |
| `contracts/ci-pipeline-stages.md` (FR-001..FR-010) | ✅ PASS (run) | Quality-gate pipeline green on MR !5/!9/!10/!11 and `main` — build/typecheck/test ×2, bundle-invariance, dependency-pins, dco-check all pass. Stage order corrected to **build-first** so package-name tests resolve via `dist/` |
| `contracts/release-pipeline.md` (FR-011..FR-017a) | ✅ PASS (run) | Release pipeline published `v1.0.1-rc.2` (next) + `v1.0.1` (latest) with verified provenance. verify-tag-signed, release build/typecheck/test ×2, bundle-invariance, dependency-pins, changelog-validate, publish (OIDC), provenance-verify all green |
| `contracts/branch-protection-policy.md` (FR-018..FR-021) | ✅ PASS | T002 default=`main` (master alias kept); T003 protections on `main` (push: no one, merge: maintainers, no force-push) + MR gates (pipelines-must-succeed, threads-resolved, 1 approval, author self-approve); verified via API. Direct-push impossible — all changes landed via MR |
| `contracts/dco-check.md` (FR-007, SC-002) | ✅ PASS (run) | `dco-check` job green on every MR; all commits SSH-author-matched `Signed-off-by` |
| Test-suite invariance (FR-026, FR-032, SC-010) | ✅ PASS | 48 / 1,088 / 10 / 0 / 0 — identical pre/post (verified on Node 20 **and** 22) |
| Bundle invariance (FR-028 spirit) | ✅ PASS | `dist/index.mjs` 8,162 B; `transport-beacon.mjs` 3,101 B; `testing.mjs` 2,724 B — identical to F002/F003/F004 |
| Source invariants (FR-025, FR-027) | ⚠️ ADJUSTED | `src/**` changed in one type-only spot (`src/testing/secret-fixtures.ts` return type → concrete `SecretFixture`) to clear test typecheck debt; runtime + bundle byte-identical. `package.json` gained `version` bumps + `publishConfig.access` for release. Both are deliberate, documented deviations the release work required |

## Baseline vs. post-feature measurements

### Test-suite headline counts (Node 20 + 22)

| Metric | Pre-feature | Post-feature | Status |
|---|---|---|---|
| Test files | 48 | 48 | ✅ |
| Tests passing | 1,088 | 1,088 | ✅ |
| Tests todo | 10 | 10 | ✅ |
| Tests failing | 0 | 0 | ✅ |

### Bundle sizes (gzipped)

| Artifact | Pre | Post | Status |
|---|---|---|---|
| `dist/index.mjs` | 8,162 B | 8,162 B | ✅ |
| `dist/transport-beacon.mjs` | 3,101 B | 3,101 B | ✅ |
| `dist/testing.mjs` | 2,724 B | 2,724 B | ✅ |

## Dogfood findings (issues the release half was hiding)

The release pipeline had never executed before this feature. Cutting
the real release surfaced seven issues, all fixed:

1. **96 pre-existing `tests/` typecheck errors** (root: `makeSecretFixture(): Record<string,string>` + `noUncheckedIndexedAccess`) — fixed via a `SecretFixture` type alias + mechanical per-file fixes.
2. **Node-20-only sanitizer test-setup throw** (V8 lazy-stack settling) — fixed by reordering the throwing-getter definitions.
3. **CI stage order** ran typecheck/test before build, so package-name imports couldn't resolve `dist/` — reordered build-first with `needs:`.
4. **OIDC `aud`** was the registry URL; npm requires `npm:registry.npmjs.org`.
5. **Manual `_authToken`** step + npm 10.x (node:22) — removed the step; OIDC needs npm ≥ 11.5.1 (publish job upgrades npm; auto-detects `NPM_ID_TOKEN`).
6. **Missing `SIGSTORE_ID_TOKEN`** (aud `sigstore`) — required for `--provenance`.
7. **npm provenance requires a public source repo** — `tallyrow` group + `safesignal` project made public (`opsdeck` stays private).

Also: the release-pipeline design specified no way to get the signer's
public key to the runner for `git tag -v`; resolved by SSH-signing tags
+ verifying against a committed `.gitlab/allowed_signers` allowlist
(GitLab's tag signature API exposes no `verification_status` for SSH).
Full operational detail captured in the `npm-oidc-release-gotchas`
memory note.

## Tasks summary

| Phase | Tasks | Status |
|---|---|---|
| Phase 1 Setup | T001 | ✅ |
| Phase 2 Foundational | T002–T007 | ✅ done + verified (T002 default-branch, T003 protections+gates, T004 no NPM_TOKEN, T005 2FA/disallow-tokens, T006 Trusted Publisher, T007 first-publish status) |
| Phase 3 US1 (P1 MVP) | T008–T011 | ✅ |
| Phase 3 US1 dogfood | T012 | ✅ green on MR !5 (9/9 jobs) |
| Phase 4 US2 (P1) | T013–T016 | ✅ |
| Phase 4 US2 dogfood | T017 | ✅ `v1.0.1-rc.2` published via OIDC with verified provenance (→ `next`) |
| Phase 5 US3 (P2) | T018–T020 | ✅ T019 sweep; T002/T003 done; push-protection confirmed by config (all changes via MR) |
| Phase 6 US4 (P3) | T021–T023 | ✅ |
| Phase 7 Polish | T024, T026, T028 | ✅ |
| Phase 7 optional | T029 | ✅ stable `v1.0.1` published under `latest` with provenance |

## Remaining (non-blocking)

- **T025 / T027** — out-of-band UI screenshot confirmation + a full contributor quickstart walkthrough rehearsal. The substance is verified (API checks + the live dogfood); these are belt-and-suspenders documentation steps only.
- **`latest` vs `next`** — `latest` → `1.0.1` (stable), `next` → `1.0.1-rc.2`. The two RC versions (`rc.1` manual, `rc.2` OIDC) remain on the registry under `next`; optionally `npm deprecate` them later, but harmless.

## Constitution alignment

All 7 principles preserved. Principle IV (Secure by Default) is
operationally strengthened: OIDC trusted publishing removes the
long-lived `NPM_TOKEN` surface entirely, every published version
carries a cryptographic SLSA provenance attestation linking back to
its CI run, and the `@tallyrow` scope enforces 2FA + disallows tokens.
Principle V: the F004-documented contracts (DCO, bundle invariance,
dep pins, test invariance) are now mechanically gated in CI.

## Recommendation

**Feature 005 is complete and shipped.** `@tallyrow/safesignal@1.0.1`
is live on npm under `latest` with verified provenance; both pipelines
are proven end-to-end. No blocking work remains.
