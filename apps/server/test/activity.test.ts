import { EventEmitter } from 'node:events'
import type { ActivityItem } from '@issueops/shared'
import { describe, expect, it } from 'vitest'
import { ACTIVITY_EVENT, record } from '../src/activity'
import { createDb } from '../src/db'
import { activity } from '../src/db/schema'

describe('activity feed', () => {
  it('records, emits, and returns the item', () => {
    const db = createDb(':memory:')
    const events = new EventEmitter()
    const emitted: ActivityItem[] = []
    events.on(ACTIVITY_EVENT, (item: ActivityItem) => emitted.push(item))

    const item = record(db, events, 'poll', 'polled acme/demo', { repoId: 7 })

    expect(item.kind).toBe('poll')
    expect(item.repoId).toBe(7)
    expect(item.runId).toBeNull()
    expect(emitted).toEqual([item])
    expect(db.select().from(activity).all()).toHaveLength(1)
  })

  it('prunes old rows so the table stays bounded', () => {
    const db = createDb(':memory:')
    const events = new EventEmitter()
    for (let i = 0; i < 2100; i++) record(db, events, 'skip', `event ${i}`)
    const rows = db.select().from(activity).all()
    expect(rows.length).toBeLessThanOrEqual(2001)
    expect(rows[0]?.id).toBeGreaterThan(99)
  })
})
