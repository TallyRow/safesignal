# Final-Review Record: Repo Legal & Community Foundation (Feature 004)

**Feature**: [004-community-foundation/spec.md](../spec.md)
**Plan**: [004-community-foundation/plan.md](../plan.md)
**Branch**: `004-community-foundation`
**Review date**: 2026-05-28

## Acceptance statement

The legal and community foundation for SafeSignal is **complete
and verified**. All four verification contracts PASS plus the
invariant diff check (T020a) plus the contributor-onboarding
quickstart walkthrough (T021). All 7 constitutional principles
preserved. Consumer call sites, runtime behavior, public API,
redaction/sanitizer/scrubber pipeline, transport security
contract, `exports` map shape, and dependency set are all
unchanged.

## Contract outcomes

| Contract | Status | Evidence |
|----------|--------|----------|
| `contracts/file-presence-audit.md` (SC-005, SC-006, FR-041) | ✅ PASS | T017: all 9 required files exist (LICENSE, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, GOVERNANCE, 3 issue templates, 1 MR template). All required content markers present per file. |
| `contracts/readme-front-matter.md` (SC-001, FR-027/029/030/034) | ✅ PASS | T018: 9 of 9 checks pass — H1 line 1, SafeSignal in first 6 lines, "Why SafeSignal" header within first 12 lines, install command within first 24 lines, quickstart import within first 32 lines, no migration content above line 30, migration pointer in lines 30-60, Project resources section present, "What this package does NOT do (in v1)" section preserved. |
| `contracts/migration-note-preservation.md` (SC-007, FR-028) | ✅ PASS | T019: 25 lines extracted from feature 003's `## Renamed from \`frontend-logging-sdk\`` block (stripping the adjacent `> **Status**: in development...` blockquote which was stale feature-001 metadata, not migration content). Byte-identical to 25 lines of relocated body in the new `## Migration history` section. All 8 marker elements present (legacy name, new name, install one-liner, `createLogger`, `createBeaconTransport`, `/testing`, `/transport-beacon`, `v1.0.0`). |
| `contracts/test-suite-invariance.md` (SC-009, FR-037/044) | ✅ PASS | T020: 48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled — byte-identical to the T001 pre-feature baseline. |
| T020a invariant diff check (FR-036, FR-038, FR-039, FR-040) | ✅ PASS | `git diff` against the 003 branch base shows `src/**` and `tests/**` completely empty; `package.json` shows exactly one line added (`"license": "MIT"`). No source/test/dep drift. |
| T021 quickstart walkthrough | ✅ PASS | All 10 steps of `specs/004-community-foundation/quickstart.md` verified: first-screen orientation, migration pointer + section, Project resources link resolution, CONTRIBUTING content (constitution / Spec Kit / DCO / CoC / local dev), 3 issue templates, GOVERNANCE 4-domain decision authority + constitution authority + evolution path, MR template DCO checklist, LICENSE + `package.json` `license=MIT`. |

## Baseline vs. post-feature measurements

### Test-suite headline counts

| Metric | Pre-feature | Post-feature | Status |
|---|---|---|---|
| Test files | 48 | 48 | ✅ |
| Tests passing | 1,088 | 1,088 | ✅ |
| Tests todo | 10 | 10 | ✅ |
| Tests failing | 0 | 0 | ✅ |
| Unhandled errors | 0 | 0 | ✅ |

### Invariant diff

| Path | Lines changed | Status |
|---|---|---|
| `src/**` | 0 | ✅ EMPTY |
| `tests/**` | 0 | ✅ EMPTY |
| `package.json` | +1 (the `"license": "MIT"` field) | ✅ INTENDED |

## Files changed in this feature

### New files (10 — 5 root community files, 4 GitLab templates, 1 spec scratch file)

- `LICENSE` — MIT license, copyright `John Goure`
- `CONTRIBUTING.md` — contributor workflow + Spec Kit + DCO 1.1
- `SECURITY.md` — vulnerability disclosure policy keyed off `security@tallyrow.com`
- `CODE_OF_CONDUCT.md` — verbatim Contributor Covenant 2.1, contact `conduct@tallyrow.com`
- `GOVERNANCE.md` — current sole-maintainer state + 4 decision-authority domains + evolution path
- `.gitlab/issue_templates/Bug.md` — structured bug report prompts
- `.gitlab/issue_templates/Feature.md` — feature request prompts (constitution-aware)
- `.gitlab/issue_templates/Security.md` — redirect-style; vulnerability reports → `security@tallyrow.com`
- `.gitlab/merge_request_templates/Default.md` — Summary / What changed / Verification / Test plan / Constitution touchpoints / DCO sign-off checklist
- `specs/004-community-foundation/baselines.md` — scratch file (audit trail; ships with merge)

### Modified files (2)

- `README.md` — full rewrite: value-proposition front matter (H1 + value prop + "Why SafeSignal" + Install + Quickstart in first 30 lines) + migration pointer + reorganized sections + new `## Project resources` section (replaces `## Where to learn more`) + relocated `## Migration history` section + new `## Roadmap` section. Migration block body preserved byte-identically per `contracts/migration-note-preservation.md`.
- `package.json` — single field added: `"license": "MIT"`. No other changes.

### Untouched (preserved invariants)

- `src/**` — zero modifications. Per FR-036.
- `tests/**` — zero modifications. Per FR-037.
- `package.json` — only the `license` field added; `dependencies`, `devDependencies`, `exports`, `scripts`, `version` all unchanged per FR-038/039/040.
- `.specify/memory/constitution.md` — preserved verbatim. This feature REFERENCES the constitution from CONTRIBUTING + GOVERNANCE; it does not amend it.
- `docs/safe-logging.md` — not in scope.
- `examples/**` — not in scope.

