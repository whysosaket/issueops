---
name: issueops-feature
description: Case playbook for an issueops run whose triage classified the GitHub issue as a feature request. Use after issueops-handler triage says "feature" — covers scoping to the request, fitting existing patterns, tests, and docs.
---

# issueops-feature

A feature run succeeds when the *requested* capability works, fits the codebase like it was
always there, and is proven by tests.

## Method

1. **Check it doesn't already exist.** Search for the capability (including flags, config,
   or partial implementations). If it exists, answer with how to use it and finish `triaged`.
2. **Find the integration points.** Locate where similar features live: the module layout,
   registration patterns, naming, error handling. Your feature should reuse those patterns,
   helpers, and types — not invent parallel ones.
3. **Scope to the MVP of the request.** Build what the issue asks for, not the general
   platform it hints at. No speculative options, feature flags, or config for hypothetical
   future needs. If the request is genuinely ambiguous on a load-bearing point, pick the
   reading that is smallest and most consistent with the codebase, and state that choice in
   the plan comment.
4. **Tests are part of the feature.** New behavior gets tests in the repo's existing test
   style. Cover the happy path and the obvious failure path.
5. **Docs when user-facing.** If the repo documents features (README, docs/), add the new
   one in the same voice and depth as its neighbors.
6. **Watch for breaking changes.** Don't change existing public APIs, defaults, or output
   formats to make room for the feature unless the issue explicitly asks; if unavoidable,
   call it out loudly in the plan and PR.

## Plan comment must include

- The interpretation of the request (one sentence) and anything you deliberately excluded
- Where it plugs in: files/modules, following which existing pattern
- Test plan and docs impact

## Traps

- A feature request that's really a bug report in disguise — reclassify and use `issueops-bug`.
- Requests to add a dependency: prefer the standard library / existing deps; justify any new
  dependency in the PR body.
