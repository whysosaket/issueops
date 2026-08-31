import { and, eq } from 'drizzle-orm'
import type { AppContext } from './context'
import { issues, repos, runs } from './db/schema'
import { checkEligibility } from './eligibility'
import type { RemoteIssue } from './github'
import { log } from './logger'

function upsertIssue(ctx: AppContext, repoId: number, remote: RemoteIssue): { id: number } {
  const fields = {
    title: remote.title,
    body: remote.body,
    author: remote.author,
    state: remote.state,
    labels: JSON.stringify(remote.labels),
    url: remote.url,
    ghUpdatedAt: remote.updatedAt,
  }
  const existing = ctx.db
    .select({ id: issues.id })
    .from(issues)
    .where(and(eq(issues.repoId, repoId), eq(issues.number, remote.number)))
    .get()
  if (existing) {
    ctx.db.update(issues).set(fields).where(eq(issues.id, existing.id)).run()
    return existing
  }
  return ctx.db
    .insert(issues)
    .values({ repoId, number: remote.number, ...fields })
    .returning({ id: issues.id })
    .get()
}

export function createRun(
  ctx: AppContext,
  args: { repoId: number; issueId: number; issueNumber: number; trigger: 'poll' | 'manual' },
): number {
  const row = ctx.db
    .insert(runs)
    .values({ ...args, status: 'queued', queuedAt: new Date().toISOString() })
    .returning({ id: runs.id })
    .get()
  ctx.queue.tick()
  return row.id
}

export async function pollRepo(
  ctx: AppContext,
  repoId: number,
): Promise<{ discovered: number; enqueued: number }> {
  const repo = ctx.db.select().from(repos).where(eq(repos.id, repoId)).get()
  if (!repo?.enabled) return { discovered: 0, enqueued: 0 }

  let remote: RemoteIssue[]
  // Poll with an overlap window behind the cursor: GitHub's since/label index can lag,
  // and a cursor that advances past a just-created issue would hide it forever.
  // Re-discovered issues are deduped by eligibility (state labels + run history).
  const OVERLAP_MS = 10 * 60_000
  const polledAt = new Date().toISOString()
  try {
    remote = await ctx.github.listOpenIssues(repo.owner, repo.name, {
      label: repo.watchLabel || undefined,
      since: repo.lastPolledAt
        ? new Date(Date.parse(repo.lastPolledAt) - OVERLAP_MS).toISOString()
        : undefined,
    })
  } catch (err) {
    ctx.github.invalidate()
    throw err
  }

  let enqueued = 0
  for (const r of remote) {
    if (r.isPullRequest) continue
    const issueRow = upsertIssue(ctx, repo.id, r)
    const prior = ctx.db
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.issueId, issueRow.id))
      .all()
      .map((x) => x.status)
    const check = checkEligibility(
      { state: r.state, labels: r.labels, author: r.author, isPullRequest: r.isPullRequest },
      {
        watchLabel: repo.watchLabel,
        allowedAuthors: JSON.parse(repo.allowedAuthors) as string[],
        priorRunStatuses: prior,
      },
    )
    if (!check.eligible) {
      log.info(`skip ${repo.owner}/${repo.name}#${r.number}: ${check.reason}`)
      continue
    }
    createRun(ctx, {
      repoId: repo.id,
      issueId: issueRow.id,
      issueNumber: r.number,
      trigger: 'poll',
    })
    enqueued++
  }

  ctx.db.update(repos).set({ lastPolledAt: polledAt }).where(eq(repos.id, repo.id)).run()
  return { discovered: remote.length, enqueued }
}
