#!/usr/bin/env bun
import { Command, Options } from '@effect/cli'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import pkg from '../../package.json' with { type: 'comptime+json' }
import { ServerConfig } from '../config'
import { AuthLabel } from '../domain/ids'
import { AdminLive, ServerLive } from '../layers'
import { runEmbeddedMigrations } from '../migrations/run'
import { WsServer } from '../server/WsServer'
import { service } from '../service/commands'
import { ensureLocalServerEntry } from '../services/ConfigBootstrap'
import { Db } from '../services/Db'
import { TokenService } from '../services/TokenService'

const run = Command.make('run', {}, () =>
  Effect.gen(function* () {
    const cfg = yield* ServerConfig
    yield* ensureLocalServerEntry({ bind: cfg.bind, port: cfg.port })

    const db = yield* Db
    yield* runEmbeddedMigrations(db.client)

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
    const db = yield* Db
    const result = yield* runEmbeddedMigrations(db.client)

    if (result.applied === 0) {
      yield* Effect.logInfo(`Already up to date (${result.total} migration(s) embedded).`)
    } else {
      yield* Effect.logInfo(`Applied ${result.applied} migration(s).`)
    }
  }).pipe(Effect.provide(AdminLive)),
)

const db = Command.make('db').pipe(Command.withSubcommands([dbMigrate]))

const main = Command.make('parley-server').pipe(Command.withSubcommands([run, token, db, service]))

const cli = Command.run(main, { name: 'parley-server', version: pkg.version })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer)), BunRuntime.runMain)
