import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GlobalConfigSchema } from '@issueops/shared'
import { ensureAppDirs, paths, saveConfig } from '@issueops/shared/node'

function findSkillsSource(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../skills'), // published package layout
    path.resolve(here, '../../../skills'), // monorepo layout (dist -> repo root)
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'issueops-handler', 'SKILL.md'))) return dir
  }
  return null
}

export function init(): void {
  ensureAppDirs()
  if (!fs.existsSync(paths.configFile())) {
    saveConfig(GlobalConfigSchema.parse({}))
    console.log(`✓ wrote default config to ${paths.configFile()}`)
  } else {
    console.log(`✓ config already exists at ${paths.configFile()}`)
  }
  const skillsSource = findSkillsSource()
  if (!skillsSource) {
    console.log('✗ could not locate bundled skills; run from the issueops repo or reinstall')
    return
  }
  fs.cpSync(skillsSource, paths.skillsDir(), { recursive: true })
  console.log(`✓ installed skills to ${paths.skillsDir()}`)
}
