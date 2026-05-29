import { BearerToken } from '@parley/api/domain'
import { TOML } from 'bun'
import * as Schema from 'effect/Schema'

/**
 * The reserved name for the auto-provisioned loopback server entry. Both the
 * server-side bootstrap (`ConfigBootstrap.ensureLocalServerEntry`) and the CLI
 * resolver fallback key off this name, so it must stay a single constant.
 */
export const LOCAL_SERVER_NAME = 'local'

/**
 * Default WebSocket port. Mirrored by `ServerConfig.port`'s `Config.withDefault`
 * so the operator's bind port and the client's fallback URL never desync.
 */
export const DEFAULT_PORT = 7539

/** Loopback WebSocket URL for the given port. */
export const localServerUrl = (port: number) => `ws://127.0.0.1:${port}`

/** A `{ url }` server entry pointing at the local loopback server on `port`. */
export const localServerEntry = (port: number): ServerEntry => ({ url: localServerUrl(port) })

/**
 * Conservative loopback predicate. Matches the forms a server can bind to and
 * still be reachable only from the local host:
 * - `127.0.0.1` and the whole `127.0.0.0/8` block (`127.*`)
 * - `::1` (IPv6 loopback)
 * - `::ffff:127.0.0.1` (IPv4-mapped IPv6 loopback)
 * - bare `localhost`
 *
 * This gates `authEnabled = !isLoopback(bind)`; a single shared definition keeps
 * the server's auth toggle and the client's bootstrap in lockstep.
 */
export const isLoopback = (bind: string) =>
  bind === '127.0.0.1'
  || bind === '::1'
  || bind === '::ffff:127.0.0.1'
  || bind === 'localhost'
  || bind.startsWith('127.')

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

export const emptyServersConfig = (): ServersConfigShape => ({ default: undefined, servers: {} })

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
