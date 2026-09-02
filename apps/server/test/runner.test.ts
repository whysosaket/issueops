import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GlobalConfigSchema } from '@issueops/shared'
import { asc, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb } from '../src/db'
import { activity, issues, repos, runEvents, runs } from '../src/db/schema'
import { buildClaudeArgs, executeRun, type RunnerDeps } from '../src/runner'

const stub = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/claude-stub.mjs')

beforeAll(() => {
  fs.chmodSync(stub, 0o755)
})

function setup(): { deps: RunnerDeps; runId: number } {
  const db = createDb(':memory:')
  const now = new Date().toISOString()
  const repo = db
    .insert(repos)
    .values({ path: os.tmpdir(), owner: 'acme', name: 'demo', createdAt: now })
    .returning()
    .get()
  const issue = db
    .insert(issues)
    .values({
      repoId: repo.id,
      number: 7,
      title: 'Crash on save',
      body: 'It crashes.',
      state: 'open',
      url: 'https://github.com/acme/demo/issues/7',
      ghUpdatedAt: now,
    })
    .returning()
    .get()
  const run = db
    .insert(runs)
    .values({ repoId: repo.id, issueId: issue.id, issueNumber: 7, queuedAt: now })
    .returning()
    .get()
  const deps: RunnerDeps = {
    db,
    config: GlobalConfigSchema.parse({ claudeBin: stub, runTimeoutMinutes: 1 }),
    events: new EventEmitter(),
    skillsMountDir: os.tmpdir(),
  }
  return { deps, runId: run.id }
}

describe('executeRun', () => {
  it('persists the transcript and extracts the structured result', async () => {
    const { deps, runId } = setup()
    const statuses: string[] = []
    deps.events.on(`run:${runId}:status`, (s: string) => statuses.push(s))

    await executeRun(deps, runId)

    const run = deps.db.select().from(runs).where(eq(runs.id, runId)).get()
    expect(run?.status).toBe('succeeded')
    expect(run?.sessionId).toBe('sess-stub')
    expect(run?.costUsd).toBe(0.12)
    expect(run?.prUrl).toBe('https://github.com/acme/demo/pull/9')
    expect(run?.resultStatus).toBe('done')
    expect(run?.exitCode).toBe(0)
    expect(statuses).toEqual(['running', 'succeeded'])

    const events = deps.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.seq))
      .all()
    expect(events).toHaveLength(3)
    expect(JSON.parse(events[0]?.event ?? '{}').type).toBe('system')

    const feed = deps.db.select().from(activity).all()
    expect(feed.some((a) => a.kind === 'run' && a.message.includes('started'))).toBe(true)
    expect(feed.some((a) => a.kind === 'run' && a.message.includes('succeeded'))).toBe(true)
  })

  it('marks the run failed on nonzero exit and keeps stderr context', async () => {
    const { deps, runId } = setup()
    process.env.STUB_EXIT = '2'
    try {
      await executeRun(deps, runId)
    } finally {
      delete process.env.STUB_EXIT
    }
    const run = deps.db.select().from(runs).where(eq(runs.id, runId)).get()
    expect(run?.status).toBe('failed')
    expect(run?.exitCode).toBe(2)
    expect(run?.error).toContain('stub blew up')
  })

  it('fails cleanly when the claude binary does not exist', async () => {
    const { deps, runId } = setup()
    deps.config.claudeBin = '/nonexistent/claude'
    await executeRun(deps, runId)
    const run = deps.db.select().from(runs).where(eq(runs.id, runId)).get()
    expect(run?.status).toBe('failed')
    expect(run?.error).toContain('could not start')
  })
})

describe('buildClaudeArgs', () => {
  it('builds a locked-down headless invocation', () => {
    const args = buildClaudeArgs(
      { maxTurns: 50, maxBudgetUsd: 3, testCommand: 'pnpm test' },
      'CONTRACT',
      '/mount',
    )
    expect(args).toContain('-p')
    expect(args).toContain('stream-json')
    expect(args.join(' ')).toContain('--add-dir /mount')
    expect(args.join(' ')).toContain('--max-turns 50')
    expect(args.join(' ')).toContain('--max-budget-usd 3')
    const allowed = args[args.indexOf('--allowedTools') + 1]
    expect(allowed).toContain('Bash(git:*)')
    expect(allowed).toContain('Bash(gh:*)')
    expect(allowed).toContain('Bash(pnpm test:*)')
  })

  it('omits the budget flag when unset', () => {
    const args = buildClaudeArgs({ maxTurns: 50, maxBudgetUsd: null, testCommand: null }, 'C', '/m')
    expect(args).not.toContain('--max-budget-usd')
  })
})
