import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const repos = sqliteTable('repos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  owner: text('owner').notNull(),
  name: text('name').notNull(),
  watchLabel: text('watch_label').notNull().default('issueops'),
  allowedAuthors: text('allowed_authors').notNull().default('[]'),
  intervalMinutes: integer('interval_minutes').notNull().default(30),
  autonomy: text('autonomy').notNull().default('plan-pr-merge'),
  concurrency: integer('concurrency').notNull().default(1),
  testCommand: text('test_command'),
  maxTurns: integer('max_turns').notNull().default(100),
  maxBudgetUsd: real('max_budget_usd'),
  guardrails: text('guardrails').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  contextFiles: text('context_files').notNull().default('[]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastPolledAt: text('last_polled_at'),
  createdAt: text('created_at').notNull(),
})

export const issues = sqliteTable(
  'issues',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    repoId: integer('repo_id')
      .notNull()
      .references(() => repos.id),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    author: text('author'),
    state: text('state').notNull(),
    labels: text('labels').notNull().default('[]'),
    url: text('url').notNull(),
    ghUpdatedAt: text('gh_updated_at').notNull(),
  },
  (t) => [uniqueIndex('issues_repo_number').on(t.repoId, t.number)],
)

export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repoId: integer('repo_id')
    .notNull()
    .references(() => repos.id),
  issueId: integer('issue_id')
    .notNull()
    .references(() => issues.id),
  issueNumber: integer('issue_number').notNull(),
  trigger: text('trigger').notNull().default('poll'),
  status: text('status').notNull().default('queued'),
  sessionId: text('session_id'),
  costUsd: real('cost_usd'),
  prUrl: text('pr_url'),
  resultStatus: text('result_status'),
  resultSummary: text('result_summary'),
  exitCode: integer('exit_code'),
  error: text('error'),
  queuedAt: text('queued_at').notNull(),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
})

export const runEvents = sqliteTable(
  'run_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => runs.id),
    seq: integer('seq').notNull(),
    event: text('event').notNull(),
  },
  (t) => [uniqueIndex('run_events_run_seq').on(t.runId, t.seq)],
)
