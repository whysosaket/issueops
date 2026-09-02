import fs from 'node:fs'
import path from 'node:path'
import {
  type Autonomy,
  GlobalConfigSchema,
  GlobalConfigUpdateSchema,
  type Health,
  type Issue,
  type Repo,
  RepoCreateSchema,
  RepoSettingsSchema,
  RepoUpdateSchema,
  type Run,
  type RunStatus,
  SKILL_NAME_PATTERN,
} from '@issueops/shared'
import { saveConfig } from '@issueops/shared/node'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { ZodError, z } from 'zod'
import { ACTIVITY_EVENT, record } from './activity'
import type { AppContext } from './context'
import { activity, issues, repos, runEvents, runs } from './db/schema'
import { bestEffort, detectGitHubRemote } from './github'
import { log } from './logger'
import { createRun, pollRepo } from './poller'
import { cancelRun } from './runner'
import {
  deleteSkill,
  listSkills,
  readGlobalGuardrails,
  readSkill,
  removeRepoSkillsMount,
  writeGlobalGuardrails,
  writeSkill,
} from './skills'

type RepoRow = typeof repos.$inferSelect
type IssueRow = typeof issues.$inferSelect
type RunRow = typeof runs.$inferSelect

const TERMINAL: RunStatus[] = ['succeeded', 'failed', 'cancelled', 'interrupted']

function toRepo(row: RepoRow): Repo {
  return {
    ...row,
    autonomy: row.autonomy as Autonomy,
    allowedAuthors: JSON.parse(row.allowedAuthors) as string[],
    contextFiles: JSON.parse(row.contextFiles) as string[],
    skills: JSON.parse(row.skills) as string[],
  }
}

function toIssue(row: IssueRow): Issue {
  return { ...row, labels: JSON.parse(row.labels) as string[] }
}

function toRun(row: RunRow): Run {
  return { ...row, status: row.status as RunStatus, trigger: row.trigger as 'poll' | 'manual' }
}

