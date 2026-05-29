import { mkdir, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { ServerConfig } from '../config'
import {
  ENV_FILE,
  LAUNCHD_ERR_LOG,
  LAUNCHD_LABEL,
  LAUNCHD_LOG_DIR,
  LAUNCHD_OUT_LOG,
  LAUNCHD_PLIST_PATH,
  SERVICE_LABEL,
  SYSTEMD_UNIT_PATH,
} from './paths'
import { detectPlatform, type Platform } from './platform'
import { renderEnvFile, renderLaunchdPlist, renderSystemdUnit } from './templates'

export class ServiceCommandError extends Schema.TaggedError<ServiceCommandError>()(
  'ServiceCommandError',
  {
    message: Schema.String,
  },
) {}

class FileRemoveError extends Schema.TaggedError<FileRemoveError>()(
  'FileRemoveError',
  {
    path: Schema.String,
    detail: Schema.String,
    alreadyGone: Schema.Boolean,
  },
) {}

const resolveBinaryPath = Effect.fn('resolveBinaryPath')(function*() {
  const argv0 = process.argv[0]

  if (argv0?.endsWith(SERVICE_LABEL)) {
    return argv0
  }

  const proc = Bun.spawn(['which', SERVICE_LABEL], { stdout: 'pipe', stderr: 'ignore' })
  const out = yield* Effect.promise(() => new Response(proc.stdout).text())
  const code = yield* Effect.promise(() => proc.exited)

  if (code !== 0 || out.trim().length === 0) {
    return yield* new ServiceCommandError({
      message:
        `Could not locate the 'parley-server' binary on $PATH. Run 'bun run install:bin' from the repo first.`,
    })
  }

  return out.trim()
})

const writeFile = (path: string, content: string) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(path, content)
    },
    catch: (e) =>
      new ServiceCommandError({
        message: `Failed to write ${path}: ${e instanceof Error ? e.message : String(e)}`,
      }),
  })

export const isFileNotFound = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e
  && (e as { code?: unknown }).code === 'ENOENT'

const removeFile = (path: string) =>
  Effect.tryPromise({
    try: () => unlink(path),
    catch: (e) =>
      new FileRemoveError({
        path,
        detail: e instanceof Error ? e.message : String(e),
        alreadyGone: isFileNotFound(e),
      }),
  }).pipe(
    Effect.catchTag('FileRemoveError', (err) =>
      err.alreadyGone
        ? Effect.void
        : Effect.logWarning(`Could not remove ${err.path}: ${err.detail}`)),
  )

const ensureEnvFile = Effect.fn('ensureEnvFile')(function*() {
  const file = Bun.file(ENV_FILE)
  const exists = yield* Effect.promise(() => file.exists())

  if (exists) {
    return
  }

  const config = yield* ServerConfig

  const initial = renderEnvFile({
    PARLEY_PORT: String(config.port),
    PARLEY_BIND: config.bind,
    PARLEY_DB_FILE: config.dbFile,
    OTEL_EXPORTER_OTLP_ENDPOINT: Option.getOrUndefined(config.otlpEndpoint),
  })

  yield* writeFile(ENV_FILE, initial)
  yield* Effect.logInfo(`Wrote ${ENV_FILE}`)
})

const runCmd = (
  cmd: string[],
  opts: { capture?: boolean; failOnNonZero?: boolean } = {},
): Effect.Effect<{ code: number; stdout: string; stderr: string }, ServiceCommandError> =>
  Effect.gen(function*() {
    const { capture = false, failOnNonZero = false } = opts

    const proc = Bun.spawn(cmd, {
      stdout: capture ? 'pipe' : 'inherit',
      stderr: capture ? 'pipe' : 'inherit',
    })
    const stdout = capture ? yield* Effect.promise(() => new Response(proc.stdout).text()) : ''
    const stderr = capture ? yield* Effect.promise(() => new Response(proc.stderr).text()) : ''
    const code = yield* Effect.promise(() => proc.exited)

    if (code !== 0 && failOnNonZero) {
      return yield* new ServiceCommandError({
        message: `${cmd.join(' ')} failed with exit code ${code}${stderr ? `: ${stderr}` : ''}`,
      })
    }

    return { code, stdout, stderr }
  })

// A launchd domain always carries a real macOS user id (`gui/<uid>`). If the
// uid can't be determined we fail fast here rather than shipping a malformed
// `gui/` domain into launchctl, where it would surface as an opaque error.
const launchdDomain = Effect.fn('launchdDomain')(function*() {
  const uid = process.getuid?.()

  if (uid === undefined) {
    return yield* new ServiceCommandError({
      message: 'Cannot determine macOS user id for launchd domain (process.getuid unavailable).',
    })
  }

  return `gui/${uid}`
})

const launchdService = Effect.fn('launchdService')(function*() {
  const domain = yield* launchdDomain()

  return `${domain}/${LAUNCHD_LABEL}`
})

interface PlatformCommands {
  readonly install: (binary: string) => Effect.Effect<void, ServiceCommandError>
  readonly uninstall: Effect.Effect<void, ServiceCommandError>
  readonly start: Effect.Effect<void, ServiceCommandError>
  readonly stop: Effect.Effect<void, ServiceCommandError>
  readonly restart: Effect.Effect<void, ServiceCommandError>
  readonly status: Effect.Effect<void, ServiceCommandError>
  readonly logs: (opts: {
    follow: boolean
    lines: number
  }) => Effect.Effect<void, ServiceCommandError>
}

const serviceUnit = `${SERVICE_LABEL}.service`

