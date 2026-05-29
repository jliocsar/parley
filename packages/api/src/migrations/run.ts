import type { Database } from 'bun:sqlite'
import * as Effect from 'effect/Effect'

import type { DbHandle } from '../services/Db'
import { embeddedMigrations } from './embedded'
import type { EmbeddedMigration } from './load'

export interface MigrationResult {
  readonly applied: number
  readonly total: number
}

// Drizzle's `dialect.migrate(meta, session)` is the sanctioned no-disk-IO migration path
// (see rules/drizzle-native-migrator.md), but `dialect` and `session` are protected on
// BunSQLiteDatabase. This is the minimal structural view we need to reach them; `session`
// is an opaque value we only pass straight back into `migrate`, never inspect.
interface DrizzleMigratable {
  readonly dialect: {
    migrate(migrations: readonly EmbeddedMigration[], session: unknown): void
  }
  readonly session: unknown
}

export const runEmbeddedMigrations = Effect.fn('runEmbeddedMigrations')(function*(db: DbHandle) {
  const total = embeddedMigrations.length

  if (total === 0) {
    yield* Effect.logDebug('No embedded migrations to apply.')

    return { applied: 0, total }
  }

  const applied = yield* Effect.sync(() => {
    // The cast laundering protected access is unavoidable here; it is contained to this line.
    const internals = db as unknown as DrizzleMigratable
    const before = countAppliedMigrations(db.$client)

    internals.dialect.migrate(embeddedMigrations, internals.session)

    const after = countAppliedMigrations(db.$client)

    return after - before
  })

  if (applied === 0) {
    yield* Effect.logDebug(`Migrations up to date (${total} embedded).`)
  } else {
    yield* Effect.logInfo(`Applied ${applied} migration(s) (${total} embedded).`)
  }

  return { applied, total }
})

function countAppliedMigrations(client: Database): number {
  try {
    const row = client.query('SELECT COUNT(*) AS c FROM __drizzle_migrations').get() as
      | { c: number }
      | undefined

    return row?.c ?? 0
  } catch {
    return 0
  }
}
