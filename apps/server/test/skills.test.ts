import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { paths } from '@issueops/shared/node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildRepoSkillsMount,
  deleteSkill,
  listSkills,
  parseSkillDescription,
  readGlobalGuardrails,
  readSkill,
  writeGlobalGuardrails,
  writeSkill,
} from '../src/skills'

const SKILL = `---
name: my-skill
description: Does a thing when asked.
---

# my-skill
`

describe('skills module', () => {
  let home: string

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'issueops-test-'))
    process.env.ISSUEOPS_HOME = home
    fs.mkdirSync(paths.skillsDir(), { recursive: true })
  })

  afterEach(() => {
    delete process.env.ISSUEOPS_HOME
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('writes, lists, reads, and deletes a skill', () => {
    const info = writeSkill('my-skill', SKILL)
    expect(info.description).toBe('Does a thing when asked.')
    expect(info.shipped).toBe(false)

    expect(listSkills().map((s) => s.name)).toEqual(['my-skill'])
    expect(readSkill('my-skill')).toBe(SKILL)

    expect(deleteSkill('my-skill')).toBe(true)
    expect(listSkills()).toEqual([])
    expect(readSkill('my-skill')).toBeNull()
  })

  it('marks skills from the shipped manifest and sorts them first', () => {
    writeSkill('aaa-custom', SKILL)
    writeSkill('zzz-shipped', SKILL)
    fs.writeFileSync(paths.shippedSkillsManifest(), JSON.stringify(['zzz-shipped']))
    const skills = listSkills()
    expect(skills.map((s) => [s.name, s.shipped])).toEqual([
      ['zzz-shipped', true],
      ['aaa-custom', false],
    ])
  })

  it('rejects names that could escape the skills directory', () => {
    for (const name of ['../evil', 'a/b', 'UPPER', '.hidden', '']) {
      expect(() => writeSkill(name, SKILL)).toThrow(/invalid skill name/)
    }
  })

  it('builds a per-repo mount with only the selected skills', () => {
    writeSkill('alpha', SKILL)
    writeSkill('beta', SKILL)

    const mount = buildRepoSkillsMount(7, ['alpha', 'missing', '../evil'])
    const skillsRoot = path.join(mount, '.claude', 'skills')
    expect(fs.readdirSync(skillsRoot)).toEqual(['alpha'])
    expect(fs.existsSync(path.join(skillsRoot, 'alpha', 'SKILL.md'))).toBe(true)

    // rebuilding replaces the previous selection entirely
    buildRepoSkillsMount(7, ['beta'])
    expect(fs.readdirSync(skillsRoot)).toEqual(['beta'])
  })

  it('round-trips global guardrails and defaults to empty', () => {
    expect(readGlobalGuardrails()).toBe('')
    writeGlobalGuardrails('- no secrets\n')
    expect(readGlobalGuardrails()).toBe('- no secrets\n')
  })
})

describe('parseSkillDescription', () => {
  it('returns empty for content without frontmatter', () => {
    expect(parseSkillDescription('# just markdown')).toBe('')
  })
})
