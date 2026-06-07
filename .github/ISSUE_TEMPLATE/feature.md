---
name: Feature request
about: Propose a new feature or a change to an existing one
title: ""
labels: enhancement
---

<!--
Use this template to propose a new feature or a change to an
existing one. For larger changes, expect the discussion to
converge on a Spec Kit feature spec
(`/speckit-specify` → … → `/speckit-implement`).

For bugs in existing behavior, use the Bug template instead.
For security issues, use the private reporting channel (see SECURITY.md).
-->

## Consumer use case

<!--
What are you trying to accomplish that the current SDK can't do
(or that the SDK could do better)? Describe from the consumer's
perspective — what problem you're solving in your application.
-->

## Proposed change

<!--
Rough sketch of what you'd like to see. API shape if applicable,
example call sites, expected behavior. It's fine to be informal
here — the spec phase will pin down details.
-->

```ts
// example API sketch, if applicable
```

## Constitution touchpoints

<!--
SafeSignal is governed by the constitution at
`.specify/memory/constitution.md`. Which of its principles does
this feature touch? Note any principle the feature would stress
or that needs to be re-evaluated.

Principle I (Spec-Driven Development) and Principle V (Secure &
Privacy-Safe Logging by Default) are NON-NEGOTIABLE. If a feature
would require amending the constitution itself, call that out
explicitly — amendments are a separate process (see GOVERNANCE.md).
-->

## Existing API surface impact

<!--
Would this change any existing exported symbol, type, function
signature, default behavior, or runtime contract? List anything
that would change. "No existing surface affected" is a valid
answer for purely-additive features. (Per Principle II, an
incompatible change must ship deprecated first with a migration
path before removal.)
-->

## Alternatives considered

<!--
What else did you consider? Why isn't an existing combination of
SDK features sufficient? Knowing the alternatives helps narrow
the design space.
-->

## Additional context

<!--
Anything else worth knowing — links to similar features in other
SDKs, prior-art discussions, related issues.
-->

---

By submitting this issue, you agree to abide by the project's
[Code of Conduct](CODE_OF_CONDUCT.md). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the Spec Kit workflow and
the pull-request process if this feature lands.
