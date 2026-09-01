import { AUTONOMY_LABELS, AUTONOMY_LEVELS, type Autonomy, type RepoUpdate } from '@issueops/shared'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useDeleteRepo,
  useDispatchIssue,
  useIssues,
  usePollNow,
  useRepos,
  useSkills,
  useUpdateRepo,
} from '../api'
import { Button, Card, PageTitle, StatusBadge } from '../components'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as children
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  )
}

function RepoSettings({ repoId }: { repoId: number }) {
  const { data: repos } = useRepos()
  const { data: librarySkills } = useSkills()
  const repo = repos?.find((r) => r.id === repoId)
  const update = useUpdateRepo(repoId)
  const [form, setForm] = useState<RepoUpdate | null>(null)
  if (!repo) return null
  const value = {
    watchLabel: repo.watchLabel,
    allowedAuthors: repo.allowedAuthors,
    intervalMinutes: repo.intervalMinutes,
    autonomy: repo.autonomy,
    concurrency: repo.concurrency,
    testCommand: repo.testCommand,
    maxTurns: repo.maxTurns,
    maxBudgetUsd: repo.maxBudgetUsd,
    guardrails: repo.guardrails,
    instructions: repo.instructions,
    contextFiles: repo.contextFiles,
    skills: repo.skills,
    enabled: repo.enabled,
    ...form,
  }
  const set = (patch: RepoUpdate) => setForm({ ...value, ...patch })
  return (
    <Card>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Watch label (empty = all issues)">
          <input
            className={inputClass}
            value={value.watchLabel ?? ''}
            onChange={(e) => set({ watchLabel: e.target.value })}
          />
        </Field>
        <Field label="Allowed authors (comma-separated, empty = anyone)">
          <input
            className={inputClass}
            value={(value.allowedAuthors ?? []).join(', ')}
            placeholder="alice, bob"
            onChange={(e) =>
              set({
                allowedAuthors: e.target.value
                  .split(',')
                  .map((author) => author.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
        <Field label="Poll interval (minutes)">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={value.intervalMinutes}
            onChange={(e) => set({ intervalMinutes: Number(e.target.value) })}
          />
        </Field>
        <Field label="Autonomy">
          <select
            className={inputClass}
            value={value.autonomy}
            onChange={(e) => set({ autonomy: e.target.value as Autonomy })}
          >
            {AUTONOMY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {AUTONOMY_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Test command (optional)">
          <input
            className={inputClass}
            value={value.testCommand ?? ''}
            placeholder="pnpm test"
            onChange={(e) => set({ testCommand: e.target.value || null })}
          />
        </Field>
        <Field label="Max turns per run">
          <input
            type="number"
            min={1}
            className={inputClass}
            value={value.maxTurns}
            onChange={(e) => set({ maxTurns: Number(e.target.value) })}
          />
        </Field>
        <Field label="Budget cap (USD, optional)">
          <input
            type="number"
            min={0}
            step="0.5"
            className={inputClass}
            value={value.maxBudgetUsd ?? ''}
            onChange={(e) => set({ maxBudgetUsd: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label="Concurrency">
          <input
            type="number"
            min={1}
            max={4}
            className={inputClass}
            value={value.concurrency}
            onChange={(e) => set({ concurrency: Number(e.target.value) })}
          />
        </Field>
        <Field label="Enabled">
          <select
            className={inputClass}
            value={value.enabled ? 'yes' : 'no'}
            onChange={(e) => set({ enabled: e.target.value === 'yes' })}
          >
            <option value="yes">watching</option>
            <option value="no">paused</option>
          </select>
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Repository guardrails (binding policy, injected into every run)">
          <textarea
            className={`${inputClass} h-24 resize-y font-mono text-xs`}
            value={value.guardrails ?? ''}
            placeholder={'- Never touch infra/\n- All DB changes need a migration file'}
            onChange={(e) => set({ guardrails: e.target.value })}
          />
        </Field>
        <Field label="Special instructions (maintainer preferences, injected into every run)">
          <textarea
            className={`${inputClass} h-24 resize-y font-mono text-xs`}
            value={value.instructions ?? ''}
            placeholder={'Use conventional commits.\nPrefer small PRs.'}
            onChange={(e) => set({ instructions: e.target.value })}
          />
        </Field>
        <Field label="Context files (repo-relative paths runs must read first, comma-separated)">
          <input
            className={inputClass}
            value={(value.contextFiles ?? []).join(', ')}
            placeholder="docs/ARCHITECTURE.md, CONTRIBUTING.md"
            onChange={(e) =>
              set({
                contextFiles: e.target.value
                  .split(',')
                  .map((p) => p.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Attached skills">
          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={(value.skills ?? []).length === 0}
                onChange={(e) =>
                  set({
                    skills: e.target.checked ? [] : (librarySkills?.map((s) => s.name) ?? []),
                  })
                }
              />
              Whole library (default) — every shipped and custom skill mounts into this repo's runs
            </label>
            {(value.skills ?? []).length > 0 && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-3">
                  {librarySkills?.map((skill) => {
                    const selected = value.skills ?? []
                    return (
                      <label
                        key={skill.name}
                        className="flex items-center gap-2 text-xs text-zinc-300"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(skill.name)}
                          onChange={(e) =>
                            set({
                              skills: e.target.checked
                                ? [...selected, skill.name]
                                : selected.filter((name) => name !== skill.name),
                            })
                          }
                        />
                        <span className="font-mono">{skill.name}</span>
                        {skill.shipped && (
                          <span className="text-[10px] text-indigo-300">shipped</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  Only the checked skills mount into this repo's runs. Deselecting every skill
                  re-attaches the whole library.
                </p>
              </>
            )}
          </div>
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={!form || update.isPending}
          onClick={() => form && update.mutate(form, { onSuccess: () => setForm(null) })}
        >
          Save settings
        </Button>
        {update.isError && <span className="text-sm text-red-400">{update.error.message}</span>}
        {update.isSuccess && !form && <span className="text-sm text-emerald-400">Saved.</span>}
      </div>
    </Card>
  )
}

export default function RepoDetail() {
  const params = useParams()
  const repoId = Number(params.id)
  const navigate = useNavigate()
  const { data: repos } = useRepos()
  const repo = repos?.find((r) => r.id === repoId)
  const { data: issues } = useIssues(repoId)
  const pollNow = usePollNow(repoId)
  const dispatch = useDispatchIssue()
  const deleteRepo = useDeleteRepo()

  if (!repo) return <p className="text-zinc-500">Repository not found.</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageTitle>
          {repo.owner}/{repo.name}
        </PageTitle>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={pollNow.isPending} onClick={() => pollNow.mutate()}>
            {pollNow.isPending ? 'Polling…' : 'Poll now'}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm(`Disconnect ${repo.owner}/${repo.name}? Run history will be deleted.`)) {
                deleteRepo.mutate(repoId, { onSuccess: () => navigate('/') })
              }
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>
      {pollNow.isSuccess && (
        <p className="text-sm text-zinc-400">
          Poll finished: {pollNow.data.discovered} issues seen, {pollNow.data.enqueued} enqueued.
        </p>
      )}
      {pollNow.isError && <p className="text-sm text-red-400">{pollNow.error.message}</p>}

      <RepoSettings repoId={repoId} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Issues</h2>
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {issues?.map((issue) => (
                <tr key={issue.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-100 hover:text-indigo-400"
                    >
                      #{issue.number} {issue.title}
                    </a>
                    <div className="mt-1 flex gap-1">
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="w-32 px-4 py-2.5 text-right">
                    {issue.latestRunId ? (
                      <Link to={`/runs/${issue.latestRunId}`}>
                        <StatusBadge status={issue.latestRunStatus ?? 'unknown'} />
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-600">no runs</span>
                    )}
                  </td>
                  <td className="w-28 px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      disabled={
                        dispatch.isPending ||
                        issue.latestRunStatus === 'queued' ||
                        issue.latestRunStatus === 'running'
                      }
                      onClick={() => dispatch.mutate(issue.id)}
                    >
                      Dispatch
                    </Button>
                  </td>
                </tr>
              ))}
              {issues?.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500">
                    No issues mirrored yet — hit “Poll now”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        {dispatch.isError && <p className="mt-2 text-sm text-red-400">{dispatch.error.message}</p>}
      </section>
    </div>
  )
}
