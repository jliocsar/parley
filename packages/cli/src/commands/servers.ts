import { Args, Command, Options } from '@effect/cli'
import { BearerToken } from '@parley/api/domain'
import { Effect, Option } from 'effect'

import { ServersConfig } from '../ServersConfig'

const nameArg = Args.text({ name: 'name' })
const urlArg = Args.text({ name: 'url' })

const tokenOption = Options.text('token').pipe(
  Options.withAlias('t'),
  Options.optional,
  Options.withDescription('Bearer token for the server. Required for non-loopback URLs.'),
)

const list = Command.make('list', {}, () =>
  Effect.gen(function* () {
    const cfg = yield* ServersConfig
    const data = yield* cfg.list()
    yield* Effect.logInfo(`default: ${data.default ?? '(none)'}`)

    for (const [name, entry] of Object.entries(data.servers)) {
      yield* Effect.logInfo(`  ${name}\t${entry.url}\ttoken=${entry.token ? 'yes' : 'no'}`)
    }
  }).pipe(Effect.provide(ServersConfig.Default)),
)

const add = Command.make(
  'add',
  { name: nameArg, url: urlArg, token: tokenOption },
  ({ name, url, token }) =>
    Effect.gen(function* () {
      const cfg = yield* ServersConfig
      const tokenOpt = (token as Option.Option<string>).pipe(Option.map((t) => BearerToken.make(t)))
      yield* cfg.add(name, url, tokenOpt)
      yield* Effect.logInfo(`Added server "${name}".`)
    }).pipe(Effect.provide(ServersConfig.Default)),
)

const remove = Command.make('remove', { name: nameArg }, ({ name }) =>
  Effect.gen(function* () {
    const cfg = yield* ServersConfig
    yield* cfg.remove(name)
    yield* Effect.logInfo(`Removed server "${name}".`)
  }).pipe(Effect.provide(ServersConfig.Default)),
)

const setDefault = Command.make('default', { name: nameArg }, ({ name }) =>
  Effect.gen(function* () {
    const cfg = yield* ServersConfig
    yield* cfg.setDefault(name)
    yield* Effect.logInfo(`Default server is now "${name}".`)
  }).pipe(Effect.provide(ServersConfig.Default)),
)

export const servers = Command.make('servers').pipe(
  Command.withSubcommands([list, add, remove, setDefault]),
)
