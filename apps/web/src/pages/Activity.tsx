import type { ActivityItem, ActivityKind } from '@issueops/shared'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, PageTitle, timeAgo } from '../components'

const KIND_STYLES: Record<ActivityKind, string> = {
  daemon: 'bg-indigo-500/15 text-indigo-300',
  poll: 'bg-sky-500/15 text-sky-300',
  skip: 'bg-zinc-800 text-zinc-400',
  run: 'bg-emerald-500/15 text-emerald-300',
  repo: 'bg-violet-500/15 text-violet-300',
  error: 'bg-red-500/15 text-red-400',
}

function useActivityFeed(): { items: ActivityItem[]; live: boolean } {
  const [items, setItems] = useState<ActivityItem[]>([])
  const [live, setLive] = useState(false)

  useEffect(() => {
    const source = new EventSource('/api/activity/stream')
    source.addEventListener('item', (e) => {
      try {
        const item = JSON.parse((e as MessageEvent).data) as ActivityItem
        setItems((prev) =>
          (prev.some((x) => x.id === item.id) ? prev : [item, ...prev]).slice(0, 300),
        )
        setLive(true)
      } catch {
        // ignore malformed events
      }
    })
    source.onopen = () => setLive(true)
    source.onerror = () => setLive(false)
    return () => source.close()
  }, [])

  return { items, live }
}

export default function Activity() {
  const { items, live } = useActivityFeed()
  const [filter, setFilter] = useState<ActivityKind | null>(null)
  const kinds = Object.keys(KIND_STYLES) as ActivityKind[]
  const visible = filter ? items.filter((i) => i.kind === filter) : items

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Activity</PageTitle>
        <span className="flex items-center gap-2 text-xs text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-400' : 'bg-red-500'}`}
          />
          {live ? 'live' : 'reconnecting…'}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter(null)}
          className={`rounded-full px-2.5 py-0.5 text-xs ${filter === null ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
        >
          all
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setFilter(filter === kind ? null : kind)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${filter === kind ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'}`}
          >
            {kind}
          </button>
        ))}
      </div>
      <Card className="p-0">
        {visible.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            Nothing yet — polls, discovered issues, skip reasons, and run lifecycle events land here
            as they happen.
          </p>
        )}
        <ul>
          {visible.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 border-b border-zinc-800/60 px-4 py-2 text-sm last:border-0"
            >
              <span
                className={`mt-0.5 w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium ${KIND_STYLES[item.kind] ?? 'bg-zinc-800 text-zinc-400'}`}
              >
                {item.kind}
              </span>
              <span className="min-w-0 flex-1 break-words text-zinc-300">
                {item.runId ? (
                  <Link to={`/runs/${item.runId}`} className="hover:text-indigo-400">
                    {item.message}
                  </Link>
                ) : (
                  item.message
                )}
              </span>
              <span className="shrink-0 text-xs text-zinc-600" title={item.createdAt}>
                {timeAgo(item.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
