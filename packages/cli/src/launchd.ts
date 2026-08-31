import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { paths } from '@issueops/shared/node'

export const LAUNCHD_LABEL = 'com.issueops.daemon'

export function plistPath(): string {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
}

export function serverEntry(): string {
  return createRequire(import.meta.url).resolve('@issueops/server')
}

function renderPlist(): string {
  const node = process.execPath
  const pathEnv = [
    path.dirname(node),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>${serverEntry()}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>WorkingDirectory</key>
  <string>${os.homedir()}</string>
  <key>StandardOutPath</key>
  <string>${paths.daemonLog()}</string>
  <key>StandardErrorPath</key>
  <string>${paths.daemonErrLog()}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${pathEnv}</string>
    <key>HOME</key>
    <string>${os.homedir()}</string>
  </dict>
</dict>
</plist>
`
}

function launchctl(...args: string[]): { ok: boolean; output: string } {
  const res = spawnSync('launchctl', args, { encoding: 'utf8' })
  return { ok: res.status === 0, output: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() }
}

function domain(): string {
  return `gui/${process.getuid?.() ?? 501}`
}

export function isInstalled(): boolean {
  return fs.existsSync(plistPath())
}

export function isLoaded(): boolean {
  return launchctl('print', `${domain()}/${LAUNCHD_LABEL}`).ok
}

export function installAgent(): void {
  fs.mkdirSync(path.dirname(plistPath()), { recursive: true })
  fs.writeFileSync(plistPath(), renderPlist())
  if (isLoaded()) launchctl('bootout', `${domain()}/${LAUNCHD_LABEL}`)
  const res = launchctl('bootstrap', domain(), plistPath())
  if (!res.ok) throw new Error(`launchctl bootstrap failed: ${res.output}`)
}

export function uninstallAgent(): void {
  if (isLoaded()) launchctl('bootout', `${domain()}/${LAUNCHD_LABEL}`)
  if (isInstalled()) fs.rmSync(plistPath())
}

export function startAgent(): void {
  if (!isLoaded()) {
    const res = launchctl('bootstrap', domain(), plistPath())
    if (!res.ok) throw new Error(`launchctl bootstrap failed: ${res.output}`)
  } else {
    launchctl('kickstart', `${domain()}/${LAUNCHD_LABEL}`)
  }
}

export function stopAgent(): void {
  if (isLoaded()) launchctl('bootout', `${domain()}/${LAUNCHD_LABEL}`)
}

export function restartAgent(): void {
  if (isLoaded()) launchctl('kickstart', '-k', `${domain()}/${LAUNCHD_LABEL}`)
  else startAgent()
}
