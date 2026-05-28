# Security Policy

SafeSignal's secure-by-default posture (Principle IV of the
[constitution](.specify/memory/constitution.md)) is **non-negotiable**.
This policy describes how to report a vulnerability privately, what
response timeline to expect, and how disclosure is coordinated.

## Reporting a vulnerability

**Email `security@tallyrow.com`** with vulnerability details. This
address routes to the maintainer-owned inbox.

**DO NOT file vulnerability details in a public GitLab issue.** A
public-issue submission would expose the issue before a fix can be
prepared and published, creating a window during which consumers
are unprotected.

If you want to send sensitive details encrypted, request a PGP key
in your initial (non-sensitive) email and the maintainer will
respond with one.

### What to include in the report

- A description of the vulnerability and its impact (what an
  attacker could do, who would be affected)
- A reproduction case (the smaller the better; a runnable snippet
  or short repo is ideal)
- The SafeSignal version(s) affected (run `npm view @tallyrow/safesignal version`
  for the latest, or check the `version` field of your project's
  `package.json` for the version you tested)
- The runtime context (browser + OS + Node version if relevant;
  framework / module-federation setup if applicable)
- A suggested fix if you have one (optional but appreciated)
- Whether you want public credit in the fix announcement (default:
  yes, with your preferred attribution; opt-out is fine)

## Response timeline

- **Acknowledgement: within 72 hours** of your initial email. The
  maintainer confirms receipt and indicates whether the report
  appears to be in scope.
- **Initial assessment: within 7 days** of acknowledgement. The
  maintainer responds with an initial severity assessment, asks any
  follow-up questions needed to reproduce, and proposes a
  disclosure timeline.
- **Fix landed and published: target depends on severity.** Critical
  issues take precedence over feature work; lower-severity issues
  follow the next scheduled release.

If you don't hear back within 72 hours, send a follow-up — the
email may have been filtered. If you still don't hear back within 7
days, treat the project as currently unmaintained and proceed
according to your own disclosure policy.

## Coordinated disclosure

The default embargo is **90 days from initial acknowledgement**.
Within that window:

- The maintainer prepares and ships a fix.
- A patched release is published to npm before any public
  disclosure.
- A `SECURITY` advisory is published in the GitLab project and a
  `CHANGELOG.md` entry names the issue (without exposing
  exploitation details until after the patch is widely deployed).

The 90-day default is extendable by **mutual agreement** when a fix
requires more time (significant architectural change, coordinated
multi-package patch, etc.). Extension requests SHOULD be raised
before day 60 so the reporter has time to weigh the request.

If a fix is published before day 90, the embargo ends with the
patched release. Reporters MAY publish vulnerability details after
the patched release ships (and SHOULD wait at least 7 days after
the release to let consumers update).

## Supported versions

| Version range | In scope for security fixes? |
|---|---|
| `1.x` (current major) | ✅ Yes — actively supported |
| `0.x` (pre-release) | ❌ No — these were never published to npm; the working-name `frontend-logging-sdk` artifact only existed during development and is not maintained |

Only the latest minor of the current major receives security
patches by default. If you're on an older minor, the maintainer
will recommend an upgrade path in the response.

When SafeSignal reaches a `2.x` major (no plans yet), the support
window for `1.x` will be communicated in the announcement.

## Scope

### In scope

- The SafeSignal SDK source code under `src/`
- The example projects under `examples/host-app/` and
  `examples/federated-module/`
- Published build artifacts under `dist/` (as built from the
  in-scope source)
- The package's documented public API surface (entries in
  `package.json` `exports` — `.`, `./testing`, `./transport-beacon`)
- The redactor / sanitizer / URL-scrubber pipeline and its
  documented fail-closed behavior
- The transport security contract (T-S1..T-S5) and its enforcement

### Out of scope

- Third-party dependencies: report to those projects directly. If
  you believe SafeSignal's usage of a third-party dependency is the
  cause (e.g., an unsafe option is enabled by default), that's in
  scope.
- Issues that require physical access to a user's device.
- Social-engineering attacks against contributors or maintainers.
- Denial-of-service via legitimate API usage (we'd love a bug
  report instead, since this often means a missing bounded-input
  guard).
- Browser-vendor bugs reproducible without SafeSignal in the stack.

## Code of Conduct violations

For reports about contributor or maintainer behavior (not security
vulnerabilities), see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
The enforcement contact for CoC reports is `conduct@tallyrow.com`,
a distinct alias from the security contact above (both route to
the same inbox, but the alias signals which queue the report
belongs to).

## License of contributed exploit code

Reproduction snippets and suggested fixes contributed via the
private security channel are treated as licensed under the
project's [MIT License](LICENSE), consistent with the
[Developer Certificate of Origin](CONTRIBUTING.md#developer-certificate-of-origin-dco)
that governs all contributions. If your reproduction includes
proprietary or sensitive data, please strip that data from the
reproduction before sending — the maintainer should not receive
material you don't have the right to share.

## Acknowledgements

Public credit for reported vulnerabilities is the default. Reporters
who prefer to remain unnamed can request that in the initial email.
The `CHANGELOG.md` entry for the patched release will list the
reporter (or "Reported privately" if the reporter opts out) and
link to the published GitLab security advisory.
