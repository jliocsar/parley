import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import { ClientLive, ParleyClient } from '@parley/client'
import { McpLive, McpServer } from '@parley/mcp'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { ServersConfig } from '../ServersConfig'

const serverOption = Options.text('server').pipe(
  Options.withAlias('s'),
  Options.optional,
  Options.withDescription('Name of the Parley server to connect to (default: configured default)'),
)

export const mcp = Command.make(
  'mcp',
  { server: serverOption },
  ({ server }) =>
    Effect.gen(function*() {
      const cfg = yield* ServersConfig
      const target = yield* cfg.resolve(server)

      const client = yield* ParleyClient
      yield* client.connect({ url: target.url, authToken: target.token })

      yield* McpServer
      return yield* Effect.never
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(McpLive, ClientLive, ServersConfig.Default)),
    ),
)
