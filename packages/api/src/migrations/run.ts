import { Effect } from 'effect'

import type { DbClient } from '../services/Db'
import { embeddedMigrations } from './embedded'

const STATEMENT_BREAKPOINT = /-->\s*statement-breakpoint/g

const ensureMigrationsTable = (client: DbClient) => {
  client.run(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `)
}

const appliedTags = (client: DbClient): Set<string> => {
  const rows = client.query('SELECT tag FROM __drizzle_migrations').all() as { tag: string }[]

  return new Set(rows.map((r) => r.tag))
}

const applyMigration = (client: DbClient, tag: string, sql: string) => {
  const statements = sql
    .split(STATEMENT_BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const tx = client.transaction(() => {
    for (const stmt of statements) {
      client.run(stmt)
    }

    client.run('INSERT INTO __drizzle_migrations (tag, created_at) VALUES (?, ?)', [
      tag,
      Date.now(),
    ])
  })

  tx()
}

export type MigrationResult = {
  readonly applied: number
  readonly total: number
  readonly appliedTags: readonly string[]
}

export const runEmbeddedMigrations = Effect.fn('runEmbeddedMigrations')(function* (
  client: DbClient,
) {
  yield* Effect.sync(() => ensureMigrationsTable(client))
  const applied = yield* Effect.sync(() => appliedTags(client))
  const pending = embeddedMigrations.filter((m) => !applied.has(m.tag))

  if (pending.length === 0) {
    yield* Effect.logDebug(`Migrations up to date (${embeddedMigrations.length} applied).`)
    return { applied: 0, total: embeddedMigrations.length, appliedTags: [] }
  }

  yield* Effect.logInfo(`Applying ${pending.length} migration(s)…`)
  const appliedNow: string[] = []

  for (const m of pending) {
    yield* Effect.sync(() => applyMigration(client, m.tag, m.sql))
    yield* Effect.logInfo(`  ✓ ${m.tag}`)
    appliedNow.push(m.tag)
  }

  return { applied: pending.length, total: embeddedMigrations.length, appliedTags: appliedNow }
})
