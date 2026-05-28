# Feature Specification: Rename Project to SafeSignal

**Feature Branch**: `003-rename-safesignal`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Rename the project from its current
working/repository identity to SafeSignal. SafeSignal is the public
project and package name for a browser-first, vendor-neutral frontend
structured logging SDK. The rename must preserve the constitution's
principles: stable consumer API boundaries, browser runtime
resilience, framework and vendor neutrality, secure/privacy-safe
logging by default, minimal maintainable package design, log
integrity, lightweight Logger instances, and federated runtime
discipline. The rename should cover all user-visible and
package-visible project identity surfaces, including package
metadata, README/docs, examples, quickstart guidance, generated
spec/contract references, and any public-facing naming that still
describes the project generically as a frontend logging SDK. The
change must not alter logging behavior, public API semantics,
redaction guarantees, transport behavior, runtime ownership, package
architecture, or implementation logic except where required to
update names. SafeSignal should be presented as a secure structured
logging facade and safety boundary for browser applications and
federated frontend modules. The specification should define
requirements that make the rename complete, consistent, and
verifiable across documentation, package metadata, examples, and
release-facing surfaces. Out of scope: changing the core logging
API shape, adding new transports, changing vendor adapter strategy,
changing runtime behavior, changing security/redaction rules, or
introducing new dependencies. Success means a consumer can encounter
the package through metadata, documentation, examples, specs, and
contracts and consistently understand the project as SafeSignal,
with no conflicting legacy project name remaining in public-facing
surfaces unless explicitly retained as historical migration
context."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — New consumer discovers the package as SafeSignal (Priority: P1)

A developer new to the project arrives via npm search, a search-engine
result for "secure frontend logging", or a colleague's link. Within
the first encounter — registry listing, README headline, install
command — they see the project consistently named **SafeSignal**.
They install via the SafeSignal-flavored package name, write a tiny
"hello world" emit, and at no point in that flow encounter a
conflicting legacy name on the install command, the import statement,
or the first page of documentation.

**Why this priority**: This is the canonical discovery path. If the
package metadata, the install command, and the README headline don't
consistently say SafeSignal, the rename has failed at its primary
purpose. Without this, every other consumer-facing surface is
incoherent.

**Independent Test**: From a clean shell, search the package registry
for "SafeSignal", verify the result. `npm view <safesignal-name>`
shows a `name`, `description`, and `keywords` set that identifies the
project as SafeSignal. Open `README.md` at HEAD — first heading and
first paragraph use "SafeSignal", not the legacy name. The displayed
install command and the first import example use the SafeSignal
package identifier.

**Acceptance Scenarios**:

1. **Given** the package is published, **When** a consumer runs
   `npm view <safesignal-name>` (or the equivalent registry lookup),
   **Then** the `name`, `description`, and `keywords` fields all
   reference SafeSignal as the project identity, and the
   `description` describes the project as "a browser-first,
   vendor-neutral frontend structured logging SDK" (or wording
   substantively similar) under the SafeSignal name.
2. **Given** a consumer opens `README.md`, **When** they read the
   first heading and the first paragraph, **Then** the project is
   identified as SafeSignal in plain language, with no conflicting
   legacy name appearing above the migration-context section.
3. **Given** a consumer runs the canonical install command shown in
   `README.md`, **When** they then run the first import shown in the
   quickstart, **Then** both commands reference the SafeSignal
   package identifier consistently and the import resolves
   successfully against the installed package.
4. **Given** a consumer searches the public repository for a
   "SafeSignal" hit, **When** they land on the README, **Then** they
   are oriented to the project's purpose (secure structured logging
   facade and safety boundary for browser applications + federated
   frontend modules) within the first screen of content.

---

### User Story 2 — Existing consumer of the legacy name migrates cleanly (Priority: P2)

A developer who used the project under its legacy working/repository
identity (e.g., `frontend-logging-sdk` or the `@your-org/`
placeholder package name) returns to the repository or follows a
stale link. They expect either (a) a clear forwarding note that
explains the rename and points them at the SafeSignal identity, or
(b) the legacy URLs/imports still resolve in some explicit
migration window. They do NOT expect to silently get a wrong package,
a 404, or a confusing mix of names.

**Why this priority**: The constitution's Principle I (stable consumer
API boundaries) requires that breaking consumer call-site changes are
"documented, versioned, and accompanied by a migration plan". A
rename that touches the import string IS a consumer call-site change.
The migration story is therefore not optional — it's a constitution
requirement.

