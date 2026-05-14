import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = homedir()

export const SERVICE_LABEL = 'parley-server'
export const LAUNCHD_LABEL = 'io.parley.server'

export const ENV_FILE = join(HOME, '.config', 'parley', 'server.env')

export const SYSTEMD_UNIT_PATH = join(
  HOME,
  '.config',
  'systemd',
  'user',
  `${SERVICE_LABEL}.service`,
)

export const LAUNCHD_PLIST_PATH = join(HOME, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`)
export const LAUNCHD_LOG_DIR = join(HOME, 'Library', 'Logs', 'parley')
export const LAUNCHD_OUT_LOG = join(LAUNCHD_LOG_DIR, 'server.out.log')
export const LAUNCHD_ERR_LOG = join(LAUNCHD_LOG_DIR, 'server.err.log')
