import fs from 'node:fs'
import path from 'node:path'
import { SKILL_NAME_PATTERN, type SkillInfo } from '@issueops/shared'
import { paths } from '@issueops/shared/node'

function shippedNames(): Set<string> {
  try {
    return new Set(JSON.parse(fs.readFileSync(paths.shippedSkillsManifest(), 'utf8')) as string[])
  } catch {
    return new Set()
  }
}

export function parseSkillDescription(content: string): string {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)
  const description = frontmatter?.[1]?.match(/^description:\s*(.+)$/m)
  return description?.[1]?.trim() ?? ''
}

function skillFile(name: string): string {
  if (!SKILL_NAME_PATTERN.test(name)) throw new Error(`invalid skill name: ${name}`)
  return path.join(paths.skillsDir(), name, 'SKILL.md')
}

export function listSkills(): SkillInfo[] {
  const dir = paths.skillsDir()
  if (!fs.existsSync(dir)) return []
  const shipped = shippedNames()
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SKILL_NAME_PATTERN.test(entry.name))
    .flatMap((entry) => {
      const file = path.join(dir, entry.name, 'SKILL.md')
      if (!fs.existsSync(file)) return []
      const content = fs.readFileSync(file, 'utf8')
      return [
        {
          name: entry.name,
          description: parseSkillDescription(content),
          shipped: shipped.has(entry.name),
          size: content.length,
        },
      ]
    })
    .sort((a, b) => Number(b.shipped) - Number(a.shipped) || a.name.localeCompare(b.name))
}

export function readSkill(name: string): string | null {
  const file = skillFile(name)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

export function writeSkill(name: string, content: string): SkillInfo {
  const file = skillFile(name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  return {
    name,
    description: parseSkillDescription(content),
    shipped: shippedNames().has(name),
    size: content.length,
  }
}

export function deleteSkill(name: string): boolean {
  const dir = path.dirname(skillFile(name))
  if (!fs.existsSync(dir)) return false
  fs.rmSync(dir, { recursive: true })
  return true
}

export function readGlobalGuardrails(): string {
  try {
    return fs.readFileSync(paths.guardrailsFile(), 'utf8')
  } catch {
    return ''
  }
}

export function writeGlobalGuardrails(content: string): void {
  fs.writeFileSync(paths.guardrailsFile(), content)
}
