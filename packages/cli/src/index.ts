import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { loadConfig, paths } from '@issueops/shared/node'
import { dashboardUrl, fetchHealth, runForeground, startDetached, stopDetached } from './daemon'
import { doctor } from './doctor'
import { init } from './init'
import {
  installAgent,
  isInstalled,
  isLoaded,
  restartAgent,
  startAgent,
  stopAgent,
  uninstallAgent,
} from './launchd'

const HELP = `issueops — GitHub issues → your local Claude Code

Usage: issueops <command>

  init        Set up ~/.issueops (config + skills)
  install     Install the launchd agent so the daemon runs at login (macOS)
  uninstall   Remove the launchd agent
  start       Start the daemon (launchd if installed, else detached process)
  stop        Stop the daemon
  restart     Restart the daemon
  status      Show daemon + launchd status
  run         Run the daemon in the foreground (for development)
  logs        Show recent daemon logs
  open        Open the dashboard in your browser
  doctor      Check the local setup (--smoke also runs a real claude call)
  help        Show this help
`

const macOnly = () =>
  console.log('launchd management is macOS-only; use `issueops run` under your own supervisor.')

async function mainCommand(command: string, flags: string[]): Promise<number> {
  const onMac = process.platform === 'darwin'
  switch (command) {
    case 'init':
      init()
      return 0

    case 'install': {
      if (!onMac) {
        macOnly()
        return 1
      }
      init()
      installAgent()
      const config = loadConfig()
      console.log(`✓ launchd agent installed and started`)
      console.log(`  dashboard: ${dashboardUrl(config)}`)
      return 0
    }

    case 'uninstall':
      if (!onMac) {
        macOnly()
        return 1
      }
      uninstallAgent()
      console.log('✓ launchd agent removed')
      return 0

    case 'start': {
      if (onMac && isInstalled()) startAgent()
      else startDetached()
      console.log(`✓ daemon starting — dashboard: ${dashboardUrl(loadConfig())}`)
      return 0
    }

    case 'stop':
      if (onMac && isLoaded()) stopAgent()
      else if (!stopDetached()) console.log('daemon was not running')
      console.log('✓ daemon stopped')
      return 0

    case 'restart':
      if (onMac && isInstalled()) restartAgent()
      else {
        stopDetached()
        startDetached()
      }
      console.log('✓ daemon restarted')
      return 0

    case 'status': {
      const config = loadConfig()
      const health = await fetchHealth(config)
      if (health) {
        console.log(`✓ daemon running v${health.version} at ${dashboardUrl(config)}`)
        console.log(
          `  uptime ${health.uptimeSeconds}s, ${health.activeRuns} active / ${health.queuedRuns} queued runs`,
        )
      } else {
        console.log(`✗ daemon not responding at ${dashboardUrl(config)}`)
      }
      if (onMac) {
        console.log(
          `  launchd: ${isInstalled() ? (isLoaded() ? 'installed + loaded' : 'installed, not loaded') : 'not installed'}`,
        )
      }
      return health ? 0 : 1
    }

    case 'run':
      return runForeground()

    case 'logs': {
      for (const file of [paths.daemonLog(), paths.daemonErrLog()]) {
        if (!fs.existsSync(file)) continue
        const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n')
        console.log(`── ${file} (last ${Math.min(lines.length, 50)} lines) ──`)
        console.log(lines.slice(-50).join('\n'))
      }
      console.log(`\nfollow live: tail -f ${paths.daemonLog()}`)
      return 0
    }

    case 'open': {
      const url = dashboardUrl(loadConfig())
      if (onMac) spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
      else console.log(url)
      return 0
    }

    case 'doctor':
      return doctor(loadConfig(), flags.includes('--smoke'))

    default:
      console.log(HELP)
      return command === 'help' || command === '--help' ? 0 : 1
  }
}

const [command = 'help', ...flags] = process.argv.slice(2)
mainCommand(command, flags)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  })
