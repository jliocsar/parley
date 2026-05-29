import * as Config from 'effect/Config'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { DEFAULT_PORT, isLoopback } from './servers-config'

const DEFAULT_DB_FILE = join(homedir(), '.local', 'share', 'parley', 'parley.db')

export const ServerConfig = Config.all({
  port: Config.integer('PARLEY_PORT').pipe(Config.withDefault(DEFAULT_PORT)),
  bind: Config.string('PARLEY_BIND').pipe(Config.withDefault('127.0.0.1')),
  dbFile: Config.string('PARLEY_DB_FILE').pipe(Config.withDefault(DEFAULT_DB_FILE)),
  otlpEndpoint: Config.option(Config.string('OTEL_EXPORTER_OTLP_ENDPOINT')),
}).pipe(
  Config.map((cfg) => ({
    ...cfg,
    authEnabled: !isLoopback(cfg.bind),
  })),
)

export type ServerConfig = Config.Config.Success<typeof ServerConfig>
