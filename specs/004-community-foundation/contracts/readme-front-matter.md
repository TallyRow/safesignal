# Contract: README Front-Matter

**Phase**: 1 (Design & Contracts)
**Feature**: [004-community-foundation/spec.md](../spec.md)
**Maps to**: FR-027, FR-029, FR-030, FR-034, SC-001, R-008, R-010, R-011, R-012

## Purpose

Specify the required **content and ordering** of the rewritten
`README.md`'s first scrollable screen (first ~30 lines) so a
first-time visitor identifies the project, its value proposition,
and how to install + use it within 30 seconds.

## Required first-30-lines structure

The first 30 lines of `README.md` MUST contain the following
elements **in this order**. Exact line numbers are illustrative;
±2 lines of variation per element is acceptable.

| Element | Approx. line | Required content |
|---|---|---|
| **(A) H1** | 1 | `# SafeSignal` |
| (blank) | 2 | |
| **(B) One-sentence value proposition** | 3 | A single sentence naming what SafeSignal is (a browser-first, vendor-neutral, secure-by-default structured logging facade and safety boundary for browser applications and federated frontend modules) |
| **(C) Positioning sentences** | 4–6 | 1–2 sentences expanding the positioning: lists the key qualities (secure-by-default, vendor-neutral, federated-runtime-aware, lightweight). May mention the `@tallyrow/safesignal` package name + TallyRow as publisher |
| (blank) | 7 | |
| **(D) "Why SafeSignal" section heading** | 8 | `## Why SafeSignal` (or `## What you get` — author's choice; both acceptable) |
| (blank) | 9 | |
| **(E) Differentiator bullets** | 10–18 | 4–6 bulleted items naming concrete differentiators: secure-by-default sanitization + redaction + URL scrubbing, fail-closed redaction, never-throw boundary on emit, vendor-neutral transport layer, lightweight `Logger` instances, federated host/module discipline, structured event shape with bounded size + depth |
| (blank) | 19 | |
| **(F) "Install" section heading** | 20 | `## Install` |
| (blank) | 21 | |
| **(G) Install code block** | 22 | ```bash fence ``` containing exactly `npm install @tallyrow/safesignal` |
| (blank) | 23 | |
| **(H) "Quickstart" or equivalent** | 24 | `## Quickstart` (section heading) |
| (blank) | 25 | |
| **(I) Minimal first-event code block** | 26–30 | ```ts fence containing a minimal example: `import { configureLogging, createLogger, ConsoleTransport } from '@tallyrow/safesignal';` followed by `configureLogging({ ... });` and a single `createLogger()` + `log.info(...)` line. Aim for ≤7 lines of code |

## Absences required in the first 30 lines

The following content MUST NOT appear above line 30:

- **No `## Migration history` section** (it lives deeper in the
  README per FR-028).
- **No `## Renamed from` section** (the feature 003 H2 is
  superseded; the content relocates with a new heading).
- **No mention of `@your-org/frontend-logging-sdk`** (the legacy
  name appears only in the relocated migration block).
- **No `> **Status**: in development...` blockquote** above line
  30 (the status block is in-development scaffolding; it MAY remain
  in the README but MUST NOT compete with the value proposition
  for the first scrollable screen).

## Migration-note pointer

After the install/quickstart block (i.e., on or near line 31), the
README MUST include a single-sentence pointer to the relocated
migration history. Example acceptable form:

```markdown
> Previously known as `@your-org/frontend-logging-sdk`? See
> [Migration history](#migration-history) for the install + import
> upgrade path.
```

The pointer:
- MAY be a blockquote, a paragraph, or a callout-style line.
- MUST link to the `#migration-history` anchor.
- MUST mention `@your-org/frontend-logging-sdk` (the legacy name)
  so a consumer searching for that string finds it within the
  first ~32 lines.

## Project resources section

Somewhere in the README (after the early front matter, before the
Where-to-learn-more section), a `## Project resources` section
MUST link to all of:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `GOVERNANCE.md`
- `LICENSE`

Acceptable form:

```markdown
## Project resources

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to file issues, send MRs, sign commits
- [`SECURITY.md`](SECURITY.md) — vulnerability disclosure policy
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1
- [`GOVERNANCE.md`](GOVERNANCE.md) — how project decisions get made
- [`LICENSE`](LICENSE) — MIT license
```

## "What this package does NOT do (in v1)" preservation

The current README's `## What this package does NOT do (in v1)`
section MUST be preserved verbatim, OR an equivalent honest-scope
statement MUST exist somewhere in the README. This is constitution-
relevant (Principle V's "minimal, maintainable" posture). The
section sets honest expectations:

- No HTTP/beacon transport ships in the default entry (use
  `./transport-beacon` subpath)
- No reading of `process.env`, `import.meta.env`, `location`,
  `document.cookie`
- No global listeners or singletons
- No event persistence
- No default batching / sampling / deduplication

## Verification approach

The contract is verified by a simple shell script:

```bash
# From repo root.

# 1. H1 on line 1
head -1 README.md | grep -q "^# SafeSignal$"

# 2. SafeSignal mentioned in first 6 lines (value prop)
head -6 README.md | grep -q "SafeSignal"

# 3. "Why SafeSignal" (or "What you get") section header within first 12 lines
head -12 README.md | grep -qE "^## (Why SafeSignal|What you get)$"

# 4. Install command within first 24 lines
head -24 README.md | grep -q "npm install @tallyrow/safesignal"

# 5. Quickstart-style import within first 32 lines
head -32 README.md | grep -qE "from '@tallyrow/safesignal'"

# 6. No migration content in first 30 lines
! head -30 README.md | grep -qE "(Migration|Renamed from|@your-org/frontend-logging-sdk)"

# 7. Migration pointer present somewhere after first 30 lines but within first 60 lines
sed -n '30,60p' README.md | grep -q "\[Migration history\](#migration-history)"

# 8. Project resources section present
grep -q "^## Project resources$" README.md

# 9. "What this package does NOT do" section preserved (or equivalent)
grep -qE "^## (What this package does NOT do|Out of scope|Honest scope|Not in scope)" README.md

echo "readme-front-matter PASS"
```

## Pass / Fail criteria

- **PASS**: All 9 checks above succeed.
- **FAIL**: Any check fails.

A FAIL means the README rewrite is incomplete. Fix and re-run.
