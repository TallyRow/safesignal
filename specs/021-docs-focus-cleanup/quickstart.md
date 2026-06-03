# Quickstart / Verification: Living-Docs Focus Cleanup

A docs-only change. "Acceptance" is a text search plus the existing CI gates — no runtime steps.

## What changed

- **`README.md`** now leads with a `## What you get` highlights block (⭐ `./capture` silent-error
  capture first; then dev-console, breadcrumbs, stacks, framework-react, framework-vue — each linking
  to its existing section), with a sharpened present-tense intro line.
- The README **no longer** advertises a future `safesignal-server` backend or `./rum-*` RUM features; a
  sharpened focus/boundary line states SafeSignal is **not** a RUM/monitoring product. The legitimate
  OTLP/protobuf roadmap item remains.
- **`CHANGELOG.md`** records the reframe under `[Unreleased]`.

## Verify (acceptance)

```bash
# SC-001 — future-product scope creep is gone from living docs (matches survive only under specs/**):
rg -n "safesignal-server|\./rum-" README.md CHANGELOG.md            # → no matches
rg -n "safesignal-server|\./rum-" specs | head                       # → historical matches still present (expected)

# SC-002/SC-003 — value up front + the six shipped wins are linked:
rg -n "What you get|capture|dev-console|breadcrumb|stacks|framework-react|framework-vue" README.md | head -20

# SC-004 — the boundary statement is present:
rg -n "not a RUM|not a RUM/monitoring" README.md

# SC-005 — the legitimate logging-transport roadmap item is retained:
rg -n "protobuf" README.md

# SC-006 — changelog note present:
rg -n "Unreleased" -A40 CHANGELOG.md | rg -n "focus|RUM|safesignal-server|What you get|docs"

# SC-007 — nothing but docs changed; nothing regressed:
git diff --name-only main                                            # → only README.md, CHANGELOG.md, specs/021-*
npm run verify                                                       # → all green (no code touched)
```

Manual: open the rendered README and click each highlight link — all resolve to a section on the page
(no dead anchors).
