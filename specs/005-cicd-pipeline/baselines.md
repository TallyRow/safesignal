# Baselines: CI/CD Pipeline & Release Workflow

Scratch file accumulating pre-feature and post-feature
measurements for the audit script + dogfood verifications.

## Pre-feature baseline

Captured 2026-05-28 on branch `005-cicd-pipeline` at commit
`a280401` (analysis remediation complete; pre-implementation).

### Test suite

| Metric           | Value |
| ---------------- | ----- |
| Test files       | 48    |
| Tests passing    | 1,088 |
| Tests todo       | 10    |
| Tests failing    | 0     |
| Unhandled errors | 0     |

Same baseline as F002 / F003 / F004 (no `src/**` or `tests/**`
changes between then and now). Captured via `npm test`
(vitest run). Duration ~2.7s.

### GitLab CI/CD usage baseline

(To be recorded by the maintainer from the GitLab project's
Settings → Usage page. F005 introduces CI; this baseline is the
"minutes used before any pipeline ran".)

- Maintainer: capture the "Pipeline minutes used this month"
  value here before T012's first pipeline run, so post-feature
  consumption can be quantified.

## NPM_TOKEN audit (T004)

(To be recorded by the maintainer after auditing GitLab project
Settings → CI/CD → Variables.)

- Maintainer: confirm NO variable named `NPM_TOKEN`,
  `NPM_PUBLISH_TOKEN`, `NODE_AUTH_TOKEN`, or equivalent
  long-lived npm credential exists. Record the audit timestamp
  + result here.

## npm registry state (T007)

(To be recorded by the maintainer after running `npm view
@tallyrow/safesignal versions --json`.)

- Maintainer: capture the registry response. If "package not
  found", the first CI-triggered publish (T017's RC) claims the
  scope+name. If versions exist, confirm the maintainer's npm
  account has publish rights.

## US1 first pipeline run (T012)

(To be recorded after T010 + T011 commits push and the maintainer
opens a no-op test MR.)

- Pipeline URL:
- Wall-clock duration:
- Per-stage breakdown:
- Verdict: PASS / FAIL

## US2 dogfood release (T017)

(To be recorded after T015 + T016 commits push and the maintainer
cuts the v1.0.1-rc.1 signed tag.)

- Pipeline URL:
- Wall-clock duration:
- npm package URL:
- `npm audit signatures` output:
- Provenance attestation visible on npmjs.com: yes / no
- Verdict: PASS / FAIL

## Branch protection verification (T020)

(To be recorded after T003 ops action by the maintainer.)

- `git push origin main` from local: rejected? yes / no
- `git push --force origin main`: rejected? yes / no
- MR merge with failing pipeline: button disabled? yes / no
- MR merge with unresolved threads: button disabled? yes / no

## Post-feature measurements

Captured 2026-05-28 after T010-T023 in-repo work shipped.

### T024 audit-script outcome

- All 5 required new files exist with mode 100755 on `scripts/ci/*.sh`: **PASS**
- All `.gitlab-ci.yml` content markers present (stages, jobs, matrix `["20", "22"]`, `id_tokens:`, `npm publish --provenance`): **PASS**
- README badge present: **PASS**
- CONTRIBUTING "Cutting a release" section present: **PASS**
- GOVERNANCE "Feature 006" → "Feature 005" fix: **PASS**
- No long-lived `NPM_TOKEN`/`NODE_AUTH_TOKEN` references in CI config (one false-positive flagged in a documentation comment that says "no NPM_TOKEN in CI variables"): **PASS**
- Forward-going `master` sweep: only documented rename-history hits in CHANGELOG / README / CONTRIBUTING / GOVERNANCE — no `master` references as the current default branch. **PASS**

### T026 test suite invariance

| Metric | Pre-feature | Post-feature | Status |
|---|---|---|---|
| Test files | 48 | 48 | ✅ |
| Tests passing | 1,088 | 1,088 | ✅ |
| Tests todo | 10 | 10 | ✅ |
| Tests failing | 0 | 0 | ✅ |
| Unhandled errors | 0 | 0 | ✅ |

### T026 bundle invariance

| Artifact | Bytes (gz) | Status vs F003/F004 baseline |
|---|---|---|
| `dist/index.mjs` | 8,162 | ✅ identical |
| `dist/transport-beacon.mjs` | 3,101 | ✅ identical |
| `dist/testing.mjs` | 2,724 | ✅ identical |

## Final-review record

See [`checklists/final-review.md`](./checklists/final-review.md)
for the consolidated acceptance statement, contract outcomes, and
the outstanding maintainer-side ops + dogfood-test items.
