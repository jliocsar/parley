import { mkdir, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

import * as Data from 'effect/Data'

import * as Effect from 'effect/Effect'
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

export class ServiceCommandError extends Data.TaggedError('ServiceCommandError')<{
  readonly message: string
}> {}

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

const removeFile = (path: string) =>
  Effect.tryPromise({
    try: () => unlink(path),
    catch: () => new ServiceCommandError({ message: `Could not remove ${path}` }),
  }).pipe(Effect.catchAll(() => Effect.void))

const ensureEnvFile = Effect.fn('ensureEnvFile')(function*() {
  const file = Bun.file(ENV_FILE)
  const exists = yield* Effect.promise(() => file.exists())

  if (exists) {
    return
  }

  const initial = renderEnvFile({
    PARLEY_PORT: process.env.PARLEY_PORT,
    PARLEY_BIND: process.env.PARLEY_BIND,
    PARLEY_DB_FILE: process.env.PARLEY_DB_FILE,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  })

  yield* writeFile(ENV_FILE, initial)
  yield* Effect.logInfo(`Wrote ${ENV_FILE}`)
})

const runCmd = (
  cmd: string[],
  opts: { capture?: boolean; failOnNonZero?: boolean } = {},
): Effect.Effect<{ code: number; stdout: string; stderr: string }, ServiceCommandError> =>
  Effect.gen(function*() {
    const proc = Bun.spawn(cmd, {
      stdout: opts.capture ? 'pipe' : 'inherit',
      stderr: opts.capture ? 'pipe' : 'inherit',
    })
    const stdout = opts.capture ? yield* Effect.promise(() => new Response(proc.stdout).text()) : ''
    const stderr = opts.capture ? yield* Effect.promise(() => new Response(proc.stderr).text()) : ''
    const code = yield* Effect.promise(() => proc.exited)

    if (code !== 0 && (opts.failOnNonZero ?? false)) {
      return yield* new ServiceCommandError({
        message: `${cmd.join(' ')} failed with exit code ${code}${stderr ? `: ${stderr}` : ''}`,
      })
    }

    return { code, stdout, stderr }
  })

const launchdDomain = () => `gui/${process.getuid?.() ?? ''}`

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
const launchdService = () => `${launchdDomain()}/${LAUNCHD_LABEL}`

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

        const domain = launchdDomain()
        yield* runCmd(['launchctl', 'bootout', domain, LAUNCHD_PLIST_PATH], { capture: true })
        yield* runCmd(['launchctl', 'bootstrap', domain, LAUNCHD_PLIST_PATH], {
          failOnNonZero: true,
        })
        yield* Effect.logInfo(`Service installed and started.`)
      }),
    uninstall: Effect.gen(function*() {
      yield* runCmd(['launchctl', 'bootout', launchdDomain(), LAUNCHD_PLIST_PATH], {
        capture: true,
      })
      yield* removeFile(LAUNCHD_PLIST_PATH)
    }),
    start: runCmd(['launchctl', 'kickstart', '-k', launchdService()], {
      failOnNonZero: true,
    }).pipe(Effect.asVoid),
    stop: runCmd(['launchctl', 'kill', 'TERM', launchdService()], {
      failOnNonZero: true,
    }).pipe(Effect.asVoid),
    restart: runCmd(['launchctl', 'kickstart', '-k', launchdService()], {
      failOnNonZero: true,
    }).pipe(Effect.asVoid),
    status: runCmd(['launchctl', 'print', launchdService()]).pipe(Effect.asVoid),
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
