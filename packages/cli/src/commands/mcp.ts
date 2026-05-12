import { Command, Options } from '@effect/cli'
import { ClientLive, ParleyClient } from '@parley/client'
import { McpLive, McpServer } from '@parley/mcp'
import { Effect, Layer, type Option } from 'effect'

import { ServersConfig } from '../ServersConfig'

const serverOption = Options.text('server').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Name of the Parley server to connect to (default: configured default)'),
)

export const mcp = Command.make('mcp', { server: serverOption }, ({ server }) =>
  Effect.gen(function* () {
    const cfg = yield* ServersConfig
    const target = yield* cfg.resolve(server as Option.Option<string>)

    const client = yield* ParleyClient
    yield* client.connect({ url: target.url, authToken: target.token })

    yield* McpServer
    return yield* Effect.never
  }).pipe(
    Effect.scoped,
    Effect.provide(Layer.mergeAll(McpLive, ClientLive, ServersConfig.Default)),
  ),
)
