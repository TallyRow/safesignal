# Final-Review Record: CI/CD Pipeline & Release Workflow (Feature 005)

**Feature**: [005-cicd-pipeline/spec.md](../spec.md)
**Plan**: [005-cicd-pipeline/plan.md](../plan.md)
**Branch**: `005-cicd-pipeline`
**Review date**: 2026-05-28
**Ships as**: `@tallyrow/safesignal` v1.0.1-rc.1 (RC publish via the new release pipeline) and v1.0.1 (stable, follow-up)

## Acceptance statement

In-repo work for Feature 005 is **complete**. The agent-executable
half of the feature — `.gitlab-ci.yml` + 4 `scripts/ci/*.sh`
helpers + CHANGELOG entry + README badge + CONTRIBUTING "Cutting
a release" section + GOVERNANCE Feature 006→005 fix + master→main
in-repo sweep — is committed and verified by the audit script.
The test-suite + bundle invariants hold identical to pre-feature.

The **maintainer-side ops half** of the feature requires manual
action in the GitLab + npm UIs (T002-T007). The **dogfood release
test** (T017's v1.0.1-rc.1 publish) is the real proving-ground
for the release pipeline — until that succeeds end-to-end with
provenance attestation on npmjs.com, the release pipeline is
designed but not yet verified.

## Contract outcomes

| Contract | Status | Evidence |
|----------|--------|----------|
| `contracts/audit-script.md` (FR-029, FR-031, SC-006, SC-008, SC-011, SC-012) | ✅ PASS | T024: all 5 required files exist with executable bits; .gitlab-ci.yml has all required stages + matrix + id_tokens; README badge present; CONTRIBUTING "Cutting a release" present; GOVERNANCE Feature 006→005 fixed; no `NPM_TOKEN` references in CI config (one false-positive flagged in a documentation comment); master-sweep returns only documented rename-history hits, no current-default-branch references |
| `contracts/ci-pipeline-stages.md` (FR-001..FR-010) | ⏸ PASS by inspection (pipeline not yet run) | `.gitlab-ci.yml` contains all 6 quality-gate stages with correct rules, matrix, needs graph. **First real pipeline run happens at MR push of this branch** — see "Outstanding items" below |
| `contracts/release-pipeline.md` (FR-011..FR-017a) | ⏸ PASS by inspection (release not yet cut) | `.gitlab-ci.yml` contains all release-pipeline jobs: verify-tag-signed, release-typecheck/test/build × 2, release-bundle-invariance, release-dependency-pins, changelog-validate, publish (id_tokens OIDC), provenance-verify. **First real release runs at T017's RC tag** — see "Outstanding items" |
| `contracts/branch-protection-policy.md` (FR-018..FR-021) | ⏸ HALF DONE | T019 in-repo sweep complete; remaining master refs are documented rename-history. T002 (rename) + T003 (protections) + T020 (verification) are maintainer-side ops not yet done |
| `contracts/dco-check.md` (FR-007, SC-002) | ✅ PASS by inspection | `scripts/ci/dco-check.sh` implements the contract verbatim; mode 100755; will run on first MR pipeline |
| Test-suite invariance (FR-026, FR-032, SC-010) | ✅ PASS | T026: 48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled — identical to T001 pre-feature baseline |
| Bundle invariance (FR-028 spirit) | ✅ PASS | T026: `dist/index.mjs` 8,162 B gz; `dist/transport-beacon.mjs` 3,101 B gz; `dist/testing.mjs` 2,724 B gz — bit-identical to F002/F003/F004 baselines |
| Source / dependency invariants (FR-025, FR-027, FR-028) | ✅ PASS | `git diff` against merge-base shows zero `src/**` and zero `tests/**` changes; `package.json` unchanged; `exports` map shape preserved |

## Baseline vs. post-feature measurements

### Test-suite headline counts

| Metric | Pre-feature | Post-feature | Status |
|---|---|---|---|
| Test files | 48 | 48 | ✅ |
| Tests passing | 1,088 | 1,088 | ✅ |
| Tests todo | 10 | 10 | ✅ |
| Tests failing | 0 | 0 | ✅ |
| Unhandled errors | 0 | 0 | ✅ |

### Bundle sizes (gzipped)

| Artifact | Pre-feature | Post-feature | Status |
|---|---|---|---|
| `dist/index.mjs` | 8,162 B | 8,162 B | ✅ identical |
| `dist/transport-beacon.mjs` | 3,101 B | 3,101 B | ✅ identical |
| `dist/testing.mjs` | 2,724 B | 2,724 B | ✅ identical |

### In-repo diff scope

| Path | Pre-feature lines changed | Status |
|---|---|---|
| `src/**` | 0 | ✅ untouched per FR-025 |
| `tests/**` | 0 | ✅ untouched per FR-026 |
| `package.json` | 0 | ✅ untouched per FR-027 |

## Files changed in this feature

### New files (6)

- `.gitlab-ci.yml` — quality-gate + release pipelines
- `scripts/ci/dco-check.sh` — DCO sign-off verifier (mode 100755)
- `scripts/ci/bundle-invariance-check.sh` — gzipped-delta gate (mode 100755)
- `scripts/ci/changelog-validate.sh` — release-tag CHANGELOG match check (mode 100755)
- `scripts/ci/provenance-verify.sh` — post-publish smoke test (mode 100755)
- `specs/005-cicd-pipeline/baselines.md` — audit trail

### Modified files (4)

- `CHANGELOG.md` — new `## [1.0.1-rc.1]` entry at top documenting F005's deliverables + clarifying that v1.0.0 was an in-repo milestone never shipped to npm (per the I1 analysis remediation)
- `README.md` — pipeline status badge added to Project resources
- `CONTRIBUTING.md` — new `## Cutting a release` section + local-clone-update note for the master→main rename
- `GOVERNANCE.md` — both "Feature 006" references → "Feature 005"; "MRs against master" → "MRs against main" with rename-history note

### Untouched (preserved boundaries)

- `src/**` — zero modifications (FR-025)
- `tests/**` — zero modifications (FR-026)
- `package.json` — zero modifications (FR-027); CI tooling lives in the `node:22-alpine` runner image
- `.specify/memory/constitution.md` — preserved verbatim
- Archival specs `specs/001-*/` through `specs/004-*/` — preserved verbatim (FR-020 + F004 FR-018)

## Constitution alignment

All 7 principles preserved verbatim. Two are operationally
strengthened (not amended):

- **Principle IV (Secure by Default — NON-NEGOTIABLE)** —
  OIDC trusted-publisher removes the long-lived `NPM_TOKEN`
  attack surface; npm provenance attestation cryptographically
  links every published version back to its CI workflow run;
  2FA on `@tallyrow/` scope closes the maintainer-account-
  compromise vector. Supply-chain posture meaningfully
  improved.
- **Principle V (Testable, Minimal, Maintainable)** — every
  F004-documented contract (DCO, bundle invariance, dep pins,
  test invariance) is now mechanically enforced by CI gating
  rather than relying on the maintainer remembering to run
  checks locally. Documentation claims become operational
  reality.

## Tasks summary

| Phase | Tasks | Status |
|---|---|---|
| Phase 1 Setup | T001 | ✅ baseline captured |
| Phase 2 Foundational | T002–T007 | ⏸ **maintainer-side ops not yet done** (see below) |
| Phase 3 US1 (P1 MVP) | T008–T011 | ✅ DCO + bundle-invariance scripts + .gitlab-ci.yml quality gates + exec bits |
| Phase 3 US1 dogfood | T012 | ⏸ **requires maintainer to open a no-op MR** |
| Phase 4 US2 (P1) | T013–T016 | ✅ CHANGELOG-validate + provenance-verify scripts + release-pipeline extension + v1.0.1-rc.1 CHANGELOG entry |
| Phase 4 US2 dogfood | T017 | ⏸ **requires maintainer to cut + push the signed v1.0.1-rc.1 tag** |
| Phase 5 US3 (P2) | T018–T020 | ⏸ T019 sweep done; T018 local update + T020 push-protection verification require maintainer |
| Phase 6 US4 (P3) | T021–T023 | ✅ README badge + CONTRIBUTING release section + GOVERNANCE fix |
| Phase 7 Polish | T024, T026, T027 | ✅ Audit + post-feature baselines + (T027 quickstart walkthrough deferred to maintainer) |
| Phase 7 final-review | T028 | ✅ this file |
| Phase 7 optional | T029 | ⏸ optional stable v1.0.1 release (after RC validation) |

## Outstanding items / MR-merge prerequisites

### MAINTAINER-SIDE OPS (BLOCKING for full feature completion)

⚠️ The following actions must be performed by the maintainer in
GitLab + npm web UIs before this MR can merge (or before the
release pipeline can function). All are surfaced in tasks.md
Phase 2; this checklist enumerates them for the final-review
sign-off.

- [ ] **T002**: GitLab Settings → Repository → Default branch:
      rename `master` → `main`. Verify with
      `git ls-remote --symref origin HEAD | head -1` (expect
      `ref: refs/heads/main`). **DO NOT actively disable the
      master alias** GitLab auto-creates.
- [ ] **T003**: GitLab Settings → Repository → Protected branches:
      configure rules on `main` per
      `contracts/branch-protection-policy.md` (no direct push;
      no force-push; require MR + 1 approval + CI green +
      resolved threads).
- [ ] **T004**: GitLab Settings → CI/CD → Variables: confirm NO
      variable named `NPM_TOKEN`, `NPM_PUBLISH_TOKEN`,
      `NODE_AUTH_TOKEN`, or any other long-lived npm credential
      exists.
- [ ] **T005**: npm web UI: enforce 2FA on the `@tallyrow/`
      scope (`https://www.npmjs.com/settings/tallyrow/packages`
      → require 2FA for publish).
- [ ] **T006**: npm web UI: configure Trusted Publishers binding
      on `@tallyrow/safesignal`
      (`https://www.npmjs.com/package/@tallyrow/safesignal/access`
      → Trusted Publishers → Issuer: `https://gitlab.com`;
      Subject claim pattern:
      `project_path:tallyrow/safesignal:ref_type:tag:ref:v*`;
      Workflow file: `.gitlab-ci.yml`).
- [ ] **T007**: verify first-publish status:
      `npm view @tallyrow/safesignal versions --json` should
      currently return "package not found" (no manual v1.0.0
      shipped) — confirming v1.0.1-rc.1 will be the first npm
      artifact.

### IN-REPO DOGFOOD (REAL ACCEPTANCE GATE)

- [ ] **T012**: open a no-op test MR (any tiny doc change),
      watch the GitLab pipeline run end-to-end on this very
      branch's CI config. Confirm all 9 quality-gate jobs pass
      green. Record pipeline URL + wall-clock duration in
      `baselines.md` under "US1 first pipeline run".
- [ ] **T017**: after Phase 2 ops are complete, cut the
      v1.0.1-rc.1 release. From `main` HEAD:
      `git tag -s v1.0.1-rc.1 -m "Release v1.0.1-rc.1 — dogfood the F005 release pipeline"`
      then `git push origin v1.0.1-rc.1`. Watch the release
      pipeline (~12 min wall-clock). Verify
      `npm view @tallyrow/safesignal@1.0.1-rc.1` returns the
      version under the `next` dist-tag; verify
      `npm audit signatures --pkg=@tallyrow/safesignal@1.0.1-rc.1`
      confirms provenance attestation; verify the npmjs.com
      package page shows the new version with Provenance
      attestation linking back to the GitLab pipeline run.
      Record outcomes in `baselines.md`.

### NON-BLOCKING FOLLOW-UPS

- T020: after T002+T003, verify push protections actively reject
  direct `git push origin main` and force-push attempts.
- T025: confirm out-of-band manual checks (GitLab branch
  protections visible in Settings → Repository → Protected
  branches; npm Trusted Publishers binding visible on
  `@tallyrow/safesignal` access page).
- T027: maintainer walks the contributor pre-push rehearsal from
  `quickstart.md` to confirm the documented workflow matches
  reality.
- T029: optional cut stable `v1.0.1` after RC validation. From
  `main` after RC has soaked:
  `git tag -s v1.0.1 -m "Release v1.0.1 — operational hardening"`
  then `git push origin v1.0.1`. Pipeline publishes under
  `latest` dist-tag.

## Recommendation

**In-repo work is merge-ready.** The agent-executable portion of
Feature 005 — CI config, scripts, docs, CHANGELOG — is committed
and verified by the audit script. Test + bundle invariants hold.

**Full feature completion requires the 6 maintainer-side ops
actions (T002-T007)** before the release pipeline can run, plus
the **two dogfood tests (T012 + T017)** as the real proving-grounds.

A reviewer reviewing this MR can confidently approve the in-repo
changes; the maintainer ops + dogfood tests happen after merge
(or in parallel with the MR review if the maintainer prefers).

**Outstanding cosmetic note**: F005's CI pipeline would run on
this very MR if pushed *after* the maintainer-side ops complete
(GitLab needs to know what `main` is, etc.). If the MR is pushed
before T002, the pipeline runs against `master` and the same
checks would still pass — but the OIDC binding (T006) would
reject any publish attempt until configured. Order recommendation:
**push the MR first, run T002-T006 second, merge the MR third,
run T017 fourth** (clean separation: in-repo review → ops → merge
→ dogfood release).
