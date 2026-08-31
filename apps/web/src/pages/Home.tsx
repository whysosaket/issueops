import { AUTONOMY_LABELS } from '@issueops/shared'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAddRepo, useHealth, useRepos, useRuns } from '../api'
import { Button, Card, PageTitle, StatusBadge, timeAgo } from '../components'

function AddRepoForm() {
  const [path, setPath] = useState('')
  const addRepo = useAddRepo()
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!path.trim()) return
        addRepo.mutate({ path: path.trim() }, { onSuccess: () => setPath('') })
      }}
    >
      <input
        value={path}
        onChange={(e) => setPath(e.target.value)}
        placeholder="/absolute/path/to/local/repo"
        className="w-96 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
      />
      <Button type="submit" disabled={addRepo.isPending}>
        {addRepo.isPending ? 'Connecting…' : 'Connect repo'}
      </Button>
      {addRepo.isError && (
        <span className="self-center text-sm text-red-400">{addRepo.error.message}</span>
      )}
    </form>
  )
}

export default function Home() {
  const { data: health } = useHealth()
  const { data: repos } = useRepos()
  const { data: runs } = useRuns()

  return (
    <div className="space-y-8">
      <section>
        <PageTitle>Repositories</PageTitle>
        <div className="mb-4">
          <AddRepoForm />
        </div>
        {repos?.length === 0 && (
          <Card className="text-sm text-zinc-400">
            No repositories connected yet. Point issueops at a local clone that has a GitHub origin
            remote — it will start watching its issues.
          </Card>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {repos?.map((repo) => (
            <Link key={repo.id} to={`/repos/${repo.id}`}>
              <Card className="transition-colors hover:border-zinc-600">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-100">
                    {repo.owner}/{repo.name}
                  </span>
                  <span
                    className={`text-xs ${repo.enabled ? 'text-emerald-400' : 'text-zinc-500'}`}
                  >
                    {repo.enabled ? 'active' : 'paused'}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                  <span>{AUTONOMY_LABELS[repo.autonomy]}</span>
                  <span>every {repo.intervalMinutes}m</span>
                  <span>
                    label: {repo.watchLabel ? <code>{repo.watchLabel}</code> : 'all issues'}
                  </span>
                  <span>last poll {timeAgo(repo.lastPolledAt)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <PageTitle>Recent runs</PageTitle>
        {health && (
          <p className="mb-3 text-sm text-zinc-400">
            {health.activeRuns} active · {health.queuedRuns} queued
          </p>
        )}
        <Card className="p-0">
          <table className="w-full text-sm">
            <tbody>
              {runs?.map((run) => (
                <tr key={run.id} className="border-b border-zinc-800/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link to={`/runs/${run.id}`} className="text-zinc-100 hover:text-indigo-400">
                      #{run.issueNumber} {run.issueTitle}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-500">{run.repoName}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-zinc-500">
                    {timeAgo(run.queuedAt)}
                  </td>
                  <td className="w-28 px-4 py-2.5 text-right">
                    <StatusBadge status={run.status} />
                  </td>
                </tr>
              ))}
              {runs?.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500">No runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
