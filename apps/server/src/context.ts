import type { EventEmitter } from 'node:events'
import type { GlobalConfig } from '@issueops/shared'
import type { Db } from './db'
import type { GitHubService } from './github'
import type { RunQueue } from './queue'

export interface AppContext {
  db: Db
  config: GlobalConfig
  github: GitHubService
  events: EventEmitter
  queue: RunQueue
  version: string
  startedAt: number
}
