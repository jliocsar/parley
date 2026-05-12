import { homedir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'

const DEFAULT_SERVERS_CONFIG_PATH = join(homedir(), '.config', 'parley', 'servers.toml')

const isLoopback = (bind: string) =>
  bind === '127.0.0.1' || bind === '::1' || bind === 'localhost' || bind.startsWith('127.')

export const renderLocalServersToml = (url: string) =>
  ['default = "local"', '', '[servers.local]', `url = ${JSON.stringify(url)}`, ''].join('\n')

export type EnsureLocalServerEntryParams = {
  readonly bind: string
  readonly port: number
  readonly path?: string
}

export const ensureLocalServerEntry = Effect.fn('ensureLocalServerEntry')(function* (
  params: EnsureLocalServerEntryParams,
) {
  if (!isLoopback(params.bind)) {
    return { written: false as const, reason: 'non-loopback' as const }
  }

  const path = params.path ?? DEFAULT_SERVERS_CONFIG_PATH
  const file = Bun.file(path)
  const exists = yield* Effect.promise(() => file.exists())

  if (exists) {
    return { written: false as const, reason: 'already-exists' as const, path }
  }

  const url = `ws://127.0.0.1:${params.port}`
  yield* Effect.promise(() => Bun.write(path, renderLocalServersToml(url)))
  yield* Effect.logInfo(`Wrote default client config at ${path} → server "local" = ${url}`)

  return { written: true as const, path, url }
})
