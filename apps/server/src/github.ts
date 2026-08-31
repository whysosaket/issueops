import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { STATE_LABEL_PREFIX, STATE_LABELS, type StateLabel } from '@issueops/shared'
import { Octokit } from '@octokit/rest'
import { log } from './logger'

const execFileAsync = promisify(execFile)

const LABEL_DEFS: { name: string; color: string; description: string }[] = [
  { name: 'issueops', color: '6f42c1', description: 'Hand this issue to issueops' },
  { name: STATE_LABELS.inProgress, color: 'fbca04', description: 'issueops is working on this' },
  { name: STATE_LABELS.planned, color: '0e8a16', description: 'issueops posted a plan' },
  { name: STATE_LABELS.done, color: '0e8a16', description: 'issueops finished this issue' },
  { name: STATE_LABELS.failed, color: 'd73a4a', description: 'issueops could not handle this' },
  { name: STATE_LABELS.needsInfo, color: 'd876e3', description: 'issueops needs more detail' },
]

export interface RemoteIssue {
  number: number
  title: string
  body: string | null
  author: string | null
  state: string
  labels: string[]
  url: string
  updatedAt: string
  isPullRequest: boolean
}

export class GitHubService {
  private octokit: Octokit | null = null

  constructor(private explicitToken?: string) {}

  private async client(): Promise<Octokit> {
    if (!this.octokit) {
      let token = this.explicitToken
      if (!token) {
        const { stdout } = await execFileAsync('gh', ['auth', 'token'])
        token = stdout.trim()
      }
      this.octokit = new Octokit({ auth: token })
    }
    return this.octokit
  }

  /** Drop the cached client so the next call re-resolves the token. */
  invalidate(): void {
    this.octokit = null
  }

  async listOpenIssues(
    owner: string,
    repo: string,
    opts: { label?: string; since?: string },
  ): Promise<RemoteIssue[]> {
    const gh = await this.client()
    const issues = await gh.paginate(gh.issues.listForRepo, {
      owner,
      repo,
      state: 'open',
      labels: opts.label,
      since: opts.since,
      per_page: 100,
    })
    return issues.map((i) => ({
      number: i.number,
      title: i.title,
      body: i.body ?? null,
      author: i.user?.login ?? null,
      state: i.state,
      labels: i.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
      url: i.html_url,
      updatedAt: i.updated_at,
      isPullRequest: i.pull_request !== undefined,
    }))
  }

  async listComments(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<{ author: string; body: string }[]> {
    const gh = await this.client()
    const { data } = await gh.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 30,
    })
    return data.map((c) => ({ author: c.user?.login ?? 'unknown', body: c.body ?? '' }))
  }

  async ensureLabels(owner: string, repo: string): Promise<void> {
    const gh = await this.client()
    for (const label of LABEL_DEFS) {
      try {
        await gh.issues.createLabel({ owner, repo, ...label })
      } catch (err) {
        if ((err as { status?: number }).status !== 422) throw err
      }
    }
  }

  /** Replace any issueops:* label on the issue with the given one (null clears them all). */
  async setStateLabel(
    owner: string,
    repo: string,
    issueNumber: number,
    label: StateLabel | null,
  ): Promise<void> {
    const gh = await this.client()
    const { data } = await gh.issues.get({ owner, repo, issue_number: issueNumber })
    const current = data.labels
      .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
      .filter((name) => name.startsWith(STATE_LABEL_PREFIX) && name !== label)
    for (const name of current) {
      await gh.issues
        .removeLabel({ owner, repo, issue_number: issueNumber, name })
        .catch(() => undefined)
    }
    if (label) {
      await gh.issues.addLabels({ owner, repo, issue_number: issueNumber, labels: [label] })
    }
  }

  async comment(owner: string, repo: string, issueNumber: number, body: string): Promise<void> {
    const gh = await this.client()
    await gh.issues.createComment({ owner, repo, issue_number: issueNumber, body })
  }
}

export async function detectGitHubRemote(
  repoPath: string,
): Promise<{ owner: string; name: string }> {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'])
  const url = stdout.trim()
  const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (!match?.[1] || !match[2]) {
    throw new Error(`origin remote is not a GitHub repository: ${url}`)
  }
  return { owner: match[1], name: match[2] }
}

/** Fire-and-forget wrapper for GitHub side effects that must not break a run. */
export async function bestEffort(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    log.warn(`github side effect failed: ${label}`, err)
  }
}
