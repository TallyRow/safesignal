<!--
Fill in every required section below. Optional sections may be
omitted if not applicable. See CONTRIBUTING.md for the full pull
request workflow and the DCO sign-off requirement.
-->

## Summary

<!-- One paragraph describing what this PR does and why. -->

## What changed

<!-- Bulleted list of the concrete changes. Files added/removed,
behavior changes, API additions, etc. -->

-
-

## Verification

<!--
How did you verify the change works? Be specific — name what you
ran and what passed. Examples:

  - `npm test` passes locally
  - `npm run build` produces the expected dist artifacts
  - `npm run typecheck`, `npm run lint`, `npm run format:check` clean
  - Manual smoke test of <specific behavior>
-->

## Test plan

<!--
Checklist for the reviewer. Adjust to match the scope of the PR.
Strike through items that don't apply.
-->

- [ ] `npm test` passes (or document the new baseline if intentional)
- [ ] `npm run build` succeeds; all `dist/*.{mjs,cjs}` entries emit
- [ ] No bundle-size regression beyond ±1 KiB gzipped on the core/beacon/otlp bundles
- [ ] `tests/contract/dependency-pins.test.ts` passes unchanged (deps + `exports` map shape preserved)
- [ ] `tests/security/*.security.test.ts` passes unchanged (redaction / sanitizer / URL-scrubber pipeline preserved)
- [ ] Documentation updated where consumer-visible behavior changed
- [ ] Examples updated where consumer-visible behavior changed

## Constitution touchpoints

<!--
Which principle(s) in `.specify/memory/constitution.md` does this
PR touch? For each, briefly note how the change preserves the
principle's guarantees (or link to the amendment that authorized
relaxing it). Principle I (Spec-Driven Development) and Principle V
(Secure & Privacy-Safe Logging) are NON-NEGOTIABLE.

"This PR is docs-only and touches no principle directly" is a valid
answer when accurate.
-->

## DCO sign-off checklist

<!--
SafeSignal requires the Developer Certificate of Origin (DCO).
Every commit in this PR MUST carry a `Signed-off-by:` footer
(added via `git commit -s`). PRs without sign-off will not be
merged. See CONTRIBUTING.md § Developer Certificate of Origin
for the full text and retroactive-signoff instructions.
-->

- [ ] Every commit in this PR carries a `Signed-off-by:` footer (verify with `git log <base>..HEAD --format=%B | grep -c 'Signed-off-by:'`)

## Related Spec Kit feature (if applicable)

<!--
Link to the feature directory under `specs/` if this PR implements
(or is part of) a Spec Kit feature, e.g. `specs/010-github-migration/`.
Omit if this is a small fix that skipped the Spec Kit workflow.
-->

## Migration notes (if applicable)

<!--
Required only if this PR changes consumer-visible behavior (import
path, exported symbol, default behavior, transport contract,
redaction shape). Per Principle II, an incompatible change ships
deprecated first with a migration path. If nothing changes for
consumers, write "No migration required."
-->

---

By opening this PR, you confirm that your contributions are
licensed under the project's [MIT License](LICENSE) and that you
have read [CONTRIBUTING.md](CONTRIBUTING.md).