const platformCommands: Record<Platform, PlatformCommands> = {
  systemd: {
    install: (binary) =>
      Effect.gen(function*() {
        yield* writeFile(SYSTEMD_UNIT_PATH, renderSystemdUnit(binary))
        yield* Effect.logInfo(`Wrote ${SYSTEMD_UNIT_PATH}`)
        yield* runCmd(['systemctl', '--user', 'daemon-reload'], { failOnNonZero: true })
        yield* runCmd(['systemctl', '--user', 'enable', '--now', serviceUnit], {
          failOnNonZero: true,
        })
        yield* Effect.logInfo(`Service installed and started.`)
        yield* Effect.logInfo(
          `Tip: 'loginctl enable-linger $USER' lets the service survive logout (one-time, off by default).`,
        )
      }),
    uninstall: Effect.gen(function*() {
      yield* runCmd(['systemctl', '--user', 'disable', '--now', serviceUnit], { capture: true })
      yield* removeFile(SYSTEMD_UNIT_PATH)
      yield* runCmd(['systemctl', '--user', 'daemon-reload'], { capture: true })
    }),
    start: runCmd(['systemctl', '--user', 'start', serviceUnit], { failOnNonZero: true }).pipe(
      Effect.asVoid,
    ),
    stop: runCmd(['systemctl', '--user', 'stop', serviceUnit], { failOnNonZero: true }).pipe(
      Effect.asVoid,
    ),
    restart: runCmd(['systemctl', '--user', 'restart', serviceUnit], {
      failOnNonZero: true,
    }).pipe(Effect.asVoid),
    status: runCmd(['systemctl', '--user', 'status', serviceUnit]).pipe(Effect.asVoid),
    logs: (opts) => {
      const args = [
        'journalctl',
        '--user',
        '-u',
        serviceUnit,
        '-n',
        String(opts.lines),
        opts.follow ? '-f' : '--no-pager',
      ]

      return runCmd(args).pipe(Effect.asVoid)
    },
  },
  launchd: {
    install: (binary) =>
      Effect.gen(function*() {
        yield* Effect.tryPromise({
          try: () => mkdir(LAUNCHD_LOG_DIR, { recursive: true }),
          catch: (e) =>
            new ServiceCommandError({
              message: `Failed to create ${LAUNCHD_LOG_DIR}: ${
                e instanceof Error ? e.message : String(e)
              }`,
            }),
        })

        yield* writeFile(LAUNCHD_PLIST_PATH, renderLaunchdPlist(binary))
        yield* Effect.logInfo(`Wrote ${LAUNCHD_PLIST_PATH}`)

        const domain = yield* launchdDomain()
        yield* runCmd(['launchctl', 'bootout', domain, LAUNCHD_PLIST_PATH], { capture: true })
        yield* runCmd(['launchctl', 'bootstrap', domain, LAUNCHD_PLIST_PATH], {
          failOnNonZero: true,
        })
        yield* Effect.logInfo(`Service installed and started.`)
      }),
    uninstall: Effect.gen(function*() {
      const domain = yield* launchdDomain()

      yield* runCmd(['launchctl', 'bootout', domain, LAUNCHD_PLIST_PATH], {
        capture: true,
      })
      yield* removeFile(LAUNCHD_PLIST_PATH)
    }),
    start: Effect.gen(function*() {
      const service = yield* launchdService()

      yield* runCmd(['launchctl', 'kickstart', '-k', service], { failOnNonZero: true })
    }),
    stop: Effect.gen(function*() {
      const service = yield* launchdService()

      yield* runCmd(['launchctl', 'kill', 'TERM', service], { failOnNonZero: true })
    }),
    restart: Effect.gen(function*() {
      const service = yield* launchdService()

      yield* runCmd(['launchctl', 'kickstart', '-k', service], { failOnNonZero: true })
    }),
    status: Effect.gen(function*() {
      const service = yield* launchdService()

      yield* runCmd(['launchctl', 'print', service])
    }),
    logs: (opts) => {
      const args = ['tail']

      if (opts.follow) {
        args.push('-F')
      }

      args.push('-n', String(opts.lines), LAUNCHD_ERR_LOG, LAUNCHD_OUT_LOG)
      return runCmd(args).pipe(Effect.asVoid)
    },
  },
}

const withPlatform = <A>(
  f: (commands: PlatformCommands) => Effect.Effect<A, ServiceCommandError>,
) =>
  Effect.gen(function*() {
    const platform = yield* detectPlatform()
    return yield* f(platformCommands[platform])
  }).pipe(Effect.withSpan('service.withPlatform'))

export const install = Effect.fn('service.install')(function*() {
  const binary = yield* resolveBinaryPath()
  yield* ensureEnvFile()
  yield* withPlatform((commands) => commands.install(binary))
})

export const uninstall = Effect.fn('service.uninstall')(function*(opts: { purge: boolean }) {
  yield* withPlatform((commands) => commands.uninstall)

  if (opts.purge) {
    yield* removeFile(ENV_FILE)
    yield* Effect.logInfo(`Removed ${ENV_FILE}`)
  }

  yield* Effect.logInfo('Service uninstalled.')
})

export const start = Effect.fn('service.start')(function*() {
  yield* withPlatform((commands) => commands.start)
})

export const stop = Effect.fn('service.stop')(function*() {
  yield* withPlatform((commands) => commands.stop)
})

export const restart = Effect.fn('service.restart')(function*() {
  yield* withPlatform((commands) => commands.restart)
})

export const status = Effect.fn('service.status')(function*() {
  yield* withPlatform((commands) => commands.status)
})

export const logs = Effect.fn('service.logs')(function*(opts: { follow: boolean; lines: number }) {
  yield* withPlatform((commands) => commands.logs(opts))
})
