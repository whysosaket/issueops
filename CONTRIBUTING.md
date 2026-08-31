# Contributing to issueops

Thanks for helping out! The fastest way to contribute is to file a good issue — this project
literally runs on them.

## Setup

```bash
pnpm install
pnpm dev        # daemon on :7411 with tsup watch, dashboard on :5173 via vite proxy
```

`pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` must all pass before a PR.
Tests never call the real `claude` binary — the runner is tested against
`apps/server/test/fixtures/claude-stub.mjs`, which emits canned stream-json. If you change
the runner's parsing, extend the stub.

## Repo map

- `apps/server/src/runner.ts` — spawns `claude -p`, parses stream-json, reconciles GitHub state
- `apps/server/src/poller.ts` + `eligibility.ts` — issue discovery and dispatch rules
- `apps/server/src/api.ts` — REST + SSE surface consumed by the dashboard
- `packages/cli` — lifecycle commands and launchd integration
- `skills/issueops-handler/SKILL.md` — the playbook Claude Code follows during a run

## Guidelines

- Keep the daemon a *proxy*: intelligence belongs in the skill, plumbing in the server.
- New run behavior needs a test against the stub, plus an eligibility test if dispatch
  rules change.
- The dashboard is intentionally small — no state libraries beyond TanStack Query.
- Cross-platform: launchd code must stay behind `process.platform === 'darwin'` guards;
  everything else should run on Linux (systemd support is a wanted contribution!).

## Filing issues

Use the issue templates. If you label an issue `issueops` on your own fork/clone, your local
issueops will pick it up — that's the intended development loop.
