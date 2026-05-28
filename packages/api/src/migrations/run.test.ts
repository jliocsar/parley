import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as Effect from 'effect/Effect'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as schema from '../db/schema'
import type { DbHandle } from '../services/Db'
import { embeddedMigrations } from './embedded'
import { runEmbeddedMigrations } from './run'

let workdir: string
let client: Database
let handle: DbHandle

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'parley-migrate-'))
  client = new Database(join(workdir, 'test.db'), { create: true })
  handle = drizzle({ client, schema })
})

afterEach(() => {
  client.close()
  rmSync(workdir, { recursive: true, force: true })
})

const run = <A, E>(eff: Effect.Effect<A, E>) => Effect.runPromise(eff)

describe('runEmbeddedMigrations', () => {
  it('applies all embedded migrations on first run', async () => {
    const result = await run(runEmbeddedMigrations(handle))
    expect(result.applied).toBe(embeddedMigrations.length)
    expect(result.total).toBe(embeddedMigrations.length)

    const tables = client
      .query<{ name: string }, []>('SELECT name FROM sqlite_master WHERE type=\'table\'')
      .all()
      .map((r) => r.name)
    expect(tables).toContain('rooms')
    expect(tables).toContain('auth_tokens')
    expect(tables).toContain('__drizzle_migrations')
  })

  it('is idempotent across repeated runs', async () => {
    await run(runEmbeddedMigrations(handle))
    const second = await run(runEmbeddedMigrations(handle))
    expect(second.applied).toBe(0)
    expect(second.total).toBe(embeddedMigrations.length)
  })

  it('uses Drizzle-native __drizzle_migrations schema (hash + created_at)', async () => {
    await run(runEmbeddedMigrations(handle))

    const cols = client
      .query<{ name: string }, []>('PRAGMA table_info(__drizzle_migrations)')
      .all()
      .map((c) => c.name)
    expect(cols).toContain('hash')
    expect(cols).toContain('created_at')
    expect(cols).not.toContain('tag')

    const rows = client
      .query<{ hash: string; created_at: number }, []>(
        'SELECT hash, created_at FROM __drizzle_migrations ORDER BY id',
      )
      .all()
    expect(rows.map((r) => r.hash)).toEqual(embeddedMigrations.map((m) => m.hash))
    expect(rows.map((r) => Number(r.created_at))).toEqual(
      embeddedMigrations.map((m) => m.folderMillis),
    )
  })

  it('embeds at least one migration (build sanity check)', () => {
    expect(embeddedMigrations.length).toBeGreaterThan(0)
    for (const m of embeddedMigrations) {
      expect(m.tag).toMatch(/^\d{4}_/)
      expect(m.sql.length).toBeGreaterThan(0)
      expect(m.hash).toMatch(/^[0-9a-f]{64}$/)
      expect(m.folderMillis).toBeGreaterThan(0)
    }
  })
})
