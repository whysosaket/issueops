import type { EventEmitter } from 'node:events'
import type { ActivityItem, ActivityKind } from '@issueops/shared'
import { lt, sql } from 'drizzle-orm'
import type { Db } from './db'
import { activity } from './db/schema'

export const ACTIVITY_EVENT = 'activity'
const KEEP_ROWS = 2000

/** Append a structured event to the activity feed and notify live listeners. */
export function record(
  db: Db,
  events: EventEmitter,
  kind: ActivityKind,
  message: string,
  refs: { repoId?: number; runId?: number } = {},
): ActivityItem {
  const row = db
    .insert(activity)
    .values({
      kind,
      message,
      repoId: refs.repoId ?? null,
      runId: refs.runId ?? null,
      createdAt: new Date().toISOString(),
    })
    .returning()
    .get()
  if (row.id % 100 === 0) {
    db.delete(activity)
      .where(lt(activity.id, sql`(SELECT max(id) FROM activity) - ${KEEP_ROWS}`))
      .run()
  }
  const item = row as ActivityItem
  events.emit(ACTIVITY_EVENT, item)
  return item
}
