---
name: issueops-docs
description: Case playbook for an issueops run whose triage classified the GitHub issue as a documentation problem or request. Use after issueops-handler triage says "docs" — verify against actual code behavior, then fix the docs in the repo's own voice.
---

# issueops-docs

A docs run succeeds when the documentation matches what the code *actually does* — the code
is the source of truth, not the issue's claim and not the existing doc.

## Method

1. **Verify the claim against the code.** Before editing, read the implementation the doc
   describes. Three outcomes:
   - Doc is wrong, code is right → fix the doc (this run).
   - Doc is right, code is wrong → that's a bug; reclassify and follow `issueops-bug`.
   - Both are right, reader was confused → improve the doc's clarity, don't change its facts.
2. **Match the existing voice.** Same tone, person, heading style, and depth as the
   surrounding docs. A docs PR that reads like a different author wrote it is a defect.
3. **Test executable examples.** If the doc contains commands or code samples, run them.
   Broken examples are the most common docs bug.
4. **Keep the diff tight.** Fix what the issue is about; don't reflow paragraphs or rewrite
   sections that aren't wrong.
5. **Check for siblings.** The same outdated fact often appears in README + docs/ + code
   comments — fix all instances in the same PR.

## Ship it

Docs changes go through the normal branch → PR flow (per the autonomy level). Tests aren't
required unless the repo tests its docs (link checkers, doctest) — then those must pass.
