import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

const BOOTSTRAP = `
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  watch_label TEXT NOT NULL DEFAULT 'issueops',
  allowed_authors TEXT NOT NULL DEFAULT '[]',
  interval_minutes INTEGER NOT NULL DEFAULT 30,
  autonomy TEXT NOT NULL DEFAULT 'plan-pr-merge',
  concurrency INTEGER NOT NULL DEFAULT 1,
  test_command TEXT,
  max_turns INTEGER NOT NULL DEFAULT 100,
  max_budget_usd REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_polled_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  author TEXT,
  state TEXT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',
  url TEXT NOT NULL,
  gh_updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS issues_repo_number ON issues (repo_id, number);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  issue_id INTEGER NOT NULL REFERENCES issues(id),
  issue_number INTEGER NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'poll',
  status TEXT NOT NULL DEFAULT 'queued',
  session_id TEXT,
  cost_usd REAL,
  pr_url TEXT,
  result_status TEXT,
  result_summary TEXT,
  exit_code INTEGER,
  error TEXT,
  queued_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL,
  event TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_seq ON run_events (run_id, seq);
`

export type Db = ReturnType<typeof createDb>

// Additive migrations for databases created before a column existed; each is a
// no-op (caught) once applied.
const MIGRATIONS = [`ALTER TABLE repos ADD COLUMN allowed_authors TEXT NOT NULL DEFAULT '[]'`]

export function createDb(file: string) {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(BOOTSTRAP)
  for (const migration of MIGRATIONS) {
    try {
      sqlite.exec(migration)
    } catch {
      // column already exists
    }
  }
  return drizzle(sqlite, { schema })
}

export { schema }
