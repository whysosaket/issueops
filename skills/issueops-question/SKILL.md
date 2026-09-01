---
name: issueops-question
description: Case playbook for an issueops run whose triage classified the GitHub issue as a question or discussion. Use after issueops-handler triage says "question" — answer from the code with references, make no code changes.
---

# issueops-question

A question run succeeds when the author gets a correct, verifiable answer. It never changes
code: no branch, no commits, no PR.

## Method

1. **Answer from the code, not from memory.** Read the actual implementation before
   answering. If the answer depends on a version or config, check what this repo does.
2. **Cite your sources.** Reference real files (`src/auth/session.ts`) and, where helpful,
   short quoted snippets — so the author can verify without trusting you.
3. **Answer the question asked**, then at most one short pointer beyond it (a relevant doc,
   a related config). No essays.
4. **If the question exposes a real problem** — a bug, a missing doc, a confusing API — say
   so explicitly at the end of the comment and suggest filing it as its own issue. Do not
   fix it in this run.
5. **If the answer is genuinely "it depends"**, lay out the 2–3 branches and what each
   depends on, briefly.

## Finishing

- Post ONE answer comment ending with the run marker.
- Result status is `triaged` (or `needs-info` if the question itself is too vague to answer).
- `pr_url` is always omitted.