**Independent Test**: Search the documentation tree for the legacy
project name. Every remaining mention is either (a) inside a clearly
labeled migration-context block (e.g., a "former name" callout in
the README, a CHANGELOG entry, or a one-paragraph migration note in
`docs/safe-logging.md`), or (b) inside an archival artifact (a
historical spec, plan, tasks, or log file) that is not part of the
forward-going consumer surface. No NEW post-rename content uses the
legacy name.

**Acceptance Scenarios**:

1. **Given** the documentation tree post-rename, **When** the
   reviewer scans `README.md`, `docs/safe-logging.md`, every
   `examples/*/README.md`, and every `examples/*/index.ts` comment
   block, **Then** the only mentions of the legacy project name are
   inside explicit migration-context callouts (clearly labeled), and
   each callout names the SafeSignal identity in the same paragraph.
2. **Given** a consumer who knows only the legacy name searches the
   repository, **When** they look at the top-level README or the
   docs landing, **Then** within one click they find the migration
   note that maps legacy → SafeSignal and explains what to update
   on their side (import string, package name).
3. **Given** the constitution at `.specify/memory/constitution.md`,
   **When** the rename is complete, **Then** the constitution
   identifies the project as SafeSignal where the project's identity
   is referenced, AND any retained reference to the legacy name is
   contextualized as a former identity rather than a current one.

---

### User Story 3 — Examples and release-facing surfaces reflect SafeSignal (Priority: P3)

A developer copies one of the bundled example projects
(`examples/host-app/` or `examples/federated-module/`) as a starting
point for their own integration. The example's `package.json`,
inline comments, and any `README.md` consistently present the project
as SafeSignal. The release-facing surfaces a consumer might check
before adopting — keywords, repository description, the published
`CHANGELOG` for this version — all carry the SafeSignal identity.

**Why this priority**: Examples are the second-most-visited consumer
surface after the README. A consumer who copies an example
internalizes the project's identity from the example's metadata and
comments. A `CHANGELOG` entry that ships the rename without naming
SafeSignal in the entry title or summary leaves the rename invisible
to consumers who track changes via release notes.

**Independent Test**: Inspect `examples/host-app/package.json`,
`examples/federated-module/package.json`, and the inline comments at
the top of each example's `index.ts`. Each consistently identifies
the project as SafeSignal. Check the CHANGELOG entry (or
equivalent release-facing surface) for the rename version: the title
or summary explicitly names SafeSignal.

**Acceptance Scenarios**:

1. **Given** `examples/host-app/package.json` and
   `examples/federated-module/package.json`, **When** their
   `description` field is read, **Then** the description identifies
   the project as SafeSignal and the example's role (single-app
   consumer / federated module consumer) within SafeSignal.
2. **Given** the inline doc comment at the top of each example's
   `index.ts`, **When** the consumer reads the first paragraph,
   **Then** the project is named as SafeSignal and the consumer
   gets the same SafeSignal-flavored quickstart code they'd see in
   the top-level documentation.
3. **Given** the release-facing CHANGELOG (or analogous release
   notes file), **When** the consumer reads the entry for the rename
   version, **Then** the entry title or summary explicitly names
   SafeSignal as the new project identity and explains the migration
   path in one paragraph or less.

---

### Edge Cases

- **Archival artifacts retain the legacy name.** Historical feature
  specs (`specs/001-structured-logging-core/`,
  `specs/002-beacon-transport/`), per-feature checklists, and log
  entries under `~/org/agents/projects/` use the legacy name because
  they were authored before the rename. These remain unedited — they
  are point-in-time records of the work as performed. The forward
  consumer surface is not affected.
- **`@your-org/` placeholder.** The current `package.json` `name`
  field uses an `@your-org/` scope that was always a placeholder.
  The rename replaces it with the SafeSignal-flavored identifier.
  A consumer who previously installed the package by the placeholder
  scope would have done so locally via `file:` link; no published
  artifact ever carried the placeholder, so no upstream migration is
  required.
