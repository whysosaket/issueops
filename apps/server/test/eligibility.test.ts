import { describe, expect, it } from 'vitest'
import { checkEligibility } from '../src/eligibility'

const open = { state: 'open', labels: ['issueops'], isPullRequest: false }
const ctx = { watchLabel: 'issueops', priorRunStatuses: [] as string[] }

describe('checkEligibility', () => {
  it('accepts an open issue with the watch label and no history', () => {
    expect(checkEligibility(open, ctx).eligible).toBe(true)
  })

  it('rejects pull requests', () => {
    expect(checkEligibility({ ...open, isPullRequest: true }, ctx).eligible).toBe(false)
  })

  it('rejects closed issues', () => {
    expect(checkEligibility({ ...open, state: 'closed' }, ctx).eligible).toBe(false)
  })

  it('rejects issues missing the watch label', () => {
    const result = checkEligibility({ ...open, labels: ['bug'] }, ctx)
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain('watch label')
  })

  it('accepts any issue when the watch label is empty', () => {
    expect(checkEligibility({ ...open, labels: [] }, { ...ctx, watchLabel: '' }).eligible).toBe(
      true,
    )
  })

  it('rejects issues that already carry an issueops state label', () => {
    const labels = ['issueops', 'issueops:done']
    expect(checkEligibility({ ...open, labels }, ctx).eligible).toBe(false)
  })

  it('rejects issues with an active run', () => {
    for (const status of ['queued', 'running']) {
      expect(checkEligibility(open, { ...ctx, priorRunStatuses: [status] }).eligible).toBe(false)
    }
  })

  it('rejects already-processed issues so retries stay manual', () => {
    for (const status of ['succeeded', 'failed']) {
      expect(checkEligibility(open, { ...ctx, priorRunStatuses: [status] }).eligible).toBe(false)
    }
  })

  it('re-accepts issues whose only runs were cancelled or interrupted', () => {
    const prior = ['cancelled', 'interrupted']
    expect(checkEligibility(open, { ...ctx, priorRunStatuses: prior }).eligible).toBe(true)
  })
})
