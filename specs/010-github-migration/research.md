# Research: Complete the GitLab → GitHub Migration

Phase 0 consolidation. The three platform decisions were ratified in `/speckit-clarify` (see spec `## Clarifications`); this document records the *how* for the non-trivial pieces and the remaining "best-practice" resolutions. No open `NEEDS CLARIFICATION` items remain.

## 1. GitHub issue & PR templates (from `.gitlab/`)

- **Decision**: Recreate the three issue templates under `.github/ISSUE_TEMPLATE/` (`bug`, `feature`, `security`) and the MR template as `.github/PULL_REQUEST_TEMPLATE.md`. Add `.github/ISSUE_TEMPLATE/config.yml` to route security reports to the private channel (PVR + `security@`) and discourage public security issues.
- **Rationale**: GitHub auto-offers `.github/ISSUE_TEMPLATE/*` in the "New issue" chooser and pre-fills `PULL_REQUEST_TEMPLATE.md` on PR creation — the direct analogue of the `.gitlab/` templates. Preserve required fields verbatim (repro/expected/actual for Bug; consumer use-case + constitutional touchpoints for Feature; **DCO sign-off** + **Constitution touchpoints** for the PR template).
- **Format choice**: Keep **Markdown** templates (front-matter `name`/`about`) rather than YAML issue *forms*. Rationale: 1:1 port of existing content, lowest risk, no field-type re-modeling. YAML forms are a possible later enhancement, out of scope here.
- **Alternatives considered**: YAML issue forms (richer validation, but a re-design); single default template (loses the Bug/Feature/Security distinction the project relies on).

## 2. Vulnerability reporting: GitHub PVR + `security@` email

- **Decision**: Enable **GitHub Private Vulnerability Reporting** (repo Settings → Code security) and use **draft GitHub Security Advisories** for coordinated fixes; preserve `security@tallyrow.com` as the email intake. `SECURITY.md` documents both paths.
- **Rationale**: PVR gives reporters an in-repo private "Report a vulnerability" button and a native advisory/CVE workflow, while the email channel keeps a zero-friction path and continuity for anyone mid-disclosure. No disclosure gap if PVR is enabled *before* `SECURITY.md` is rewritten.
- **Sequencing**: enable PVR → rewrite `SECURITY.md` (both channels) → only then remove any GitLab-advisory references. The 72h/7d/90d response policy carries over unchanged.
- **Alternatives considered**: email-only (no native advisory workflow, no in-repo button); advisories without the public PVR button (reporters can't self-initiate).

## 3. Dependency automation: Renovate GitHub App

- **Decision**: Install the **Mend Renovate GitHub App** on the TallyRow org; it consumes the existing `renovate.json` **verbatim** (grouped minor/patch, isolated majors). No scheduled workflow, no Dependabot.
- **Rationale**: Zero in-repo maintenance, no Actions minutes, native onboarding PR; preserves the exact update policy. The App opens an onboarding PR on install — merging it confirms the config is honored.
- **Cleanup**: the old GitLab `renovate` scheduled CI job lives only in `.gitlab-ci.yml` (dead on GitHub); it is removed when the GitLab pipeline file is retired during decommission. `RENOVATE_TOKEN` GitLab CI variable becomes irrelevant.
- **Alternatives considered**: scheduled `renovatebot/github-action` (needs a PAT secret + minutes); Dependabot (GitHub-native but replaces `renovate.json` semantics — a policy change, rejected).

## 4. GitHub Actions release runbook (rewrite of CONTRIBUTING "Cutting a release")

- **Decision**: Rewrite the runbook to match `release.yml` exactly, encoding the lessons from the v1.3.0 cutover.
- **Authoritative flow** (from `.github/workflows/release.yml`): write CHANGELOG entry → create a **signed annotated** tag (`git tag -s`) on a `main` commit that contains the workflow → push → pipeline runs `verify-tag-signed` → build/typecheck/test (Node 20+22) → bundle-invariance, dependency-pins, changelog-validate → `npm publish --provenance` via **OIDC Trusted Publisher (no token)** → `provenance-verify`.
- **Gotchas to document** (each cost a failed run during v1.3.0):
  - The tag MUST be `git tag -s` (annotated + signed); a lightweight tag fails `verify-tag-signed` with *"cannot verify a non-tag object of type commit."*
  - `package.json` `repository.url` MUST match the GitHub repo or npm rejects the publish with **E422** (provenance repo mismatch).
  - The tagged commit MUST be on `main` and carry `.github/workflows/release.yml` (else nothing triggers).
- **Verification commands**: `npm view @tallyrow/safesignal version`; `npm audit signatures --pkg=@tallyrow/safesignal@<v>`.
- **Alternatives considered**: none — the runbook must mirror the implemented pipeline.

## 5. GitLab decommission (archive read-only)

- **Decision**: Archive the GitLab project (Settings → General → Advanced → Archive) and add a redirect notice to the project description/README pointing at `github.com/TallyRow/safesignal`. Record the host change in `CHANGELOG.md`.
- **Rationale**: Archiving is reversible and keeps historical URLs and any GitLab-era provenance source links resolvable, while blocking new MRs/issues. Do this **last**, after all in-repo links resolve to GitHub.
- **Alternatives considered**: delete (irreversible, breaks all GitLab URLs); passive live mirror (fragmented contributions).

## 6. Contributor remote-repoint guidance (FR-011)

- **Decision**: Document, in `CONTRIBUTING.md`, the one-time remote update for anyone with a GitLab clone:
  `git remote set-url origin https://github.com/TallyRow/safesignal.git` (and `git fetch origin && git branch -u origin/main main`).
- **Rationale**: Existing clones otherwise keep pushing/pulling against the archived GitLab remote.

## 7. Governance doc accuracy (GOVERNANCE.md)

- **Decision**: Replace the "MR approval" description with the GitHub **branch ruleset** model: PR required into `main`, **0 required approvals** (solo maintainer), required **`ci-success`** status check, force-push/deletion blocked; document the **CODEOWNERS + re-enable code-owner review** trigger for when a 2nd maintainer joins. Update the publish description to the **OIDC trusted-publisher** model (no long-lived token) and point handles/URLs at GitHub.
- **Rationale**: The document must describe controls that actually exist; the 0-approval reality (a solo author cannot self-approve) must be stated rather than implying a second reviewer.
