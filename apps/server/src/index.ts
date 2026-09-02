import { EventEmitter } from 'node:events'
import { serve } from '@hono/node-server'
import { ensureAppDirs, loadConfig, paths } from '@issueops/shared/node'
import { eq } from 'drizzle-orm'
import pkg from '../package.json'
import { record } from './activity'
import { createApi } from './api'
import type { AppContext } from './context'
import { createDb } from './db'
import { runs } from './db/schema'
import { GitHubService } from './github'
import { log } from './logger'
import { RunQueue } from './queue'
import { activeRunIds, cancelRun, executeRun, type RunnerDeps } from './runner'
import { startScheduler } from './scheduler'
import { registerStatic, resolveWebDist } from './static'

function main(): void {
  ensureAppDirs()
  const config = loadConfig()
  const db = createDb(paths.dbFile())

  db.update(runs)
    .set({
      status: 'interrupted',
      error: 'daemon restarted while run was active',
      finishedAt: new Date().toISOString(),
    })
    .where(eq(runs.status, 'running'))
    .run()

  const events = new EventEmitter()
  events.setMaxListeners(200)
  const github = new GitHubService(config.githubToken)
  const runnerDeps: RunnerDeps = {
    db,
    config,
    events,
    github,
    skillsMountDir: paths.skillsMountDir(),
  }
  const queue = new RunQueue(db, config, (runId) => executeRun(runnerDeps, runId))
  const ctx: AppContext = {
    db,
    config,
    github,
    events,
    queue,
    version: pkg.version,
    startedAt: Date.now(),
  }

  const app = createApi(ctx)
  const webDist = resolveWebDist()
  if (webDist) registerStatic(app, webDist)
  else log.warn('web dashboard assets not found; API only')

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    log.info(`issueops daemon v${pkg.version} listening on http://${config.host}:${info.port}`)
    record(db, events, 'daemon', `daemon v${pkg.version} started`)
  })
  const stopScheduler = startScheduler(ctx)
  queue.tick()

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutting down')
    stopScheduler()
    const active = activeRunIds()
    for (const id of active) cancelRun(id)
    if (active.length) await new Promise((resolve) => setTimeout(resolve, 3_000))
    db.update(runs)
      .set({
        status: 'interrupted',
        error: 'daemon stopped while run was active',
        finishedAt: new Date().toISOString(),
      })
      .where(eq(runs.status, 'running'))
      .run()
    server.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main()
