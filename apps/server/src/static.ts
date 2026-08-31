import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Hono } from 'hono'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export function resolveWebDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    process.env.ISSUEOPS_WEB_DIST,
    path.resolve(here, '../../web/dist'),
    path.resolve(here, 'web'),
  ]
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return dir
  }
  return null
}

export function registerStatic(app: Hono, dist: string): void {
  app.get('*', (c) => {
    const urlPath = new URL(c.req.url).pathname
    if (urlPath.startsWith('/api/')) return c.notFound()
    let filePath = path.join(dist, path.normalize(urlPath).replace(/^[/\\]+/, ''))
    if (
      !filePath.startsWith(dist) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      filePath = path.join(dist, 'index.html')
    }
    const body = fs.readFileSync(filePath)
    return c.body(new Uint8Array(body), 200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
    })
  })
}
