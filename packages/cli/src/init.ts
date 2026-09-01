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
  const shipped = fs
    .readdirSync(skillsSource, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  fs.writeFileSync(paths.shippedSkillsManifest(), `${JSON.stringify(shipped, null, 2)}\n`)
  console.log(`✓ installed ${shipped.length} skills to ${paths.skillsDir()}`)

  if (!fs.existsSync(paths.guardrailsFile())) {
    fs.writeFileSync(paths.guardrailsFile(), GUARDRAILS_TEMPLATE)
    console.log(`✓ wrote guardrails template to ${paths.guardrailsFile()}`)
  }
}

const GUARDRAILS_TEMPLATE = `# Global guardrails

Rules here are injected into EVERY issueops run, for every connected repository.
They are binding policy: runs must follow them. Keep them short and unambiguous.
Edit this file directly or from the dashboard Settings page.

- Never read, print, or commit secrets: .env files, key material, tokens, or credentials.
- Never modify CI/CD workflow files unless the issue is explicitly about them.
- Never run destructive commands (rm -rf outside the worktree, force-push, branch deletion,
  history rewrites, package publishes, deployments).
- Keep diffs reviewable: prefer several small commits over one sprawling change.
- When in doubt about scope, do less and say so in the plan comment.
`
