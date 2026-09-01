import { type ChildProcess, spawn } from 'node:child_process'
import type { EventEmitter } from 'node:events'
import readline from 'node:readline'
import {
  type Autonomy,
  type GlobalConfig,
  parseResultLine,
  type RunStatus,
  runMarker,
  STATE_LABELS,
  type StateLabel,
} from '@issueops/shared'
import { eq } from 'drizzle-orm'
import type { Db } from './db'
import { issues, repos, runEvents, runs } from './db/schema'
import { bestEffort, type GitHubService } from './github'
import { log } from './logger'
import { buildPrompt, buildSystemContract, type RunSpec } from './prompt'
import { buildRepoSkillsMount, readGlobalGuardrails } from './skills'

export interface RunnerDeps {
  db: Db
  config: GlobalConfig
  events: EventEmitter
  github?: GitHubService
  skillsMountDir: string
}

const children = new Map<number, ChildProcess>()
const cancelRequests = new Set<number>()

export function activeRunIds(): number[] {
  return [...children.keys()]
}

export function cancelRun(runId: number): boolean {
  const child = children.get(runId)
  if (!child) return false
  cancelRequests.add(runId)
  child.kill('SIGINT')
  setTimeout(() => {
    if (children.has(runId)) child.kill('SIGKILL')
  }, 10_000).unref()
  return true
}

interface RepoRow {
  maxTurns: number
  maxBudgetUsd: number | null
  testCommand: string | null
}

export function buildClaudeArgs(
  repo: RepoRow,
  systemContract: string,
  skillsMountDir: string,
): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--add-dir',
    skillsMountDir,
    '--append-system-prompt',
    systemContract,
    '--permission-mode',
    'acceptEdits',
    '--max-turns',
    String(repo.maxTurns),
  ]
  if (repo.maxBudgetUsd != null) args.push('--max-budget-usd', String(repo.maxBudgetUsd))
  const allowed = ['Bash(git:*)', 'Bash(gh:*)']
  if (repo.testCommand) allowed.push(`Bash(${repo.testCommand})`, `Bash(${repo.testCommand}:*)`)
  args.push('--allowedTools', allowed.join(','))
  return args
}

function finalStateLabel(resultStatus: string | undefined): StateLabel {
  if (resultStatus === 'planned') return STATE_LABELS.planned
  if (resultStatus === 'needs-info') return STATE_LABELS.needsInfo
  return STATE_LABELS.done
}

