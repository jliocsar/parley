#!/usr/bin/env bun
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, Options } from '@effect/cli'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { Effect, Layer } from 'effect'

import { ServerConfig } from '../config'
import { AuthLabel } from '../domain/ids'
import { AdminLive, ServerLive } from '../layers'
import { WsServer } from '../server/WsServer'
import { ensureLocalServerEntry } from '../services/ConfigBootstrap'
import { Db } from '../services/Db'
import { TokenService } from '../services/TokenService'

const MIGRATIONS_FOLDER = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')

const run = Command.make('run', {}, () =>
  Effect.gen(function* () {
    const cfg = yield* ServerConfig
    yield* ensureLocalServerEntry({ bind: cfg.bind, port: cfg.port })
    yield* WsServer
    return yield* Effect.never
  }).pipe(Effect.provide(ServerLive)),
)

const labelOption = Options.text('label').pipe(
  Options.withAlias('l'),
  Options.withDescription('Human label for this token'),
)

const tokenIssue = Command.make('issue', { label: labelOption }, ({ label }) =>
  Effect.gen(function* () {
    const tokens = yield* TokenService
    const issued = yield* tokens.issue(AuthLabel.make(label))
    yield* Effect.logInfo(
      `Token issued for "${issued.label}":\n  ${issued.token}\n(store this securely — it will not be shown again)`,
    )
  }).pipe(Effect.provide(AdminLive)),
)

const tokenList = Command.make('list', {}, () =>
  Effect.gen(function* () {
    const tokens = yield* TokenService
    const all = yield* tokens.list()

    for (const t of all) {
      yield* Effect.logInfo(`${t.label}\tcreated=${t.createdAt}`)
    }
  }).pipe(Effect.provide(AdminLive)),
)

const tokenRevoke = Command.make('revoke', { label: labelOption }, ({ label }) =>
  Effect.gen(function* () {
    const tokens = yield* TokenService
    yield* tokens.revoke(AuthLabel.make(label))
    yield* Effect.logInfo(`Token "${label}" revoked.`)
  }).pipe(Effect.provide(AdminLive)),
)

const token = Command.make('token').pipe(
  Command.withSubcommands([tokenIssue, tokenList, tokenRevoke]),
)

const dbMigrate = Command.make('migrate', {}, () =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Running pending migrations from ${MIGRATIONS_FOLDER}…`)
    const db = yield* Db

    yield* Effect.tryPromise({
      try: () =>
        Promise.resolve(
          migrate(db.handle, {
            migrationsFolder: MIGRATIONS_FOLDER,
            migrationsTable: '__drizzle_migrations',
          }),
        ),
      catch: (e) => new Error(`migration failed: ${e instanceof Error ? e.message : String(e)}`),
    })

    yield* Effect.logInfo('Migrations complete.')
  }).pipe(Effect.provide(AdminLive)),
)

const db = Command.make('db').pipe(Command.withSubcommands([dbMigrate]))

const main = Command.make('parley-server').pipe(Command.withSubcommands([run, token, db]))

const cli = Command.run(main, { name: 'parley-server', version: '0.0.0' })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer)), BunRuntime.runMain)
