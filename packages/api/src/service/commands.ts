import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import * as ops from './operations'

const purgeOption = Options.boolean('purge').pipe(
  Options.withDescription('Also remove ~/.config/parley/server.env (never touches the DB).'),
)

const followOption = Options.boolean('follow').pipe(
  Options.withAlias('f'),
  Options.withDefault(true),
  Options.withDescription('Follow log output (default: true; use --no-follow to disable).'),
)

const linesOption = Options.integer('lines').pipe(
  Options.withAlias('n'),
  Options.withDefault(200),
  Options.withDescription('Number of log lines to show before tailing.'),
)

const installCmd = Command.make('install', {}, () => ops.install())

const uninstallCmd = Command.make(
  'uninstall',
  { purge: purgeOption },
  ({ purge }) => ops.uninstall({ purge }),
)

const startCmd = Command.make('start', {}, () => ops.start())
const stopCmd = Command.make('stop', {}, () => ops.stop())
const restartCmd = Command.make('restart', {}, () => ops.restart())
const statusCmd = Command.make('status', {}, () => ops.status())

const logsCmd = Command.make(
  'logs',
  { follow: followOption, lines: linesOption },
  ({ follow, lines }) => ops.logs({ follow, lines }),
)

export const service = Command.make('service').pipe(
  Command.withSubcommands([
    installCmd,
    uninstallCmd,
    startCmd,
    stopCmd,
    restartCmd,
    statusCmd,
    logsCmd,
  ]),
)
