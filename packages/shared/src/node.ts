import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type GlobalConfig, GlobalConfigSchema } from './index'

export function appDir(): string {
  return process.env.ISSUEOPS_HOME ?? path.join(os.homedir(), '.issueops')
}

export const paths = {
  configFile: () => path.join(appDir(), 'config.json'),
  dbFile: () => path.join(appDir(), 'issueops.db'),
  logsDir: () => path.join(appDir(), 'logs'),
  daemonLog: () => path.join(appDir(), 'logs', 'daemon.log'),
  daemonErrLog: () => path.join(appDir(), 'logs', 'daemon.err.log'),
  pidFile: () => path.join(appDir(), 'daemon.pid'),
  skillsMountDir: () => path.join(appDir(), 'skills-mount'),
  skillsDir: () => path.join(appDir(), 'skills-mount', '.claude', 'skills'),
  shippedSkillsManifest: () => path.join(appDir(), 'skills-mount', '.shipped.json'),
  guardrailsFile: () => path.join(appDir(), 'guardrails.md'),
}

export function ensureAppDirs(): void {
  for (const dir of [appDir(), paths.logsDir(), paths.skillsDir()]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function loadConfig(): GlobalConfig {
  const file = paths.configFile()
  if (!fs.existsSync(file)) return GlobalConfigSchema.parse({})
  return GlobalConfigSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
}

export function saveConfig(config: GlobalConfig): void {
  ensureAppDirs()
  fs.writeFileSync(paths.configFile(), `${JSON.stringify(config, null, 2)}\n`)
}