export function createApi(ctx: AppContext): Hono {
  const app = new Hono()
  const { db } = ctx

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: 'invalid request', issues: err.issues }, 400)
    }
    log.error(`api error on ${c.req.method} ${c.req.path}`, err)
    return c.json({ error: err.message }, 500)
  })

  app.get('/api/health', (c) => {
    const queuedRuns = db.select().from(runs).where(eq(runs.status, 'queued')).all().length
    const health: Health = {
      status: 'ok',
      version: ctx.version,
      uptimeSeconds: Math.round((Date.now() - ctx.startedAt) / 1000),
      activeRuns: ctx.queue.active,
      queuedRuns,
    }
    return c.json(health)
  })

  app.get('/api/repos', (c) => c.json(db.select().from(repos).all().map(toRepo)))

  app.post('/api/repos', async (c) => {
    const body = RepoCreateSchema.parse(await c.req.json())
    const repoPath = path.resolve(body.path)
    if (!fs.existsSync(path.join(repoPath, '.git'))) {
      return c.json({ error: `${repoPath} is not a git repository` }, 400)
    }
    if (db.select().from(repos).where(eq(repos.path, repoPath)).get()) {
      return c.json({ error: 'repository already connected' }, 409)
    }
    let remote: { owner: string; name: string }
    try {
      remote = await detectGitHubRemote(repoPath)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
    const settings = RepoSettingsSchema.parse(body)
    const row = db
      .insert(repos)
      .values({
        path: repoPath,
        owner: remote.owner,
        name: remote.name,
        ...settings,
        allowedAuthors: JSON.stringify(settings.allowedAuthors),
        contextFiles: JSON.stringify(settings.contextFiles),
        skills: JSON.stringify(settings.skills),
        createdAt: new Date().toISOString(),
      })
      .returning()
      .get()
    record(db, ctx.events, 'repo', `connected ${remote.owner}/${remote.name}`, {
      repoId: row.id,
    })
    await bestEffort('ensure labels', () => ctx.github.ensureLabels(remote.owner, remote.name))
    pollRepo(ctx, row.id).catch((err) =>
      log.error(`initial poll failed for ${remote.owner}/${remote.name}`, err),
    )
    return c.json(toRepo(row), 201)
  })

  app.patch('/api/repos/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const { allowedAuthors, contextFiles, skills, ...patch } = RepoUpdateSchema.parse(
      await c.req.json(),
    )
    const existing = db.select().from(repos).where(eq(repos.id, id)).get()
    if (!existing) return c.json({ error: 'repo not found' }, 404)
    const row = db
      .update(repos)
      .set({
        ...patch,
        ...(allowedAuthors !== undefined && { allowedAuthors: JSON.stringify(allowedAuthors) }),
        ...(contextFiles !== undefined && { contextFiles: JSON.stringify(contextFiles) }),
        ...(skills !== undefined && { skills: JSON.stringify(skills) }),
      })
      .where(eq(repos.id, id))
      .returning()
      .get()
    return c.json(toRepo(row))
  })

  app.delete('/api/repos/:id', (c) => {
    const id = Number(c.req.param('id'))
    if (!db.select().from(repos).where(eq(repos.id, id)).get()) {
      return c.json({ error: 'repo not found' }, 404)
    }
    const runIds = db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.repoId, id))
      .all()
      .map((r) => r.id)
    if (runIds.length) db.delete(runEvents).where(inArray(runEvents.runId, runIds)).run()
    const repoRow = db.select().from(repos).where(eq(repos.id, id)).get()
    db.delete(runs).where(eq(runs.repoId, id)).run()
    db.delete(issues).where(eq(issues.repoId, id)).run()
    db.delete(repos).where(eq(repos.id, id)).run()
    removeRepoSkillsMount(id)
    record(db, ctx.events, 'repo', `disconnected ${repoRow?.owner}/${repoRow?.name}`)
    return c.json({ ok: true })
  })

  app.post('/api/repos/:id/poll', async (c) => {
    const id = Number(c.req.param('id'))
    if (!db.select().from(repos).where(eq(repos.id, id)).get()) {
      return c.json({ error: 'repo not found' }, 404)
    }
    return c.json(await pollRepo(ctx, id))
  })

  app.get('/api/repos/:id/issues', (c) => {
    const id = Number(c.req.param('id'))
    const rows = db
      .select()
      .from(issues)
      .where(eq(issues.repoId, id))
      .orderBy(desc(issues.number))
      .all()
    const repoRuns = db.select().from(runs).where(eq(runs.repoId, id)).orderBy(desc(runs.id)).all()
    const latestByIssue = new Map<number, RunRow>()
    for (const run of repoRuns) {
      if (!latestByIssue.has(run.issueId)) latestByIssue.set(run.issueId, run)
    }
    return c.json(
      rows.map((row) => {
        const latest = latestByIssue.get(row.id)
        return {
          ...toIssue(row),
          latestRunId: latest?.id ?? null,
          latestRunStatus: latest?.status ?? null,
        }
      }),
    )
  })

  app.post('/api/issues/:id/dispatch', (c) => {
    const id = Number(c.req.param('id'))
    const issue = db.select().from(issues).where(eq(issues.id, id)).get()
    if (!issue) return c.json({ error: 'issue not found' }, 404)
    const active = db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.issueId, id), inArray(runs.status, ['queued', 'running'])))
      .get()
    if (active) return c.json({ error: `run ${active.id} is already active for this issue` }, 409)
    const runId = createRun(ctx, {
      repoId: issue.repoId,
      issueId: issue.id,
      issueNumber: issue.number,
      trigger: 'manual',
    })
    record(db, ctx.events, 'run', `manually dispatched #${issue.number} "${issue.title}"`, {
      repoId: issue.repoId,
      runId,
    })
    return c.json({ runId }, 201)
  })

  app.get('/api/runs', (c) => {
    const repoId = c.req.query('repoId')
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 200)
    const rows = db
      .select({ run: runs, repoName: repos.name, issueTitle: issues.title })
      .from(runs)
      .innerJoin(repos, eq(runs.repoId, repos.id))
      .innerJoin(issues, eq(runs.issueId, issues.id))
      .where(repoId ? eq(runs.repoId, Number(repoId)) : undefined)
      .orderBy(desc(runs.id))
      .limit(limit)
      .all()
    return c.json(
      rows.map((r) => ({ ...toRun(r.run), repoName: r.repoName, issueTitle: r.issueTitle })),
    )
  })

  app.get('/api/runs/:id', (c) => {
    const id = Number(c.req.param('id'))
    const row = db
      .select({ run: runs, repoName: repos.name, issueTitle: issues.title, issueUrl: issues.url })
      .from(runs)
      .innerJoin(repos, eq(runs.repoId, repos.id))
      .innerJoin(issues, eq(runs.issueId, issues.id))
      .where(eq(runs.id, id))
      .get()
    if (!row) return c.json({ error: 'run not found' }, 404)
    return c.json({
      ...toRun(row.run),
      repoName: row.repoName,
      issueTitle: row.issueTitle,
      issueUrl: row.issueUrl,
    })
  })

  app.post('/api/runs/:id/cancel', (c) => {
    const id = Number(c.req.param('id'))
    const run = db.select().from(runs).where(eq(runs.id, id)).get()
    if (!run) return c.json({ error: 'run not found' }, 404)
    if (run.status === 'queued') {
      db.update(runs)
        .set({
          status: 'cancelled',
          error: 'cancelled by user',
          finishedAt: new Date().toISOString(),
        })
        .where(eq(runs.id, id))
        .run()
      ctx.events.emit(`run:${id}:status`, 'cancelled')
      return c.json({ ok: true })
    }
    if (run.status === 'running' && cancelRun(id)) {
      record(db, ctx.events, 'run', `cancel requested for run ${id}`, {
        repoId: run.repoId,
        runId: id,
      })
      return c.json({ ok: true })
    }
    return c.json({ error: `run is ${run.status}` }, 409)
  })

  app.get('/api/runs/:id/events', (c) => {
    const runId = Number(c.req.param('id'))
    if (!db.select({ id: runs.id }).from(runs).where(eq(runs.id, runId)).get()) {
      return c.json({ error: 'run not found' }, 404)
    }
    const after = Number(c.req.query('after') ?? 0)
    return streamSSE(c, async (stream) => {
      const pending: { seq: number; line: string }[] = []
      const onEvent = (e: { seq: number; line: string }) => pending.push(e)
      ctx.events.on(`run:${runId}:event`, onEvent)
      try {
        let lastSeq = after
        const replay = db.select().from(runEvents).where(eq(runEvents.runId, runId)).all()
        for (const e of replay.sort((a, b) => a.seq - b.seq)) {
          if (e.seq <= after) continue
          lastSeq = e.seq
          await stream.writeSSE({ event: 'line', data: e.event, id: String(e.seq) })
        }
        let idleTicks = 0
        while (!stream.closed) {
          while (pending.length) {
            const e = pending.shift()
            if (e && e.seq > lastSeq) {
              lastSeq = e.seq
              idleTicks = 0
              await stream.writeSSE({ event: 'line', data: e.line, id: String(e.seq) })
            }
          }
          const status = db
            .select({ status: runs.status })
            .from(runs)
            .where(eq(runs.id, runId))
            .get()
          if (!status || TERMINAL.includes(status.status as RunStatus)) {
            await stream.writeSSE({ event: 'status', data: status?.status ?? 'unknown' })
            break
          }
          idleTicks++
          if (idleTicks % 15 === 0) await stream.writeSSE({ event: 'ping', data: '' })
          await stream.sleep(1000)
        }
      } finally {
        ctx.events.off(`run:${runId}:event`, onEvent)
      }
    })
  })

  app.get('/api/activity', (c) => {
    const limit = Math.min(Number(c.req.query('limit') ?? 100), 500)
    return c.json(db.select().from(activity).orderBy(desc(activity.id)).limit(limit).all())
  })

  app.get('/api/activity/stream', (c) => {
    const after = Number(c.req.query('after') ?? 0)
    return streamSSE(c, async (stream) => {
      const pending: { id: number }[] = []
      const onActivity = (item: { id: number }) => pending.push(item)
      ctx.events.on(ACTIVITY_EVENT, onActivity)
      try {
        const replay = db
          .select()
          .from(activity)
          .orderBy(desc(activity.id))
          .limit(100)
          .all()
          .reverse()
        let lastId = after
        for (const item of replay) {
          if (item.id <= after) continue
          lastId = item.id
          await stream.writeSSE({ event: 'item', data: JSON.stringify(item), id: String(item.id) })
        }
        let idleTicks = 0
        while (!stream.closed) {
          while (pending.length) {
            const item = pending.shift()
            if (item && item.id > lastId) {
              lastId = item.id
              idleTicks = 0
              await stream.writeSSE({
                event: 'item',
                data: JSON.stringify(item),
                id: String(item.id),
              })
            }
          }
          idleTicks++
          if (idleTicks % 15 === 0) await stream.writeSSE({ event: 'ping', data: '' })
          await stream.sleep(1000)
        }
      } finally {
        ctx.events.off(ACTIVITY_EVENT, onActivity)
      }
    })
  })

  app.get('/api/skills', (c) => c.json(listSkills()))

  app.get('/api/skills/:name', (c) => {
    const name = c.req.param('name')
    if (!SKILL_NAME_PATTERN.test(name)) return c.json({ error: 'invalid skill name' }, 400)
    const content = readSkill(name)
    if (content === null) return c.json({ error: 'skill not found' }, 404)
    const shipped = listSkills().find((s) => s.name === name)?.shipped ?? false
    return c.json({ name, content, shipped })
  })

  app.put('/api/skills/:name', async (c) => {
    const name = c.req.param('name')
    if (!SKILL_NAME_PATTERN.test(name)) {
      return c.json({ error: 'skill name must be lowercase letters, digits, and hyphens' }, 400)
    }
    const { content } = z.object({ content: z.string().min(1) }).parse(await c.req.json())
    return c.json(writeSkill(name, content))
  })

  app.delete('/api/skills/:name', (c) => {
    const name = c.req.param('name')
    if (!SKILL_NAME_PATTERN.test(name)) return c.json({ error: 'invalid skill name' }, 400)
    if (!deleteSkill(name)) return c.json({ error: 'skill not found' }, 404)
    return c.json({ ok: true })
  })

  app.get('/api/guardrails', (c) => c.json({ content: readGlobalGuardrails() }))

  app.put('/api/guardrails', async (c) => {
    const { content } = z.object({ content: z.string() }).parse(await c.req.json())
    writeGlobalGuardrails(content)
    return c.json({ content })
  })

  app.get('/api/settings', (c) => {
    const { githubToken, ...rest } = ctx.config
    return c.json({ ...rest, githubToken: githubToken ? '***' : undefined })
  })

  app.patch('/api/settings', async (c) => {
    const patch = GlobalConfigUpdateSchema.parse(await c.req.json())
    if (patch.githubToken === '***') delete patch.githubToken
    const restartNeeded =
      (patch.port !== undefined && patch.port !== ctx.config.port) ||
      (patch.host !== undefined && patch.host !== ctx.config.host)
    const merged = GlobalConfigSchema.parse({ ...ctx.config, ...patch })
    saveConfig(merged)
    Object.assign(ctx.config, merged)
    const { githubToken, ...rest } = merged
    return c.json({
      ...rest,
      githubToken: githubToken ? '***' : undefined,
      restartNeeded,
    })
  })

  return app
}
