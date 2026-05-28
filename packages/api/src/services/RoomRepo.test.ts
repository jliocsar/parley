import { describe, expect, it } from 'bun:test'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import * as Config from 'effect/Config'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ServerConfig } from '../config'
import { RoomName } from '../domain/room'
import { Db } from './Db'
import { RoomRepo } from './RoomRepo'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')

const withTempDb = <A>(eff: Effect.Effect<A, unknown, RoomRepo | Db>) => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-roomrepo-'))
  const dbFile = join(dir, 'parley.db')

  const ConfigLive = Layer.setConfigProvider(
    ConfigProvider.fromMap(
      new Map([
        ['PARLEY_DB_FILE', dbFile],
        ['PARLEY_BIND', '127.0.0.1'],
      ]),
    ),
  )

  const program = Effect.gen(function*() {
    const db = yield* Db
    yield* Effect.promise(() =>
      Promise.resolve(
        migrate(db.handle, {
          migrationsFolder: MIGRATIONS,
          migrationsTable: '__drizzle_migrations',
        }),
      )
    )
    return yield* eff
  })

  return Effect.runPromise(
    program.pipe(
      Effect.provide(RoomRepo.Default),
      Effect.provide(Db.Default),
      Effect.provide(ConfigLive),
      Effect.scoped,
    ),
  ).finally(() => {
    rmSync(dir, { recursive: true, force: true })
  })
}

// Avoid unused import warning — ServerConfig is what the layer reads via ConfigProvider.
void Config
void ServerConfig

describe('RoomRepo.ensure', () => {
  // Regression: Drizzle hands back `Date` for timestamp_ms columns, but `Schema.DateTimeUtc`
  // decodes from an ISO string. Without an explicit `.toISOString()` at the boundary,
  // `findByName` after a successful insert blows up with "Expected string, actual <Date>".
  it('round-trips a room through the DB without DateTimeUtc decode errors', async () => {
    await withTempDb(
      Effect.gen(function*() {
        const repo = yield* RoomRepo
        const name = RoomName.make('lobby')

        const created = yield* repo.ensure(name)
        expect(created.name).toBe(name)

        const reloaded = yield* repo.ensure(name)
        expect(reloaded.id).toBe(created.id)

        const all = yield* repo.listAll()
        expect(all).toHaveLength(1)
        expect(all[0]?.name).toBe(name)
      }),
    )
  })
})