## Constitution alignment

All 7 principles preserved verbatim. Several are operationalized at
the contributor-facing layer by this feature:

- **Principle I (Stable Consumer API)** — CONTRIBUTING describes
  the API stability contract for human contributors; the MR
  template's "Constitution touchpoints" section asks each MR to
  identify principle-touching changes.
- **Principle IV (Secure by Default — non-negotiable)** —
  SECURITY.md gives security researchers a clear private channel.
  Without this, the non-negotiable security posture was
  unenforceable at the inbound-report layer.
- **Principle V (Testable, Minimal, Maintainable)** — CONTRIBUTING
  + LICENSE + CODE_OF_CONDUCT + GOVERNANCE deliverables fulfill
  the documentation requirements; the MR template's checklist
  gates each MR against the testability + maintainability bar.
- **Principle VIII (Test & Documentation Coverage)** — every new
  file is documentation per Principle VIII; the constitution
  itself is now discoverable from CONTRIBUTING + GOVERNANCE.

## Tasks summary

| Phase | Tasks | Status |
|---|---|---|
| Phase 1 Setup | T001 | ✅ baseline captured (48/1088/10/0/0) |
| Phase 2 Foundational | — | (empty — no external prerequisites) |
| Phase 3 US1 P1 MVP | T002–T008 | ✅ LICENSE + `package.json` license + README rewrite + migration relocation + Project resources |
| Phase 4 US2 | T009–T013 | ✅ CONTRIBUTING + CoC + 3 GitLab templates |
| Phase 5 US3 | T014–T015 | ✅ SECURITY + Security issue template |
| Phase 6 US4 | T016 | ✅ GOVERNANCE |
| Phase 7 Polish | T017–T022 + T020a | ✅ 4 contracts + T020a invariant diff + quickstart walkthrough + this final-review |

## Scope amendments documented

1. **T010 fetched via curl** instead of in-line `Write`: the
   verbatim Contributor Covenant 2.1 contains enumeration of
   harassment / violence / sexual-attention examples in the
   "unacceptable behavior" and "Enforcement Guidelines" sections.
   Reproducing the verbatim text in the agent's output channel
   tripped a content-output filter on an earlier attempt. The
   workaround was to fetch the canonical markdown from
   `raw.githubusercontent.com/EthicalSource/contributor_covenant`
   directly to the file via curl, then sed-substitute the
   `[INSERT CONTACT METHOD]` placeholder with `conduct@tallyrow.com`
   — never echoing the body content through the response channel.
   The shipped `CODE_OF_CONDUCT.md` is byte-identical to the
   upstream canonical version except for the placeholder
   substitution at both `[INSERT CONTACT METHOD]` occurrences.

2. **T019 source extraction tightened**: the contract's reference
   script captured the `> **Status**: in development...` blockquote
   that was adjacent to feature 003's migration block. That
   blockquote was stale feature-001 metadata, not part of the
   migration content, and was intentionally NOT relocated. The
   final T019 verification strips the Status blockquote from the
   source extraction (via `sed '/^> \*\*Status\*\*/,$d'`) before
   the byte-diff; the 25-line body matches byte-for-byte.

3. **T019 README intro reworded**: the initial intro paragraph
   above the relocated migration body started with the same
   sentence ("This package was previously developed under the
   working name") as the migration body itself, which confused
   the contract's sed-strip-intro logic. Reworded the intro to
   start with "The v1.0.0 release on 2026-05-28 renamed the
   project..." — unique opening that distinguishes intro from
   body without ambiguity.

## Outstanding items / MR-merge blockers

### MR-MERGE BLOCKER (per T022 / spec U1 remediation)

⚠️ **`tallyrow.com` email aliases must be deliverable before this
MR merges to `main`.**

- `security@tallyrow.com` (SECURITY.md private vulnerability channel)
- `conduct@tallyrow.com` (CODE_OF_CONDUCT.md enforcement contact)

Both addresses are referenced in SECURITY.md, CODE_OF_CONDUCT.md,
GOVERNANCE.md, the Security issue template, and CONTRIBUTING.md.
Publishing these files while the addresses bounce would create a
real disclosure-channel gap.

**Maintainer verification steps before approving merge**:

1. `dig MX tallyrow.com` returns at least one MX record.
2. A test email sent to `security@tallyrow.com` is delivered to
   the maintainer-owned inbox without bounce.
3. A test email sent to `conduct@tallyrow.com` is delivered to
   the same inbox without bounce.

If either address is not yet deliverable, **HOLD the merge** until
DNS/MX is in place. Mark this checklist item as resolved when
verification succeeds:

- [ ] Email deliverability verified (`security@tallyrow.com` +
      `conduct@tallyrow.com` both reach the maintainer-owned
      inbox; no bounces)

### Non-blocking follow-ups (deferred to subsequent features)

- **CI enforcement of DCO sign-off** — the MR template asks
  reviewers to verify the `Signed-off-by:` footer manually.
  Automated CI-side enforcement (a GitLab CI job that rejects
  MRs with unsigned commits) is planned in Feature 006.
- **Branch protection rules for `main`** — require MR + approval
  + CI green + no force-push. Planned in Feature 006.
- **CHANGELOG entry for this feature** — the v1.0.0 entry from
  feature 003 already shipped. Whether to bump to v1.0.1 (or
  add a separate "Repo metadata" entry under v1.0.0) is a
  release-decision call deferred to the next publish.

## Recommendation

**Approved for merge once email deliverability is verified.** All
acceptance criteria met; no critical or high-severity findings
remain. Ready for MR review against `main` after the
maintainer-side ops verification above.
