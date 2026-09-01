---
name: issueops-chore
description: Case playbook for an issueops run whose triage classified the GitHub issue as a chore or maintenance task — dependency bumps, renames, CI tweaks, cleanup. Use after issueops-handler triage says "chore" — keep it mechanical and verify with the full test suite.
---

# issueops-chore

A chore run succeeds when the mechanical change is complete (no stragglers) and nothing
else changed.

## Method

1. **Confirm it's actually mechanical.** If the "chore" requires design decisions (e.g. a
   dependency bump with breaking API changes that need judgment calls), say so in the plan
   and scope the run to what is mechanical, or reclassify.
2. **Dependency bumps:** read the changelog/release notes between the current and target
   version. List breaking changes in the plan comment. Update usage sites for renamed or
   removed APIs. Never pin to an unreleased or yanked version.
3. **Renames / moves / cleanup:** find ALL references (imports, strings, docs, CI files,
   scripts) — a rename with stragglers is worse than no rename. Grep for the old name after
   the change; the result should be empty or explainable.
4. **CI/config tweaks:** make the minimal edit; don't upgrade unrelated actions or
   restructure the workflow while you're in the file.
5. **No drive-by refactors.** Chores have the highest temptation and the lowest tolerance
   for scope creep. Formatting, dead-code removal, or "improvements" outside the asked
   change belong in their own issue.
6. **Verify with the FULL suite** (tests, lint, typecheck, build if available) — chores
   touch wide surfaces, so narrow verification is not enough.

## Plan comment must include

- The exact mechanical operation and its blast radius (which files/kinds of files)
- For dep bumps: version delta + breaking changes found in the changelog
- The full-verification commands you will run
