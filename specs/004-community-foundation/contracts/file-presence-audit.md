# Contract: File Presence Audit

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](../spec.md)
**Maps to**: FR-041, FR-042, SC-005, SC-006, R-001..R-007, R-011

## Purpose

Verify that every new or modified artifact this feature requires
exists at HEAD, is non-empty, and contains the minimum required
content markers. This is the **acceptance gate** for the feature.

## Required files at HEAD (existence + minimum size)

| Path | Min size (bytes) | Min non-blank lines |
|---|---|---|
| `LICENSE` | 1024 | 18 |
| `CONTRIBUTING.md` | 2048 | 40 |
| `SECURITY.md` | 1024 | 25 |
| `CODE_OF_CONDUCT.md` | 4096 | 80 |
| `GOVERNANCE.md` | 1500 | 30 |
| `.gitlab/issue_templates/Bug.md` | 512 | 15 |
| `.gitlab/issue_templates/Feature.md` | 512 | 15 |
| `.gitlab/issue_templates/Security.md` | 256 | 10 |
| `.gitlab/merge_request_templates/Default.md` | 512 | 15 |
| `README.md` | (existing, modified) | (existing + new content) |
| `package.json` | (existing, modified) | (existing + `"license": "MIT"`) |

Minimum sizes are conservative lower bounds — actual files will be
larger. They guard against accidental empty-file commits.

## Required content markers per file

Each marker is a substring or pattern that MUST appear in the named
file. Audit script greps for each. Pass requires every marker to
match.

### `LICENSE`

- `MIT License` (literal, first line)
- `Copyright (c) 2026 John Goure` (literal)
- `Permission is hereby granted, free of charge` (OSI text marker)
- `THE SOFTWARE IS PROVIDED "AS IS"` (OSI text marker)

### `CONTRIBUTING.md`

- `# Contributing to SafeSignal` (H1)
- A link to `.specify/memory/constitution.md`
- One of `specs/001-` / `specs/002-` / `specs/003-` (worked example link — any one suffices, all three preferred)
- `git commit -s` (DCO instruction)
- `Signed-off-by:` (DCO footer pattern documented)
- A link to `CODE_OF_CONDUCT.md`
- A link to `SECURITY.md`
- One of `Spec Kit` / `speckit` (workflow named)

### `SECURITY.md`

- `# Security Policy` (H1)
- `security@tallyrow.com` (private contact)
- `72 hours` (acknowledgement target — exact phrasing per research)
- `7 days` (initial-assessment target)
- `90 days` (disclosure window)
- `1.x` (supported version range)
- `DO NOT` (the explicit no-public-issues directive)

### `CODE_OF_CONDUCT.md`

- `Contributor Covenant` (template identifier)
- `2.1` (version)
- `conduct@tallyrow.com` (enforcement contact)
- `Our Pledge` (canonical Covenant section)
- `Enforcement Guidelines` (canonical Covenant section)

### `GOVERNANCE.md`

- `# Governance` (H1)
- `John Goure` (current maintainer)
- A link to `.specify/memory/constitution.md`
- `MR approval` (one of the documented decision authorities)
- `Constitution amendments` (one of the documented decision authorities)
- `npm publish` (one of the documented decision authorities)
- `security triage` (case-insensitive; one of the documented decision authorities)
- `CODEOWNERS` (evolution-path mention)

### `.gitlab/issue_templates/Bug.md`

- `Steps to reproduce`
- `Expected` (behavior)
- `Actual` (behavior)
- `version` (case-insensitive — package version prompt)

### `.gitlab/issue_templates/Feature.md`

- `use case` (case-insensitive)
- `Constitution` (touchpoints prompt)
- `API` (existing surface impact prompt)

### `.gitlab/issue_templates/Security.md`

- `DO NOT` (no-public-issues directive)
- `security@tallyrow.com` (redirect target)
- `SECURITY.md` (cross-reference)

### `.gitlab/merge_request_templates/Default.md`

- `Summary` (section)
- `What changed` (section)
- `Verification` (section)
- `Test plan` (section)
- `Constitution touchpoints` (section)
- `Signed-off-by` (DCO sign-off checklist mention)

### `README.md` (selected markers — full content contract in [readme-front-matter.md](./readme-front-matter.md))

- `# SafeSignal` (H1, line 1)
- `@tallyrow/safesignal` (current package identifier)
- `## Migration history` (relocated migration note section heading)
- A link to `CONTRIBUTING.md`
- A link to `SECURITY.md`
- A link to `CODE_OF_CONDUCT.md`
- A link to `GOVERNANCE.md`
- A link to `LICENSE`

### `package.json`

- `"license": "MIT"` (exact JSON form, allowing for whitespace variation)

## Audit script (reference)

```bash
# From repo root. Exits 0 on pass, non-zero on first failure.
set -e

# 1. File existence
for f in LICENSE CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md GOVERNANCE.md \
         .gitlab/issue_templates/Bug.md \
         .gitlab/issue_templates/Feature.md \
         .gitlab/issue_templates/Security.md \
         .gitlab/merge_request_templates/Default.md; do
  test -f "$f" || { echo "MISSING: $f"; exit 1; }
done

# 2. Content markers (subset shown; full set in spec above)
grep -q "Copyright (c) 2026 John Goure" LICENSE
grep -q "security@tallyrow.com" SECURITY.md
grep -q "conduct@tallyrow.com" CODE_OF_CONDUCT.md
grep -q "Contributor Covenant" CODE_OF_CONDUCT.md
grep -q "2.1" CODE_OF_CONDUCT.md
grep -q "git commit -s" CONTRIBUTING.md
grep -q '"license": "MIT"' package.json

# 3. README markers
grep -q "^# SafeSignal" README.md
grep -q "## Migration history" README.md

echo "file-presence-audit PASS"
```

## Pass / Fail criteria

- **PASS**: All required files exist, meet minimum size, and
  contain every required content marker.
- **FAIL**: Any missing file, any file below minimum size, any
  required content marker absent.

A FAIL means the feature is incomplete; the offending artifact
must be authored / fixed and the audit re-run before merge.