- **Constitution language.** The constitution names the project
  generically as a "frontend logging SDK" in several places. After
  the rename, the project-identity references update to SafeSignal,
  but the generic descriptive language ("browser-first structured
  logging package") stays for accuracy — SafeSignal IS a browser-
  first structured logging package, and the description is still
  technically correct.
- **Subpath identifiers.** Existing subpath exports (`./testing`,
  `./transport-beacon`) keep their relative-path identifiers; only
  the leading package name changes. A consumer who imports
  `@safesignal/<x>/transport-beacon` reads the same subpath that
  used to live under the legacy scope.
- **In-code identifiers.** Internal type names, function names, and
  source-file paths under `src/` do NOT include the legacy project
  name (they are domain-named: `Logger`, `Transport`, `BeaconError`,
  etc.). No source-code rename is required for the project rename
  to complete.
- **Internal error messages.** The `transportName` field on
  `BeaconError` is consumer-supplied (defaults to `'beacon'`). The
  default does not include the legacy name. No change required.
- **Repository directory on disk.** The local working directory is
  `~/Repos/frontend-logging-sdk`. The directory name is a personal
  filesystem convention, not a public-facing surface. Whether to
  rename the local working directory is a maintainer decision
  outside the scope of this spec; it does not affect consumers.
- **Git remote URL / GitLab project slug.** The published repository
  URL is part of consumer-visible surface (it appears in `package.json`
  `repository` field, in CHANGELOG entries, and in any "view source"
  link). [NEEDS CLARIFICATION: Should the GitLab project slug be
  renamed to `safesignal` as part of this feature, or kept at its
  current slug with a project-side description update only? See
  open question #1 below.]
- **NPM package name shape.** The exact package identifier is part
  of the consumer's install command. Multiple reasonable shapes
  exist with different ergonomic and ecosystem implications. [NEEDS
  CLARIFICATION: scoped (`@safesignal/sdk` or `@safesignal/core`) vs.
  unscoped (`safesignal`) — see open question #2 below.]

## Consumer Impact & Compatibility *(mandatory for package work)*

- **Public API Surface**:
  - **Zero changes** to exported symbol names, type names, function
    signatures, or behavior. `createLogger`, `configureLogging`,
    `getRootLogger`, `createRedactor`, `scrubUrl`,
    `ConsoleTransport`, `NoopTransport`, `createBeaconTransport`, and
    every type re-export remain identical.
  - **One change** to the IMPORT PATH STRING consumers type at their
    call site: the package name on the left of the slash changes
    from the legacy scope (`@your-org/frontend-logging-sdk`) to the
    SafeSignal-flavored identifier. Subpath suffixes (`./testing`,
    `./transport-beacon`) are unchanged.

- **Compatibility Impact**: **Breaking at the install-and-import
  layer; non-breaking at the API-semantics layer.** A consumer must
  update their `package.json` `dependencies` entry and every
  `import` statement that names the package. They do NOT need to
  change any subsequent code that calls into the package.

- **Migration Notes**:
  - A migration note MUST be added to `README.md` (and/or
    `docs/safe-logging.md`) explaining the legacy-to-SafeSignal
    mapping. The note covers (a) the legacy package name, (b) the
    new SafeSignal package name, (c) the one-line `npm install`
    command for the new name, (d) the find-and-replace pattern for
    import statements, and (e) the version at which the rename
    landed.
  - The CHANGELOG entry for the rename version MUST name
    "SafeSignal" in its title or summary so consumers tracking
    releases see the rename in their feed.

- **Host/Module Usage Impact**:
  - Host applications and federated modules are equally affected at
    the install-and-import layer. After updating the install + import
    strings, no other consumer-side change is required.
  - The federated-module example demonstrates the host-owns-runtime
    contract under the SafeSignal identity; the contract semantics
    are unchanged from feature 002.

- **Security & Privacy Considerations**:
  - **Zero change** to redaction defaults, sanitizer limits, URL
    scrubber behavior, fail-closed handling, transport security
    contract (T-S1..T-S5), or any other security or privacy
    surface. The rename does not touch the security pipeline.
  - The project's branding moves from generic to specific; this is a
    DEFENSIVE move (a named brand makes "imposter" packages on the
    registry easier to spot) but introduces no new attack surface.

- **Log Integrity Considerations**:
  - **Zero change** to event production, ordering, dropping,
    batching, transformation, or attribution. The pipeline's stage
    order and bounded-behavior guarantees from feature 001 are
    preserved verbatim.

- **Runtime Scale & Federated Deployment Impact**:
  - **Zero change** to per-`Logger` creation cost, shared runtime
    resource ownership, host vs. module configuration responsibility,
    or duplicate-package-copy behavior (classified as **isolated**
    in feature 001 / preserved by feature 002).
  - The duplicate-copy classification is preserved per feature
    001's contract. A page that loads both a "legacy-named" copy
    and a "SafeSignal-named" copy during the migration window
    behaves the same as any two copies of the same package: each
    has its own configured runtime; sharing across copies requires
    a module-federation singleton at the consumer's build time.

## Requirements *(mandatory)*

### Functional Requirements

#### Public package metadata

- **FR-001**: `package.json` `name` MUST be the SafeSignal-flavored
  package identifier. [NEEDS CLARIFICATION: exact shape pending —
  see open question #2 below; recommended answer is the scoped form
  `@safesignal/sdk`.]
- **FR-002**: `package.json` `description` MUST identify the project
  as SafeSignal and describe it as a secure structured logging
  facade and safety boundary for browser applications and federated
  frontend modules.
- **FR-003**: `package.json` `keywords` MUST include "safesignal" as
  a discoverable term, alongside the existing topical keywords
  (logging, structured, browser, federated, etc.).
- **FR-004**: `package.json` `repository` MUST point at the
  authoritative repository URL post-rename (see open question #1).
- **FR-005**: `package.json` `homepage` (if present) MUST point at a
  URL that identifies the project as SafeSignal.

#### Documentation surfaces

- **FR-006**: The top-level `README.md` MUST identify the project as
  SafeSignal in its first heading (H1) and in the first paragraph of
  body text.
- **FR-007**: `README.md` MUST contain a one-paragraph migration
  note that maps the legacy project name to SafeSignal and shows
  the new install command + the one-line find-and-replace pattern
  for import statements. The migration note MAY be a small
  dedicated section (e.g., "Renamed from …") or a paragraph at the
  top of the README, but it MUST be discoverable on the README's
  first scrollable screen.
- **FR-008**: `docs/safe-logging.md` MUST identify the project as
  SafeSignal where the project's identity is referenced. The
  document's body — DO/DON'T sweep, pipeline-order section,
  transport-security section, federated-deployments section — does
  not require structural changes; only the project-identity
  references update.
- **FR-009**: Every feature spec's `quickstart.md` file that ships
  as part of the forward-going consumer surface MUST present
  SafeSignal as the project identity. (Feature 001's
  `quickstart.md` is part of the consumer surface; feature 002's
  `quickstart.md` includes the canonical five-minute path.)
- **FR-010**: A `CHANGELOG.md` entry (or equivalent release-facing
  notes file) MUST be added for the rename version. The entry MUST
  name "SafeSignal" in its title or summary, list the rename as the
  primary change, and link to the README's migration note.

#### Examples

- **FR-011**: `examples/host-app/package.json` `description` MUST
  identify the project as SafeSignal and the example's role (single-
  app consumer).
- **FR-012**: `examples/federated-module/package.json` `description`
  MUST identify the project as SafeSignal and the example's role
  (federated module consumer).
- **FR-013**: The inline header doc comment at the top of
  `examples/host-app/index.ts` MUST name the project as SafeSignal
  in its first paragraph and use the SafeSignal-flavored package
  identifier in every import statement.
- **FR-014**: The inline header doc comment at the top of
  `examples/federated-module/index.ts` MUST name the project as
  SafeSignal in its first paragraph and use the SafeSignal-flavored
  package identifier in every import statement (including the
  standalone-iteration block at the bottom).
- **FR-015**: `examples/host-app/README.md` (if present) and
  `examples/federated-module/README.md` MUST identify the project
  as SafeSignal.

#### Constitution & specification documents

- **FR-016**: `.specify/memory/constitution.md` MUST identify the
  project as SafeSignal where the project's identity is referenced.
  Generic descriptive language ("browser-first structured logging
  package", "reusable browser package") MAY remain as it is
  factually unchanged.
- **FR-017**: The constitution's existing 7 principles and version
  number are preserved verbatim. The constitution version is NOT
  bumped by the project rename — the rename touches identity, not
  governance.
- **FR-018**: Historical feature spec directories
  (`specs/001-structured-logging-core/`,
  `specs/002-beacon-transport/`) and their checklist artifacts MAY
  remain with the legacy name unchanged. These are point-in-time
  archival records. A note at the top of each historical spec's
  `spec.md` MAY be added with a one-sentence "this feature was
  originally authored under the project's former name" callout,
  but is not required.

#### Forward-going specifications

- **FR-019**: Every NEW feature spec, plan, tasks, contract,
  research, data-model, quickstart, and checklist authored
  post-rename MUST identify the project as SafeSignal. The Spec Kit
  templates under `.specify/templates/` MUST identify the project
  as SafeSignal (only if the template currently uses the legacy
  name; otherwise no change is required).

#### Invariants preserved

- **FR-020**: NO change to any source file under `src/` except where
  a string literal contains the legacy project name and that string
  literal is part of the consumer-facing surface (e.g., an error
  message a consumer sees). Where source-code identifiers
  incidentally match the legacy name (none currently do), they
  remain unchanged.
- **FR-021**: NO change to test logic, test count, or test
  assertions. The full test suite passes unchanged post-rename.
- **FR-022**: NO change to redaction rules, sanitizer limits, URL
  scrubber behavior, level-filter defaults, transport security
  contract, or any other security/privacy/integrity behavior.
- **FR-023**: NO change to the package's runtime `dependencies` or
  `devDependencies`. No new package is added. The dependency-pins
  audit (from feature 001 + feature 002) passes unchanged.
- **FR-024**: NO change to the `exports` map's shape — the three
  entries (`.`, `./testing`, `./transport-beacon`) and their
  `types`/`import`/`require` triples persist verbatim. The
  PACKAGE NAME on the left of the import path changes;
  the subpath suffixes do not.

#### Verification

- **FR-025**: A grep-based or scripted audit MUST verify that no
  forward-going consumer-surface file (README, docs/*, examples/*,
  the active feature's quickstart) contains the legacy project name
  outside an explicit migration-context callout. The audit's
  passing run is the acceptance gate for the rename feature.
- **FR-026**: The build (`npm run build`) MUST produce dist
  artifacts within ±1 KiB of the pre-rename gzipped sizes for
  `dist/index.mjs` and `dist/transport-beacon.mjs`. Larger changes
  indicate that something more than identity references shifted and
  warrant investigation.
- **FR-027**: The full test suite MUST pass unchanged post-rename
  (same test count, same passing count, same skipped/todo counts).

### Key Entities

- **SafeSignal**: The public, consumer-facing project and package
  identity. Replaces the legacy working/repository identity
  (`frontend-logging-sdk`) and the `@your-org/` placeholder scope
  in all forward-going consumer surfaces.

- **Legacy project name**: The pre-rename identity used in
  `package.json` (`@your-org/frontend-logging-sdk`) and in the
  GitLab repository slug and working-directory name. Permitted to
  remain in archival artifacts (historical specs, logs) and in
  explicit migration-context callouts.

- **Public-facing surface**: Any file or registry artifact a
  consumer can encounter through normal discovery channels — npm
  registry metadata, the top-level `README.md`, the `docs/`
  directory, the `examples/` directory, the `CHANGELOG.md` entry
  for the rename version, and the quickstart sections of active
  (current-version) feature specs. EXCLUDES: archival historical
  spec directories, log entries, and the project's internal
  `~/org/agents/` org files.

- **Migration-context callout**: A clearly-labeled section,
  paragraph, or inline note that explicitly frames the legacy name
  as the project's former identity and explains how to migrate.
  The callout names BOTH the legacy and SafeSignal identities in
  the same paragraph so a consumer arriving via the legacy name
  can see the mapping.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consumer scanning the top-level `README.md`
  identifies the project as **SafeSignal** within the first 30
  seconds of reading (within the first heading + first paragraph).
- **SC-002**: A grep-based audit of the forward-going consumer
  surface (top-level `README.md`, `docs/**`, `examples/**`,
  `CHANGELOG.md`, the active feature's `quickstart.md`) finds
  **zero** occurrences of the legacy project name outside explicit
  migration-context callouts.
- **SC-003**: `package.json`'s `name`, `description`, and `keywords`
  fields all reference SafeSignal as the canonical project identity.
- **SC-004**: The two example projects' `package.json` `description`
  fields, plus each example's `index.ts` inline header comment, all
  consistently name the project as SafeSignal.
- **SC-005**: A discoverable migration note in `README.md` maps the
  legacy project name to SafeSignal and provides the one-line
  `npm install` command for the new name plus the import-statement
  find-and-replace pattern.
- **SC-006**: The `CHANGELOG.md` entry for the rename version names
  SafeSignal in its title or summary.
- **SC-007**: `.specify/memory/constitution.md` identifies the
  project as SafeSignal where the project's identity is referenced.
- **SC-008**: The full automated test suite passes unchanged
  post-rename (same test count, same pass count, same skipped/todo
  counts as pre-rename).
- **SC-009**: The build produces `dist/index.{mjs,cjs,d.ts}` and
  `dist/transport-beacon.{mjs,cjs,d.ts}` within ±1 KiB of the
  pre-rename gzipped sizes — proving the rename did not silently
  change runtime code shape.
- **SC-010**: The dependency-pins audit
  (`tests/contract/dependency-pins.test.ts`) and the bundle-shape
  audit (`tests/security/bundle-shape.security.test.ts` +
  `tests/security/transport-beacon-bundle-shape.security.test.ts`)
  pass unchanged post-rename.
- **SC-011**: A reviewer reading the project's documentation tree
  end-to-end never encounters a contradiction between "SafeSignal"
  and the legacy identity. Where the legacy name appears, it is
  always inside an explicit migration-context callout that also
  names SafeSignal.

## Open Questions / Clarifications Needed

### Question 1 — Repository slug rename

The current GitLab repository slug is `frontend-logging-sdk`. The
`package.json` `repository` field, the CHANGELOG's "view source"
links, and any deep-linked URLs in documentation point at this
slug. Two reasonable options exist:

- **Option A (recommended)**: Rename the GitLab project slug from
  `frontend-logging-sdk` to `safesignal` (or `safesignal-sdk`) and
  update every documentation cross-reference. GitLab will issue
  HTTP redirects from the old slug to the new one, so external
  links don't immediately break.
- **Option B**: Keep the GitLab project slug at
  `frontend-logging-sdk` for now, update only the project's
  GitLab-side description and documentation cross-references to
  name SafeSignal. The slug catches up in a later feature when the
  repository is moved or rehomed.

A confirmation of A vs B affects FR-004 (the `repository` field's
target URL) and the CHANGELOG entry's source-link text.

### Question 2 — NPM package name shape

The current `package.json` `name` is `@your-org/frontend-logging-sdk`
(a placeholder scope). The SafeSignal-flavored replacement has
several reasonable shapes:

- **Option A (recommended)**: `@safesignal/sdk` — scoped, succinct,
  signals "this is the SafeSignal SDK package".
- **Option B**: `@safesignal/core` — scoped, signals "this is the
  core of SafeSignal" (leaves room for future sibling packages like
  `@safesignal/transport-otel`).
- **Option C**: `safesignal` — unscoped, terser install command
  (`npm install safesignal`). Requires that the `safesignal` npm
  identifier be available and reserved.
- **Option D**: `@safesignal/logging-sdk` — scoped + descriptive,
  but verbose.

A confirmation affects FR-001 (the `name` field), every import
statement in documentation and examples, and the migration-note
find-and-replace pattern. The recommendation is Option A
(`@safesignal/sdk`).

## Assumptions

- The `SafeSignal` name is available on the npm registry under the
  chosen scope (the project's maintainers have either reserved or
  confirmed availability of the chosen identifier from Open
  Question #2).
- The current working directory `~/Repos/frontend-logging-sdk` is a
  personal filesystem convention and renaming it (or not) is the
  maintainer's local choice; this spec does not require a
  filesystem rename.
- Historical artifacts under `specs/001-structured-logging-core/`,
  `specs/002-beacon-transport/`, and `~/org/agents/projects/`
  remain unedited. They are archival records of the work as
  performed under the legacy identity.
- The constitution version stays at `1.2.0` — the rename is
  identity-only and does not modify or add any of the 7
  principles.
- The constitution amendment date (`Last Amended`) MAY be bumped to
  reflect the rename's landing date, but its version does not
  change.
- The Spec Kit templates under `.specify/templates/` already use
  the legacy name generically (e.g., "the package"). Any template
  reference to the legacy project name updates to SafeSignal.
  Templates that use only generic terms ("the package", "the
  consumer", "the host application") remain unchanged.
- This feature ships in a single version bump (a major version per
  semver, because import strings change). The migration note,
  CHANGELOG entry, and grep-based audit all converge on that
  version.
