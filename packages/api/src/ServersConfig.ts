import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { BearerToken } from '@parley/api/domain'
import { TOML } from 'bun'
import { Effect, Option, Schema } from 'effect'

const CONFIG_PATH = join(homedir(), '.config', 'parley', 'servers.toml')

export const ServerEntry = Schema.Struct({
  url: Schema.String,
  token: Schema.optional(BearerToken),
})
export type ServerEntry = Schema.Schema.Type<typeof ServerEntry>

export const ServersConfigSchema = Schema.Struct({
  default: Schema.optional(Schema.String),
  servers: Schema.Record({ key: Schema.String, value: ServerEntry }),
})
export type ServersConfigShape = Schema.Schema.Type<typeof ServersConfigSchema>

export const emptyServersConfig = (): ServersConfigShape => ({
  default: undefined,
  servers: {},
})

export const parseServersToml = (text: string) =>
  Schema.decodeUnknown(ServersConfigSchema)(TOML.parse(text))

export const renderServersToml = (cfg: ServersConfigShape) => {
  const lines: string[] = []

  if (cfg.default) {
    lines.push(`default = ${JSON.stringify(cfg.default)}`)
    lines.push('')
  }

  for (const [name, entry] of Object.entries(cfg.servers)) {
    lines.push(`[servers.${name}]`)
    lines.push(`url = ${JSON.stringify(entry.url)}`)

    if (entry.token) {
      lines.push(`token = ${JSON.stringify(entry.token)}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

export class ServersConfig extends Effect.Service<ServersConfig>()('ServersConfig', {
  accessors: true,
  effect: Effect.gen(function* () {
    const read = Effect.fn('ServersConfig.read')(function* () {
      const file = Bun.file(CONFIG_PATH)
      const exists = yield* Effect.promise(() => file.exists())

      if (!exists) {
        return emptyServersConfig()
      }

      const text = yield* Effect.promise(() => file.text())
      return yield* parseServersToml(text)
    })

    const write = Effect.fn('ServersConfig.write')(function* (cfg: ServersConfigShape) {
      yield* Effect.promise(() => mkdir(dirname(CONFIG_PATH), { recursive: true }))
      yield* Effect.promise(() => Bun.write(CONFIG_PATH, renderServersToml(cfg)))
    })

    const list = Effect.fn('ServersConfig.list')(function* () {
      const cfg = yield* read()
      return cfg
    })

    const resolve = Effect.fn('ServersConfig.resolve')(function* (name: Option.Option<string>) {
      const cfg = yield* read()

      const chosen = Option.match(name, {
        onNone: () => cfg.default ?? 'local',
        onSome: (n) => n,
      })

      const entry = cfg.servers[chosen]

      if (!entry) {
        if (chosen === 'local') {
          return {
            name: 'local',
            url: 'ws://127.0.0.1:7539',
            token: Option.none<BearerToken>(),
          }
        }

        return yield* Effect.fail(new Error(`Server "${chosen}" not configured.`))
      }

      return {
        name: chosen,
        url: entry.url,
        token: entry.token ? Option.some(entry.token) : Option.none<BearerToken>(),
      }
    })

    const add = Effect.fn('ServersConfig.add')(function* (
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

    const remove = Effect.fn('ServersConfig.remove')(function* (name: string) {
      const cfg = yield* read()
      const { [name]: _removed, ...rest } = cfg.servers
      const next: ServersConfigShape = {
        default: cfg.default === name ? undefined : cfg.default,
        servers: rest,
      }

      yield* write(next)
    })

    const setDefault = Effect.fn('ServersConfig.setDefault')(function* (name: string) {
      const cfg = yield* read()

      if (!cfg.servers[name]) {
        return yield* Effect.fail(new Error(`Server "${name}" not configured.`))
      }

      yield* write({ ...cfg, default: name })
    })

    return { list, resolve, add, remove, setDefault }
  }),
}) {}
