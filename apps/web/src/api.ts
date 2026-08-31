import type { Health, Issue, Repo, RepoUpdate, Run, RunListItem } from '@issueops/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

export type IssueWithRun = Issue & {
  latestRunId: number | null
  latestRunStatus: string | null
}
export type RunDetail = Run & { repoName: string; issueTitle: string; issueUrl: string }

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: () => request<Health>('/api/health'),
    refetchInterval: 5000,
    retry: false,
  })

export const useRepos = () =>
  useQuery({ queryKey: ['repos'], queryFn: () => request<Repo[]>('/api/repos') })

export const useIssues = (repoId: number) =>
  useQuery({
    queryKey: ['issues', repoId],
    queryFn: () => request<IssueWithRun[]>(`/api/repos/${repoId}/issues`),
    refetchInterval: 10000,
  })

export const useRuns = (repoId?: number) =>
  useQuery({
    queryKey: ['runs', repoId ?? 'all'],
    queryFn: () => request<RunListItem[]>(`/api/runs${repoId ? `?repoId=${repoId}` : ''}`),
    refetchInterval: 5000,
  })

export const useRun = (id: number) =>
  useQuery({
    queryKey: ['run', id],
    queryFn: () => request<RunDetail>(`/api/runs/${id}`),
    refetchInterval: 3000,
  })

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: () => request<Record<string, unknown>>('/api/settings'),
  })

function useInvalidatingMutation<TArgs, TResult>(
  keys: string[][],
  fn: (args: TArgs) => Promise<TResult>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of keys) qc.invalidateQueries({ queryKey: key })
    },
  })
}

export const useAddRepo = () =>
  useInvalidatingMutation([['repos']], (body: { path: string }) =>
    request<Repo>('/api/repos', { method: 'POST', body: JSON.stringify(body) }),
  )

export const useUpdateRepo = (id: number) =>
  useInvalidatingMutation([['repos']], (body: RepoUpdate) =>
    request<Repo>(`/api/repos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  )

export const useDeleteRepo = () =>
  useInvalidatingMutation([['repos'], ['runs']], (id: number) =>
    request<{ ok: true }>(`/api/repos/${id}`, { method: 'DELETE' }),
  )

export const usePollNow = (repoId: number) =>
  useInvalidatingMutation([['issues'], ['runs']], () =>
    request<{ discovered: number; enqueued: number }>(`/api/repos/${repoId}/poll`, {
      method: 'POST',
      body: '{}',
    }),
  )

export const useDispatchIssue = () =>
  useInvalidatingMutation([['runs'], ['issues']], (issueId: number) =>
    request<{ runId: number }>(`/api/issues/${issueId}/dispatch`, { method: 'POST', body: '{}' }),
  )

export const useCancelRun = () =>
  useInvalidatingMutation([['runs'], ['run']], (runId: number) =>
    request<{ ok: true }>(`/api/runs/${runId}/cancel`, { method: 'POST', body: '{}' }),
  )

export const useSaveSettings = () =>
  useInvalidatingMutation([['settings']], (body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )
