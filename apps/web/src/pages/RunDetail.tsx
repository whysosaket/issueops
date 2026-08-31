import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useCancelRun, useRun } from '../api'
import { Button, Card, duration, PageTitle, StatusBadge } from '../components'

interface ContentBlock {
  type: string
  text?: string
  name?: string
  input?: unknown
  content?: unknown
}

interface StreamEvent {
  type: string
  subtype?: string
  model?: string
  total_cost_usd?: number
  result?: string
  message?: { content?: ContentBlock[] | string }
}

function ToolUse({ block }: { block: ContentBlock }) {
  const preview = JSON.stringify(block.input ?? {})
  return (
    <div className="my-1 rounded-lg bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-400">
      <span className="text-amber-400">⚒ {block.name}</span>{' '}
      {preview.length > 160 ? `${preview.slice(0, 160)}…` : preview}
    </div>
  )
}

function EventView({ event }: { event: StreamEvent }) {
  if (event.type === 'system' && event.subtype === 'init') {
    return (
      <div className="my-2 text-xs text-zinc-500">
        session started{event.model ? ` · ${event.model}` : ''}
      </div>
    )
  }
  if (event.type === 'assistant') {
    const content = event.message?.content
    if (!Array.isArray(content)) return null
    return (
      <div>
        {content.map((block, i) => {
          if (block.type === 'text' && block.text?.trim()) {
            return (
              <p
                key={`t${i.toString()}`}
                className="my-2 whitespace-pre-wrap text-sm text-zinc-200"
              >
                {block.text}
              </p>
            )
          }
          if (block.type === 'tool_use') return <ToolUse key={`u${i.toString()}`} block={block} />
          return null
        })}
      </div>
    )
  }
  if (event.type === 'result') {
    return (
      <div className="my-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm">
        <div className="mb-1 text-xs font-semibold uppercase text-zinc-500">
          result · {event.subtype}
          {event.total_cost_usd != null && ` · $${event.total_cost_usd.toFixed(2)}`}
        </div>
        <p className="whitespace-pre-wrap text-zinc-300">{event.result}</p>
      </div>
    )
  }
  return null
}

function Transcript({ runId, live }: { runId: number; live: boolean }) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEvents([])
    const source = new EventSource(`/api/runs/${runId}/events`)
    source.addEventListener('line', (e) => {
      try {
        setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data) as StreamEvent])
      } catch {
        // ignore malformed lines
      }
    })
    source.addEventListener('status', () => source.close())
    source.onerror = () => source.close()
    return () => source.close()
  }, [runId])

  useEffect(() => {
    if (live) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [live])

  return (
    <Card>
      {events.length === 0 && <p className="text-sm text-zinc-500">No transcript yet.</p>}
      {events.map((event, i) => (
        <EventView key={i.toString()} event={event} />
      ))}
      <div ref={bottomRef} />
    </Card>
  )
}

export default function RunDetail() {
  const params = useParams()
  const runId = Number(params.id)
  const { data: run } = useRun(runId)
  const cancel = useCancelRun()

  if (!run) return <p className="text-zinc-500">Loading…</p>
  const active = run.status === 'queued' || run.status === 'running'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>
          Run {run.id} · #{run.issueNumber} {run.issueTitle}
        </PageTitle>
        {active && (
          <Button variant="danger" disabled={cancel.isPending} onClick={() => cancel.mutate(runId)}>
            Cancel run
          </Button>
        )}
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-400">
          <StatusBadge status={run.status} />
          <span>{run.repoName}</span>
          <a href={run.issueUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-400">
            view issue ↗
          </a>
          {run.prUrl && (
            <a href={run.prUrl} target="_blank" rel="noreferrer" className="text-indigo-400">
              pull request ↗
            </a>
          )}
          <span>duration {duration(run.startedAt, run.finishedAt)}</span>
          {run.costUsd != null && <span>cost ${run.costUsd.toFixed(2)}</span>}
          {run.sessionId && <span className="font-mono text-xs">session {run.sessionId}</span>}
        </div>
        {run.error && <p className="mt-2 text-sm text-red-400">{run.error}</p>}
        {run.resultSummary && !run.error && (
          <p className="mt-2 text-sm text-zinc-300">{run.resultSummary}</p>
        )}
      </Card>
      <Transcript runId={runId} live={active} />
    </div>
  )
}
