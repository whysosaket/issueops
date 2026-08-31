import { useState } from 'react'
import { useSaveSettings, useSettings } from '../api'
import { Button, Card, PageTitle } from '../components'

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
    <div className="max-w-lg space-y-4">
      <PageTitle>Settings</PageTitle>
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
