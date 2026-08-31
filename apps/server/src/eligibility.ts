import { STATE_LABEL_PREFIX } from '@issueops/shared'

export interface EligibilityIssue {
  state: string
  labels: string[]
  author: string | null
  isPullRequest: boolean
}

export interface EligibilityContext {
  /** Empty string means "watch all issues". */
  watchLabel: string
  /** Empty array means "any author". */
  allowedAuthors: string[]
  priorRunStatuses: string[]
}

export interface EligibilityResult {
  eligible: boolean
  reason: string
}

export function checkEligibility(
  issue: EligibilityIssue,
  ctx: EligibilityContext,
): EligibilityResult {
  const no = (reason: string) => ({ eligible: false, reason })
  if (issue.isPullRequest) return no('is a pull request')
  if (issue.state !== 'open') return no('not open')
  if (ctx.watchLabel && !issue.labels.includes(ctx.watchLabel)) {
    return no(`missing watch label "${ctx.watchLabel}"`)
  }
  if (ctx.allowedAuthors.length && (!issue.author || !ctx.allowedAuthors.includes(issue.author))) {
    return no(`author "${issue.author ?? 'unknown'}" is not in the allowlist`)
  }
  if (issue.labels.some((l) => l.startsWith(STATE_LABEL_PREFIX))) {
    return no('already has an issueops state label')
  }
  if (ctx.priorRunStatuses.some((s) => s === 'queued' || s === 'running')) {
    return no('a run is already active for this issue')
  }
  if (ctx.priorRunStatuses.some((s) => s === 'succeeded' || s === 'failed')) {
    return no('already processed; dispatch manually to retry')
  }
  return { eligible: true, reason: 'eligible' }
}
