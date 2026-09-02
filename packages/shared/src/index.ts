import { z } from 'zod'

export const AUTONOMY_LEVELS = ['triage-only', 'plan-only', 'plan-pr', 'plan-pr-merge'] as const
export const AutonomySchema = z.enum(AUTONOMY_LEVELS)
export type Autonomy = z.infer<typeof AutonomySchema>

export const AUTONOMY_LABELS: Record<Autonomy, string> = {
  'triage-only': 'Triage only',
  'plan-only': 'Triage + plan',
  'plan-pr': 'Plan + open PR',
  'plan-pr-merge': 'Plan + PR + merge',
}

export const RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'interrupted',
] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const STATE_LABEL_PREFIX = 'issueops:'
export const STATE_LABELS = {
  inProgress: 'issueops:in-progress',
  planned: 'issueops:planned',
  done: 'issueops:done',
  failed: 'issueops:failed',
  needsInfo: 'issueops:needs-info',
} as const
export type StateLabel = (typeof STATE_LABELS)[keyof typeof STATE_LABELS]

export const DEFAULT_WATCH_LABEL = 'issueops'

export function runMarker(runId: number): string {
  return `<!-- issueops:run:${runId} -->`
}

export const RESULT_LINE_PREFIX = 'ISSUEOPS_RESULT:'

export const ResultLineSchema = z.object({
  status: z.enum(['done', 'planned', 'triaged', 'needs-info', 'failed']),
  pr_url: z.string().optional(),
  summary: z.string().optional(),
})
export type ResultLine = z.infer<typeof ResultLineSchema>

export function parseResultLine(text: string): ResultLine | null {
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim()
    if (!line?.startsWith(RESULT_LINE_PREFIX)) continue
    try {
      return ResultLineSchema.parse(JSON.parse(line.slice(RESULT_LINE_PREFIX.length).trim()))
    } catch {
      return null
    }
  }
  return null
}

export const GlobalConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.number().int().min(1).max(65535).default(7411),
  maxConcurrentRuns: z.number().int().min(1).default(2),
  runTimeoutMinutes: z.number().int().min(1).default(60),
  claudeBin: z.string().default('claude'),
  githubToken: z.string().optional(),
})
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

export const GlobalConfigUpdateSchema = GlobalConfigSchema.partial()

export const RepoSettingsSchema = z.object({
  watchLabel: z.string().default(DEFAULT_WATCH_LABEL),
  allowedAuthors: z.array(z.string()).default([]),
  intervalMinutes: z.number().int().min(1).default(30),
  autonomy: AutonomySchema.default('plan-pr-merge'),
  concurrency: z.number().int().min(1).max(4).default(1),
  testCommand: z.string().nullable().default(null),
  maxTurns: z.number().int().min(1).default(100),
  maxBudgetUsd: z.number().positive().nullable().default(null),
  guardrails: z.string().default(''),
  instructions: z.string().default(''),
  contextFiles: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})

export const RepoCreateSchema = RepoSettingsSchema.partial().extend({
  path: z.string().min(1),
})
export type RepoCreate = z.infer<typeof RepoCreateSchema>

export const RepoUpdateSchema = RepoSettingsSchema.partial()
export type RepoUpdate = z.infer<typeof RepoUpdateSchema>

export interface Repo {
  id: number
  path: string
  owner: string
  name: string
  watchLabel: string
  allowedAuthors: string[]
  intervalMinutes: number
  autonomy: Autonomy
  concurrency: number
  testCommand: string | null
  maxTurns: number
  maxBudgetUsd: number | null
  guardrails: string
  instructions: string
  contextFiles: string[]
  /** Skill names attached to this repo's runs; empty = the whole library. */
  skills: string[]
  enabled: boolean
  lastPolledAt: string | null
  createdAt: string
}

export interface Issue {
  id: number
  repoId: number
  number: number
  title: string
  body: string | null
  author: string | null
  state: string
  labels: string[]
  url: string
  ghUpdatedAt: string
}

export interface Run {
  id: number
  repoId: number
  issueId: number
  issueNumber: number
  trigger: 'poll' | 'manual'
  status: RunStatus
  sessionId: string | null
  costUsd: number | null
  prUrl: string | null
  resultStatus: string | null
  resultSummary: string | null
  exitCode: number | null
  error: string | null
  queuedAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface RunListItem extends Run {
  repoName: string
  issueTitle: string
}

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export interface SkillInfo {
  name: string
  description: string
  shipped: boolean
  size: number
}

export const ACTIVITY_KINDS = ['daemon', 'poll', 'skip', 'run', 'repo', 'error'] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export interface ActivityItem {
  id: number
  kind: ActivityKind
  message: string
  repoId: number | null
  runId: number | null
  createdAt: string
}

export interface Health {
  status: 'ok'
  version: string
  uptimeSeconds: number
  activeRuns: number
  queuedRuns: number
}
