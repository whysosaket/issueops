import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { GlobalConfig } from '@issueops/shared'
import { appDir, paths } from '@issueops/shared/node'
import { fetchHealth } from './daemon'
import { isInstalled, isLoaded } from './launchd'

interface Check {
  name: string
  ok: boolean
  detail: string
  fatal?: boolean
}

function cmd(bin: string, args: string[], timeout = 10_000) {
  return spawnSync(bin, args, { encoding: 'utf8', timeout })
}

export async function doctor(config: GlobalConfig, smoke: boolean): Promise<number> {
  const checks: Check[] = []

  const [major] = process.versions.node.split('.')
  checks.push({
    name: 'node >= 20',
    ok: Number(major) >= 20,
    detail: `v${process.versions.node}`,
    fatal: true,
  })

  const claude = cmd(config.claudeBin, ['--version'])
  checks.push({
    name: 'claude CLI',
    ok: claude.status === 0,
    detail: claude.status === 0 ? claude.stdout.trim() : `"${config.claudeBin}" not runnable`,
    fatal: true,
  })

  const gh = cmd('gh', ['auth', 'status'])
  checks.push({
    name: 'gh authenticated',
    ok: gh.status === 0,
    detail: gh.status === 0 ? 'logged in' : 'run `gh auth login`',
    fatal: true,
  })

  checks.push({
    name: 'app dir',
    ok: fs.existsSync(appDir()),
    detail: fs.existsSync(appDir()) ? appDir() : `missing — run \`issueops init\``,
  })

  const skillOk = fs.existsSync(path.join(paths.skillsDir(), 'issueops-handler', 'SKILL.md'))
  checks.push({
    name: 'skills installed',
    ok: skillOk,
    detail: skillOk ? paths.skillsDir() : 'missing — run `issueops init`',
  })

  const health = await fetchHealth(config)
  checks.push({
    name: 'daemon',
    ok: health !== null,
    detail: health
      ? `running v${health.version}, ${health.activeRuns} active / ${health.queuedRuns} queued runs`
      : 'not responding — run `issueops start`',
  })

  if (process.platform === 'darwin') {
    checks.push({
      name: 'launchd agent',
      ok: isInstalled() && isLoaded(),
      detail: isInstalled()
        ? isLoaded()
          ? 'installed and loaded'
          : 'installed but not loaded — run `issueops start`'
        : 'not installed — run `issueops install`',
    })
  }

  if (smoke) {
    console.log('running claude smoke test (spends a few tokens)...')
    const result = cmd(config.claudeBin, ['-p', 'Reply with exactly: ok'], 180_000)
    const ok = result.status === 0 && result.stdout.toLowerCase().includes('ok')
    checks.push({
      name: 'claude headless smoke test',
      ok,
      detail: ok
        ? 'responded'
        : (result.stderr || result.stdout || 'no output').trim().slice(0, 200),
    })
  }

  for (const check of checks) {
    console.log(`${check.ok ? '✓' : '✗'} ${check.name.padEnd(28)} ${check.detail}`)
  }
  return checks.some((c) => c.fatal && !c.ok) ? 1 : 0
}
