import { useState } from 'react'
import { useGuardrails, useSaveGuardrails, useSaveSettings, useSettings } from '../api'
import { Button, Card, PageTitle } from '../components'

function GlobalGuardrails() {
  const { data } = useGuardrails()
  const save = useSaveGuardrails()
  const [draft, setDraft] = useState<string | null>(null)
  if (!data) return null
  const content = draft ?? data.content
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-zinc-200">Global guardrails</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Binding policy injected into every run across all repositories (~/.issueops/guardrails.md).
      </p>
      <textarea
        value={content}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="h-56 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:border-indigo-500 focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          disabled={draft === null || save.isPending}
          onClick={() => save.mutate(content, { onSuccess: () => setDraft(null) })}
        >
          Save guardrails
        </Button>
        {save.isError && <span className="text-sm text-red-400">{save.error.message}</span>}
        {save.isSuccess && draft === null && (
          <span className="text-sm text-emerald-400">Saved — applies to the next run.</span>
        )}
      </div>
    </Card>
  )
}

const FIELDS = [
  { key: 'host', label: 'Bind host', type: 'text' },
  { key: 'port', label: 'Port', type: 'number' },
  { key: 'maxConcurrentRuns', label: 'Max concurrent runs', type: 'number' },
  { key: 'runTimeoutMinutes', label: 'Run timeout (minutes)', type: 'number' },
  { key: 'claudeBin', label: 'Claude binary', type: 'text' },
  { key: 'githubToken', label: 'GitHub token (blank = use gh CLI)', type: 'text' },
] as const

export default function Settings() {
  const { data: settings } = useSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState<Record<string, unknown> | null>(null)
  if (!settings) return <p className="text-zinc-500">Loading…</p>
  const value = { ...settings, ...form }

  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle>Settings</PageTitle>
      <GlobalGuardrails />
      <Card>
        <div className="space-y-4">
          {FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-zinc-400">{field.label}</span>
              <input
                type={field.type}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                value={String(value[field.key] ?? '')}
                onChange={(e) =>
                  setForm({
                    ...value,
                    [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value,
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button
            disabled={!form || save.isPending}
            onClick={() => {
              if (!form) return
              const body = { ...form }
              if (!body.githubToken) delete body.githubToken
              save.mutate(body, { onSuccess: () => setForm(null) })
            }}
          >
            Save
          </Button>
          {save.isError && <span className="text-sm text-red-400">{save.error.message}</span>}
          {save.isSuccess && !form && (
            <span className="text-sm text-emerald-400">
              Saved.{' '}
              {(save.data as { restartNeeded?: boolean }).restartNeeded &&
                'Restart the daemon (issueops restart) for host/port changes.'}
            </span>
          )}
        </div>
      </Card>
      <p className="text-xs text-zinc-500">
        More checks: run <code className="text-zinc-400">issueops doctor</code> in your terminal.
      </p>
    </div>
  )
}
