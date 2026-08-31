import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db'
import { issues, repos, runs } from '../src/db/schema'
import { RunQueue } from '../src/queue'

function seed(db: ReturnType<typeof createDb>, runCount: number) {
  const now = new Date().toISOString()
  const repo = db
    .insert(repos)
    .values({ path: '/tmp/q', owner: 'o', name: 'r', concurrency: 1, createdAt: now })
    .returning()
    .get()
  const issue = db
    .insert(issues)
    .values({
      repoId: repo.id,
      number: 1,
      title: 't',
      state: 'open',
      url: 'https://example.com',
      ghUpdatedAt: now,
    })
    .returning()
    .get()
  for (let i = 0; i < runCount; i++) {
    db.insert(runs)
      .values({ repoId: repo.id, issueId: issue.id, issueNumber: 1, queuedAt: now })
      .run()
  }
}

describe('RunQueue', () => {
  it('respects per-repo concurrency of 1 even with global headroom', async () => {
    const db = createDb(':memory:')
    seed(db, 3)
    let active = 0
    let maxActive = 0
    const done: Promise<void>[] = []
    const queue = new RunQueue(db, { maxConcurrentRuns: 5 }, (runId) => {
      active++
      maxActive = Math.max(maxActive, active)
      const p = new Promise<void>((resolve) =>
        setTimeout(() => {
          db.update(runs).set({ status: 'succeeded' }).where(eq(runs.id, runId)).run()
          active--
          resolve()
        }, 10),
      )
      done.push(p)
      return p
    })
    queue.tick()
    expect(queue.active).toBe(1)
    await new Promise((r) => setTimeout(r, 100))
    expect(maxActive).toBe(1)
  })

  it('starts nothing when the global cap is reached', () => {
    const db = createDb(':memory:')
    seed(db, 2)
    const started: number[] = []
    const queue = new RunQueue(db, { maxConcurrentRuns: 0 }, async (runId) => {
      started.push(runId)
    })
    queue.tick()
    expect(started).toHaveLength(0)
  })
})
