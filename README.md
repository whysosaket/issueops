# issueops

**Turn GitHub issues into Claude Code runs — on your own machine.**

issueops is a local control plane for your development workflow. A small daemon watches the
GitHub repos you connect, and when an issue is labeled for it, it hands the issue to your
locally-installed [Claude Code](https://code.claude.com) — which triages it, posts a plan as
an issue comment, implements the fix on a branch, opens a pull request, and (if you let it)
merges. Your team files issues; your machine ships fixes.

issueops itself never writes code. It is a **proxy between GitHub issues and Claude Code**:
it discovers work, builds a locked-down headless `claude` invocation, streams the transcript
into a local dashboard, and reconciles the outcome back to the issue with labels.

```
GitHub issues ──poll──▶ issueops daemon ──spawns──▶ claude -p (your login, your machine)
                            │                            │
                       dashboard (localhost)        plan comment → branch → PR → merge
```

## How it works

1. `issueops install` sets up a launchd agent (macOS) so the daemon runs at login.
2. Connect a local clone of any GitHub repo from the dashboard at `http://127.0.0.1:7411`.
3. The daemon polls the repo's issues (default: every 30 min, or hit **Poll now**).
4. Issues carrying the watch label (default `issueops`) are dispatched: the daemon spawns
   `claude -p` in the repo with a run contract + the `issueops-handler` skill.
5. Claude Code does the work and reports back; the daemon applies state labels
   (`issueops:in-progress`, `issueops:planned`, `issueops:done`, `issueops:failed`,
   `issueops:needs-info`) and records the full transcript, cost, and PR link.

### Autonomy levels (per repo)

| Level | What happens |
|---|---|
| `triage-only` | Classifies the issue and posts a triage comment |
| `plan-only` | Posts an implementation plan as a comment, stops |
| `plan-pr` | Plan + implementation on a branch + pull request |
| `plan-pr-merge` *(default)* | All of the above, and merges when checks pass |

## Requirements

- macOS (launchd integration; `issueops run` works anywhere Node runs — systemd unit planned)
- Node.js ≥ 20 and pnpm
- [Claude Code](https://code.claude.com) installed and logged in (`claude` on your PATH)
- [GitHub CLI](https://cli.github.com) logged in (`gh auth login`)

## Install (from source, for now)

```bash
git clone https://github.com/whysosaket/issueops
cd issueops
pnpm install && pnpm build
node packages/cli/dist/index.js install   # or: pnpm link --global (from packages/cli)
```

Then open the dashboard:

```bash
issueops open        # http://127.0.0.1:7411
issueops doctor      # verify claude, gh, daemon, launchd
```

Connect a repo by its local path, label an issue `issueops`, and watch the run stream live.

## CLI

```
issueops init        Set up ~/.issueops (config + skills)
issueops install     Install + start the launchd agent (macOS)
issueops start|stop|restart|status
issueops run         Foreground daemon (development / other platforms)
issueops logs        Recent daemon logs
issueops open        Open the dashboard
issueops doctor      Environment checks (--smoke runs a real claude call)
```

## Safety model

Full-auto merge is powerful, so the defaults are deliberately careful:

- **Label-gated**: only issues carrying the watch label are ever dispatched.
- **Author allowlist** (optional, per repo): restrict dispatch to issues opened by specific
  GitHub users — recommended for public repos running above `plan-only`.
- **Locked-down runs**: headless Claude Code gets `--permission-mode acceptEdits` plus an
  allowlist (`git`, `gh`, your test command) — nothing else is auto-approved; `--max-turns`
  and an optional per-repo budget cap bound each run.
- **Untrusted input**: the run contract and skill treat issue text as data — instructions
  in an issue can't change the autonomy level, touch secrets, or reach other repos.
- **No default-branch commits**, no force-pushes; all work happens on `issueops/issue-<n>`
  branches, and state labels prevent loops and re-processing.
- **Human override**: every run can be watched live, cancelled, and retried from the dashboard.

Set autonomy per repo to `plan-only` if you want a human between plan and code.

## Architecture

```
apps/server     Daemon: Hono API + SSE, scheduler, run queue, claude runner, SQLite (Drizzle)
apps/web        Dashboard: React + Vite + Tailwind + TanStack Query
packages/cli    `issueops` CLI: lifecycle, launchd, doctor
packages/shared Shared zod schemas + types
skills/         The issueops-handler skill that guides every run
```

Everything lives in `~/.issueops/` (config, SQLite DB, logs, skills mount). The daemon binds
`127.0.0.1` only.

## Development

```bash
pnpm install
pnpm dev          # server (tsup --watch) + web (vite) in parallel
pnpm test         # vitest — includes a fake `claude` stub, no tokens spent
pnpm lint && pnpm typecheck && pnpm build
```

issueops dogfoods itself: issues on this repo labeled `issueops` are handled by issueops.

## License

MIT
