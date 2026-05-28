import type { Database } from 'bun:sqlite'
import * as Effect from 'effect/Effect'

import type { DbHandle } from '../services/Db'
import { embeddedMigrations } from './embedded'

export interface MigrationResult {
  readonly applied: number
  readonly total: number
}

interface DialectMigrate {
  readonly dialect: {
    migrate(migrations: typeof embeddedMigrations, session: unknown): void
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
    const internals = db as unknown as DialectMigrate
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
