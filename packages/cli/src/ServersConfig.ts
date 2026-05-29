import type { BearerToken } from '@parley/api/domain'
import {
  DEFAULT_PORT,
  emptyServersConfig,
  LOCAL_SERVER_NAME,
  localServerUrl,
  parseServersToml,
  renderServersToml,
  type ServersConfigShape,
} from '@parley/api/servers-config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export {
  emptyServersConfig,
  parseServersToml,
  renderServersToml,
  type ServerEntry,
  ServersConfigSchema,
  type ServersConfigShape,
} from '@parley/api/servers-config'

const CONFIG_PATH = join(homedir(), '.config', 'parley', 'servers.toml')

export class ServerNotConfiguredError extends Schema.TaggedError<ServerNotConfiguredError>()(
  'ServerNotConfiguredError',
  {
    name: Schema.String,
    message: Schema.String,
  },
) {}

export class ServersConfig extends Effect.Service<ServersConfig>()('ServersConfig', {
  accessors: true,
  effect: Effect.gen(function*() {
    const read = Effect.fn('ServersConfig.read')(function*() {
      const file = Bun.file(CONFIG_PATH)
      const exists = yield* Effect.promise(() => file.exists())

      if (!exists) {
        return emptyServersConfig()
      }

      const text = yield* Effect.promise(() => file.text())

      return yield* parseServersToml(text)
    })

    const write = Effect.fn('ServersConfig.write')(function*(cfg: ServersConfigShape) {
      yield* Effect.promise(() => mkdir(dirname(CONFIG_PATH), { recursive: true }))
      yield* Effect.promise(() => Bun.write(CONFIG_PATH, renderServersToml(cfg)))
    })

    const list = Effect.fn('ServersConfig.list')(function*() {
      const cfg = yield* read()

      return cfg
    })

    const resolve = Effect.fn('ServersConfig.resolve')(function*(name: Option.Option<string>) {
      const cfg = yield* read()

      const chosen = Option.match(name, {
        onNone: () => cfg.default ?? LOCAL_SERVER_NAME,
        onSome: (n) => n,
      })

      const entry = cfg.servers[chosen]

      if (!entry) {
        if (chosen === LOCAL_SERVER_NAME) {
          return {
            name: LOCAL_SERVER_NAME,
            url: localServerUrl(DEFAULT_PORT),
            token: Option.none<BearerToken>(),
          }
        }

        return yield* Effect.fail(
          new ServerNotConfiguredError({
            name: chosen,
            message: `Server "${chosen}" not configured.`,
          }),
        )
      }

      return {
        name: chosen,
        url: entry.url,
        token: entry.token ? Option.some(entry.token) : Option.none<BearerToken>(),
      }
    })

    const add = Effect.fn('ServersConfig.add')(function*(
      name: string,
      url: string,
      token: Option.Option<BearerToken>,
    ) {
      const cfg = yield* read()
      const next: ServersConfigShape = {
        default: cfg.default ?? name,
        servers: {
          ...cfg.servers,
          [name]: Option.isSome(token) ? { url, token: token.value } : { url },
        },
      }

      yield* write(next)
    })

    const remove = Effect.fn('ServersConfig.remove')(function*(name: string) {
      const cfg = yield* read()
      const { [name]: _removed, ...rest } = cfg.servers
      const next: ServersConfigShape = {
        default: cfg.default === name ? undefined : cfg.default,
        servers: rest,
      }

      yield* write(next)
    })

    const setDefault = Effect.fn('ServersConfig.setDefault')(function*(name: string) {
      const cfg = yield* read()

      if (!cfg.servers[name]) {
        return yield* Effect.fail(
          new ServerNotConfiguredError({
            name,
            message: `Server "${name}" not configured.`,
          }),
        )
      }

      yield* write({ ...cfg, default: name })
    })

    return { list, resolve, add, remove, setDefault }
  }),
}) {}