export async function executeRun(deps: RunnerDeps, runId: number): Promise<void> {
  const { db, events, github } = deps
  const run = db.select().from(runs).where(eq(runs.id, runId)).get()
  if (run?.status !== 'queued') return
  const repo = db.select().from(repos).where(eq(repos.id, run.repoId)).get()
  const issue = db.select().from(issues).where(eq(issues.id, run.issueId)).get()
  if (!repo || !issue) {
    db.update(runs)
      .set({
        status: 'failed',
        error: 'repo or issue no longer exists',
        finishedAt: new Date().toISOString(),
      })
      .where(eq(runs.id, runId))
      .run()
    return
  }

  db.update(runs)
    .set({ status: 'running', startedAt: new Date().toISOString() })
    .where(eq(runs.id, runId))
    .run()
  events.emit(`run:${runId}:status`, 'running')
  log.info(`run ${runId}: starting for ${repo.owner}/${repo.name}#${issue.number}`)

  if (github) {
    await bestEffort('label in-progress', () =>
      github.setStateLabel(repo.owner, repo.name, issue.number, STATE_LABELS.inProgress),
    )
  }

  let comments: { author: string; body: string }[] = []
  if (github) {
    try {
      comments = await github.listComments(repo.owner, repo.name, issue.number)
    } catch (err) {
      log.warn(`run ${runId}: could not fetch comments`, err)
    }
  }

  const spec: RunSpec = {
    runId,
    repoPath: repo.path,
    owner: repo.owner,
    name: repo.name,
    autonomy: repo.autonomy as Autonomy,
    testCommand: repo.testCommand,
    globalGuardrails: readGlobalGuardrails(),
    repoGuardrails: repo.guardrails,
    instructions: repo.instructions,
    contextFiles: JSON.parse(repo.contextFiles) as string[],
    issueNumber: issue.number,
    issueTitle: issue.title,
    issueUrl: issue.url,
    issueAuthor: issue.author,
    issueBody: issue.body,
    comments,
  }

  const attachedSkills = JSON.parse(repo.skills) as string[]
  let skillsMount = deps.skillsMountDir
  if (attachedSkills.length) {
    try {
      skillsMount = buildRepoSkillsMount(repo.id, attachedSkills)
    } catch (err) {
      log.warn(`run ${runId}: per-repo skills mount failed, using full library`, err)
    }
  }
  const args = buildClaudeArgs(repo, buildSystemContract(spec), skillsMount)
  const child = spawn(deps.config.claudeBin, args, {
    cwd: repo.path,
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  children.set(runId, child)
  child.stdin.write(buildPrompt(spec))
  child.stdin.end()

  const collected = {
    seq: 0,
    sessionId: null as string | null,
    costUsd: null as number | null,
    resultText: '',
    resultIsError: false,
    stderrTail: '',
    spawnError: null as string | null,
  }

  const rl = readline.createInterface({ input: child.stdout })
  rl.on('line', (line) => {
    if (!line.trim()) return
    collected.seq++
    db.insert(runEvents).values({ runId, seq: collected.seq, event: line }).run()
    events.emit(`run:${runId}:event`, { seq: collected.seq, line })
    try {
      const evt = JSON.parse(line)
      if (typeof evt.session_id === 'string') collected.sessionId = evt.session_id
      if (evt.type === 'result') {
        collected.costUsd = typeof evt.total_cost_usd === 'number' ? evt.total_cost_usd : null
        collected.resultText = typeof evt.result === 'string' ? evt.result : ''
        collected.resultIsError =
          evt.is_error === true || (typeof evt.subtype === 'string' && evt.subtype !== 'success')
      }
    } catch {
      // non-JSON output line; already persisted raw
    }
  })
  child.stderr?.on('data', (chunk: Buffer) => {
    collected.stderrTail = (collected.stderrTail + chunk.toString()).slice(-8000)
  })
  child.on('error', (err) => {
    collected.spawnError = err.message
  })

  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGINT')
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref()
  }, deps.config.runTimeoutMinutes * 60_000)
  timeout.unref()

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', resolve)
    child.on('error', () => resolve(null))
  })
  clearTimeout(timeout)
  children.delete(runId)
  const cancelled = cancelRequests.delete(runId)

  const resultLine = collected.resultText ? parseResultLine(collected.resultText) : null
  let status: RunStatus
  let error: string | null = null
  if (cancelled) {
    status = 'cancelled'
    error = 'cancelled by user'
  } else if (timedOut) {
    status = 'failed'
    error = `timed out after ${deps.config.runTimeoutMinutes} minutes`
  } else if (collected.spawnError) {
    status = 'failed'
    error = `could not start ${deps.config.claudeBin}: ${collected.spawnError}`
  } else if (exitCode !== 0) {
    status = 'failed'
    error = `claude exited with code ${exitCode}${collected.stderrTail ? `: ${collected.stderrTail.slice(-500)}` : ''}`
  } else if (collected.resultIsError || resultLine?.status === 'failed') {
    status = 'failed'
    error = resultLine?.summary ?? 'run reported failure'
  } else {
    status = 'succeeded'
  }

  db.update(runs)
    .set({
      status,
      sessionId: collected.sessionId,
      costUsd: collected.costUsd,
      prUrl: resultLine?.pr_url ?? null,
      resultStatus: resultLine?.status ?? null,
      resultSummary:
        resultLine?.summary ?? (collected.resultText ? collected.resultText.slice(0, 500) : null),
      exitCode,
      error,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(runs.id, runId))
    .run()
  events.emit(`run:${runId}:status`, status)
  const cost = collected.costUsd
  log.info(`run ${runId}: ${status}${cost != null ? ` (cost $${cost.toFixed(2)})` : ''}`)

  if (!github) return
  if (status === 'succeeded') {
    await bestEffort('final label', () =>
      github.setStateLabel(
        repo.owner,
        repo.name,
        issue.number,
        finalStateLabel(resultLine?.status),
      ),
    )
  } else if (status === 'failed') {
    await bestEffort('failed label', () =>
      github.setStateLabel(repo.owner, repo.name, issue.number, STATE_LABELS.failed),
    )
    await bestEffort('failure comment', () =>
      github.comment(
        repo.owner,
        repo.name,
        issue.number,
        `⚠️ issueops run ${runId} failed: ${error}\n\n${runMarker(runId)}`,
      ),
    )
  } else {
    await bestEffort('clear state label', () =>
      github.setStateLabel(repo.owner, repo.name, issue.number, null),
    )
  }
}
