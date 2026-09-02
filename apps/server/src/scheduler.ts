import { eq } from 'drizzle-orm'
import { record } from './activity'
import type { AppContext } from './context'
import { repos } from './db/schema'
import { log } from './logger'
import { pollRepo } from './poller'

export function startScheduler(ctx: AppContext): () => void {
  const tick = async () => {
    const enabled = ctx.db.select().from(repos).where(eq(repos.enabled, true)).all()
    for (const repo of enabled) {
      const due =
        !repo.lastPolledAt ||
        Date.now() - Date.parse(repo.lastPolledAt) >= repo.intervalMinutes * 60_000
      if (!due) continue
      try {
        const result = await pollRepo(ctx, repo.id)
        log.info(`polled ${repo.owner}/${repo.name}`, result)
      } catch (err) {
        log.error(`poll failed for ${repo.owner}/${repo.name}`, err)
        record(
          ctx.db,
          ctx.events,
          'error',
          `poll failed for ${repo.owner}/${repo.name}: ${err instanceof Error ? err.message : err}`,
          { repoId: repo.id },
        )
      }
    }
    ctx.queue.tick()
  }
  const initial = setTimeout(tick, 3_000)
  const interval = setInterval(tick, 60_000)
  return () => {
    clearTimeout(initial)
    clearInterval(interval)
  }
}
