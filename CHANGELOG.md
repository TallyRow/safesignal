# Changelog

All notable changes to **SafeSignal** (`@tallyrow/safesignal`) are
documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-28

### Renamed to SafeSignal

This release renames the project from its working identity
(`@your-org/frontend-logging-sdk`) to **SafeSignal**, published on
npm as `@tallyrow/safesignal`. TallyRow is the publishing
organization (npm scope); SafeSignal is the product.

**Migration** (from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`): see the [migration note in
`README.md`](./README.md#renamed-from-frontend-logging-sdk) for the
install command and the import-statement find-and-replace pattern.
The subpath suffixes (`/testing`, `/transport-beacon`) are
unchanged; only the package-name segment moves.

### Preserved (no behavior change in this release)

No runtime behavior, public API symbol name, type name,
function signature, redaction default, sanitizer limit, URL-scrubber
behavior, level-filter default, or transport security contract
changes in this release. The `exports` map shape — `.`, `./testing`,
`./transport-beacon` — is preserved verbatim. The dependency pin
set is unchanged. The full test suite passes unchanged
(48 files / 1,088 passing / 10 todo / 0 failing / 0 unhandled). Bundle
sizes remain within ±1 KiB of the pre-rename gzipped baseline:
`dist/index.mjs` ≈ 8,162 B (gz), `dist/transport-beacon.mjs` ≈ 3,101 B (gz).

### Why a major bump

Consumer `import` statements change (the package-name segment on
the left of the slash moves from `@your-org/frontend-logging-sdk` to
`@tallyrow/safesignal`), which is a consumer call-site change under
the constitution's Principle I (Stable Consumer API & Clear
Boundaries). Per semver, that requires a major version bump even
though the public API surface and behavior are otherwise unchanged.

### Repository

The GitLab project slug is renamed to `safesignal` under the
`tallyrow/` namespace:
`https://gitlab.com/tallyrow/safesignal`. GitLab issues HTTP
redirects from the old slug for the lifetime of the project, so
external links to the previous URL continue to resolve.
