function write(level: 'INFO' | 'WARN' | 'ERROR', msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString()} ${level} ${msg}`
  const out = level === 'ERROR' ? console.error : console.log
  if (extra === undefined) out(line)
  else out(line, extra instanceof Error ? extra.message : JSON.stringify(extra))
}

export const log = {
  info: (msg: string, extra?: unknown) => write('INFO', msg, extra),
  warn: (msg: string, extra?: unknown) => write('WARN', msg, extra),
  error: (msg: string, extra?: unknown) => write('ERROR', msg, extra),
}
