---
name: issueops-bug
description: Case playbook for an issueops run whose triage classified the GitHub issue as a bug. Use after issueops-handler triage says "bug" — covers reproducing, root-causing, regression testing, and shipping a minimal fix.
---

# issueops-bug

A bug run succeeds when the *cause* is fixed, proven by a test that failed before the fix.

## Method

1. **Reproduce before you believe.** Run the failing test, or write a minimal repro from
   the report. If you cannot reproduce it and cannot trace a failing path in code, it's not
   actionable — finish with `needs-info` listing what you tried and what you need.
2. **Root-cause, don't symptom-patch.** Trace from the observed failure to the line that's
   actually wrong. If the obvious fix site would only mask a deeper cause, fix the cause.
3. **Regression test first.** Extend the existing suite with a test that fails on the
   current code and passes after your fix. If the repo has no test setup at all, say so in
   the PR and describe your manual verification instead.
4. **Minimal fix.** Change the fewest lines that genuinely fix it. No drive-by refactors,
   no formatting churn outside touched lines.
5. **Check for siblings.** The same mistake often exists in copy-pasted or parallel code —
   search for the pattern and fix identical instances in the same PR (mention them).
6. **Verify wide.** Run the full test command, not just the new test.

## Plan comment must include

- Repro evidence (the failing test/command and its output, briefly)
- Root cause: which file/line and why it's wrong
- Fix approach + regression test plan

## Traps

- The reporter's suggested fix can be wrong even when the bug is real — verify against code.
- "Fixing" by loosening an assertion or widening a type usually hides the bug; don't.
- If the bug is actually intended behavior, explain that in a comment and finish `triaged`.
