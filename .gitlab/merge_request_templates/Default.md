<!--
SafeSignal Default Merge Request Template

Fill in every required section below. Optional sections may be
omitted if not applicable. See CONTRIBUTING.md for the full MR
workflow and the DCO sign-off requirement.
-->

## Summary

<!-- One paragraph describing what this MR does and why. -->

## What changed

<!-- Bulleted list of the concrete changes. Files added/removed,
behavior changes, API additions, etc. -->

-
-

## Verification

<!--
How did you verify the change works? Examples:

  - `npm test` passes locally (48 files / 1088 passing / 10 todo)
  - `npm run build` produces expected dist artifacts
  - Manual smoke test of <specific behavior>
  - Re-ran <specific contract audit>

Be specific. "Tests pass" alone is not enough; name what passed
and how you ran it.
-->

## Test plan

<!--
Checklist for the reviewer to verify before approving. Adjust to
match the scope of the MR. Strike-through items that don't apply.
-->

- [ ] `npm test` passes (`48 files / 1088 passing / 10 todo / 0 failing / 0 unhandled`, or document the new baseline if intentional)
- [ ] `npm run build` succeeds; `dist/index.{mjs,cjs}`, `dist/testing.{mjs,cjs}`, `dist/transport-beacon.{mjs,cjs}` all emit
- [ ] No bundle-size regression beyond ±1 KiB gzipped on `dist/index.mjs` or `dist/transport-beacon.mjs`
- [ ] `tests/contract/dependency-pins.test.ts` passes unchanged (deps + `exports` map shape preserved)
- [ ] `tests/security/*.security.test.ts` passes unchanged (redaction / sanitizer / URL-scrubber pipeline preserved)
- [ ] Documentation updated where consumer-visible behavior changed
- [ ] Examples updated where consumer-visible behavior changed

## Constitution touchpoints

<!--
Which of the seven principles in `.specify/memory/constitution.md`
does this MR touch? For each touched principle, briefly note how
the change preserves the principle's guarantees (or, if it
relaxes a guarantee, link to the amendment that authorized it).

  I.   Stable Consumer API & Clear Boundaries
  II.  Browser-First Runtime Resilience
  III. Framework-Neutral Structured Observability
  IV.  Secure & Privacy-Safe Logging by Default  (NON-NEGOTIABLE)
  V.   Testable, Minimal, Maintainable Package Design
  VI.  Log Integrity & Monitoring Suitability
  VII. Lightweight Logger Instances & Federated Runtime

"This MR is docs-only and touches no principle directly" is a
valid answer when accurate.
-->

## DCO sign-off checklist

<!--
SafeSignal requires the Developer Certificate of Origin (DCO).
Every commit in this MR MUST carry a `Signed-off-by:` footer
(added via `git commit -s`). MRs without sign-off will not be
merged. See CONTRIBUTING.md § Developer Certificate of Origin
for the full text and retroactive-signoff instructions.
-->

- [ ] Every commit in this MR carries a `Signed-off-by:` footer (verify with `git log <base>..HEAD --format=%B | grep -c 'Signed-off-by:'`)

## Related Spec Kit feature (if applicable)

<!--
Link to the feature directory under `specs/` if this MR
implements (or is part of) a Spec Kit feature. Format:
`specs/<NNN>-<feature-name>/`.

Examples:
  - specs/001-structured-logging-core/
  - specs/002-beacon-transport/
  - specs/003-rename-safesignal/
  - specs/004-community-foundation/

Omit if this MR is a small fix that skipped the Spec Kit
workflow (typo, doc link, narrow bug fix).
-->

## Migration notes (if applicable)

<!--
Required only if this MR changes consumer-visible behavior
(import path, exported symbol, default behavior, transport
contract, redaction shape). Describe what consumers need to do
to update their code. If no consumer-visible behavior changes,
write "No migration required."
-->

---

By opening this MR, you confirm that your contributions are
licensed under the project's [MIT License](../../LICENSE) and
that you have read [CONTRIBUTING.md](../../CONTRIBUTING.md).
