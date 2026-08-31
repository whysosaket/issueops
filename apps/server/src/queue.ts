import { asc, eq } from 'drizzle-orm'
import type { Db } from './db'
import { repos, runs } from './db/schema'
import { log } from './logger'

/**
 * In-process run queue. Runs are persisted as `queued` rows; tick() starts as
 * many as the global and per-repo concurrency caps allow.
 */
export class RunQueue {
  private activeByRepo = new Map<number, number>()
  private activeTotal = 0

  constructor(
    private db: Db,
    private config: { maxConcurrentRuns: number },
    private execute: (runId: number) => Promise<void>,
  ) {}

  get active(): number {
    return this.activeTotal
  }

  tick(): void {
    if (this.activeTotal >= this.config.maxConcurrentRuns) return
    const queued = this.db
      .select({ id: runs.id, repoId: runs.repoId, repoConcurrency: repos.concurrency })
      .from(runs)
      .innerJoin(repos, eq(runs.repoId, repos.id))
      .where(eq(runs.status, 'queued'))
      .orderBy(asc(runs.queuedAt))
      .all()
    for (const run of queued) {
      if (this.activeTotal >= this.config.maxConcurrentRuns) break
      if ((this.activeByRepo.get(run.repoId) ?? 0) >= run.repoConcurrency) continue
      this.start(run.id, run.repoId)
    }
  }

  private start(runId: number, repoId: number): void {
    this.activeTotal++
    this.activeByRepo.set(repoId, (this.activeByRepo.get(repoId) ?? 0) + 1)
    this.execute(runId)
      .catch((err) => log.error(`run ${runId} crashed`, err))
      .finally(() => {
        this.activeTotal--
        const left = (this.activeByRepo.get(repoId) ?? 1) - 1
        if (left <= 0) this.activeByRepo.delete(repoId)
        else this.activeByRepo.set(repoId, left)
        this.tick()
      })
  }
}
