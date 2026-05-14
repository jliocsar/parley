import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'

import { embeddedMigrations } from './embedded'
import { runEmbeddedMigrations } from './run'

let workdir: string
let db: Database

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'parley-migrate-'))
  db = new Database(join(workdir, 'test.db'), { create: true })
})

afterEach(() => {
  db.close()
  rmSync(workdir, { recursive: true, force: true })
})

const run = <A, E>(eff: Effect.Effect<A, E, never>) => Effect.runPromise(eff)

describe('runEmbeddedMigrations', () => {
  it('applies all embedded migrations on first run', async () => {
    const result = await run(runEmbeddedMigrations(db))
    expect(result.applied).toBe(embeddedMigrations.length)
    expect(result.total).toBe(embeddedMigrations.length)

    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => r.name)
    expect(tables).toContain('rooms')
    expect(tables).toContain('auth_tokens')
    expect(tables).toContain('__drizzle_migrations')
  })

  it('is idempotent across repeated runs', async () => {
    await run(runEmbeddedMigrations(db))
    const second = await run(runEmbeddedMigrations(db))
    expect(second.applied).toBe(0)
    expect(second.total).toBe(embeddedMigrations.length)
  })

  it('records each applied tag in __drizzle_migrations', async () => {
    await run(runEmbeddedMigrations(db))
    const tags = db
      .query<{ tag: string }, []>('SELECT tag FROM __drizzle_migrations ORDER BY id')
      .all()
      .map((r) => r.tag)
    expect(tags).toEqual(embeddedMigrations.map((m) => m.tag))
  })

  it('embeds at least one migration (build sanity check)', () => {
    expect(embeddedMigrations.length).toBeGreaterThan(0)
    for (const m of embeddedMigrations) {
      expect(m.tag).toMatch(/^\d{4}_/)
      expect(m.sql.length).toBeGreaterThan(0)
    }
  })
})
