import { Database } from 'bun:sqlite'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { ServerConfig } from '../config'
import * as schema from '../db/schema'

export type DbHandle = BunSQLiteDatabase<typeof schema> & { $client: Database }
export type DbClient = Database

export class DbError extends Schema.TaggedError<DbError>()('DbError', {
  message: Schema.String,
}) {}

export class Db extends Effect.Service<Db>()('Db', {
  accessors: true,
  scoped: Effect.gen(function*() {
    const config = yield* ServerConfig

    const client = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const c = new Database(config.dbFile, { create: true })
        c.run('PRAGMA journal_mode = WAL')
        c.run('PRAGMA foreign_keys = ON')
        return c
      }),
      (c) =>
        Effect.sync(() => {
          c.close()
        }),
    )

    const handle: DbHandle = drizzle({ client, schema })

    const run = <A>(f: (h: DbHandle) => Promise<A>) =>
      Effect.tryPromise({
        try: () => f(handle),
        catch: (cause) =>
          new DbError({ message: cause instanceof Error ? cause.message : String(cause) }),
      })

    return { handle, client, run }
  }),
}) {}
