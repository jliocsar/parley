import { homedir } from 'node:os'
import { join } from 'node:path'

import * as Effect from 'effect/Effect'

import {
  isLoopback,
  LOCAL_SERVER_NAME,
  localServerEntry,
  localServerUrl,
  renderServersToml,
  type ServersConfigShape,
} from '../servers-config'

const DEFAULT_SERVERS_CONFIG_PATH = join(homedir(), '.config', 'parley', 'servers.toml')

export interface EnsureLocalServerEntryParams {
  readonly bind: string
  readonly port: number
  readonly path?: string
}

export const ensureLocalServerEntry = Effect.fn('ensureLocalServerEntry')(function*(
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

  const url = localServerUrl(params.port)
  const config: ServersConfigShape = {
    default: LOCAL_SERVER_NAME,
    servers: { [LOCAL_SERVER_NAME]: localServerEntry(params.port) },
  }

  yield* Effect.promise(() => Bun.write(path, renderServersToml(config)))
  yield* Effect.logInfo(
    `Wrote default client config at ${path} → server "${LOCAL_SERVER_NAME}" = ${url}`,
  )

  return { written: true as const, path, url }
})
