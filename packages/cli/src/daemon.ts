import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import type { GlobalConfig, Health } from '@issueops/shared'
import { paths } from '@issueops/shared/node'
import { serverEntry } from './launchd'

export function dashboardUrl(config: GlobalConfig): string {
  return `http://${config.host}:${config.port}`
}

export async function fetchHealth(config: GlobalConfig): Promise<Health | null> {
  try {
    const res = await fetch(`${dashboardUrl(config)}/api/health`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return null
    return (await res.json()) as Health
  } catch {
    return null
  }
}

export function runForeground(): number {
  const res = spawnSync(process.execPath, [serverEntry()], { stdio: 'inherit' })
  return res.status ?? 1
}

export function startDetached(): void {
  const out = fs.openSync(paths.daemonLog(), 'a')
  const err = fs.openSync(paths.daemonErrLog(), 'a')
  const child = spawn(process.execPath, [serverEntry()], {
    detached: true,
    stdio: ['ignore', out, err],
  })
  if (child.pid) fs.writeFileSync(paths.pidFile(), String(child.pid))
  child.unref()
}

export function stopDetached(): boolean {
  if (!fs.existsSync(paths.pidFile())) return false
  const pid = Number(fs.readFileSync(paths.pidFile(), 'utf8').trim())
  fs.rmSync(paths.pidFile(), { force: true })
  if (!Number.isFinite(pid)) return false
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}
