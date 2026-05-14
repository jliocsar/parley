import { mkdir, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

import { Data, Effect } from 'effect'

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
import { detectPlatform } from './platform'
import { renderEnvFile, renderLaunchdPlist, renderSystemdUnit } from './templates'

export class ServiceCommandError extends Data.TaggedError('ServiceCommandError')<{
  readonly message: string
}> {}

const resolveBinaryPath = Effect.fn('resolveBinaryPath')(function* () {
  const argv0 = process.argv[0]

  if (argv0?.endsWith(SERVICE_LABEL)) {
    return argv0
  }

  const proc = Bun.spawn(['which', SERVICE_LABEL], { stdout: 'pipe', stderr: 'ignore' })
  const out = yield* Effect.promise(() => new Response(proc.stdout).text())
  const code = yield* Effect.promise(() => proc.exited)

  if (code !== 0 || out.trim().length === 0) {
    return yield* new ServiceCommandError({
      message: `Could not locate the 'parley-server' binary on $PATH. Run 'bun run install:bin' from the repo first.`,
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

const ensureEnvFile = Effect.fn('ensureEnvFile')(function* () {
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
  Effect.gen(function* () {
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

export const install = Effect.fn('service.install')(function* () {
  const platform = yield* detectPlatform()
  const binary = yield* resolveBinaryPath()
  yield* ensureEnvFile()

  if (platform === 'systemd') {
    yield* writeFile(SYSTEMD_UNIT_PATH, renderSystemdUnit(binary))
    yield* Effect.logInfo(`Wrote ${SYSTEMD_UNIT_PATH}`)
    yield* runCmd(['systemctl', '--user', 'daemon-reload'], { failOnNonZero: true })
    yield* runCmd(['systemctl', '--user', 'enable', '--now', `${SERVICE_LABEL}.service`], {
      failOnNonZero: true,
    })
    yield* Effect.logInfo(`Service installed and started.`)
    yield* Effect.logInfo(
      `Tip: 'loginctl enable-linger $USER' lets the service survive logout (one-time, off by default).`,
    )

    return
  }

  yield* Effect.tryPromise({
    try: () => mkdir(LAUNCHD_LOG_DIR, { recursive: true }),
    catch: (e) =>
      new ServiceCommandError({
        message: `Failed to create ${LAUNCHD_LOG_DIR}: ${e instanceof Error ? e.message : String(e)}`,
      }),
  })

  yield* writeFile(LAUNCHD_PLIST_PATH, renderLaunchdPlist(binary))
  yield* Effect.logInfo(`Wrote ${LAUNCHD_PLIST_PATH}`)

  const domain = launchdDomain()
  yield* runCmd(['launchctl', 'bootout', domain, LAUNCHD_PLIST_PATH], { capture: true })
  yield* runCmd(['launchctl', 'bootstrap', domain, LAUNCHD_PLIST_PATH], { failOnNonZero: true })
  yield* Effect.logInfo(`Service installed and started.`)
})

export const uninstall = Effect.fn('service.uninstall')(function* (opts: { purge: boolean }) {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    yield* runCmd(['systemctl', '--user', 'disable', '--now', `${SERVICE_LABEL}.service`], {
      capture: true,
    })
    yield* removeFile(SYSTEMD_UNIT_PATH)
    yield* runCmd(['systemctl', '--user', 'daemon-reload'], { capture: true })
  } else {
    yield* runCmd(['launchctl', 'bootout', launchdDomain(), LAUNCHD_PLIST_PATH], { capture: true })
    yield* removeFile(LAUNCHD_PLIST_PATH)
  }

  if (opts.purge) {
    yield* removeFile(ENV_FILE)
    yield* Effect.logInfo(`Removed ${ENV_FILE}`)
  }

  yield* Effect.logInfo('Service uninstalled.')
})

export const start = Effect.fn('service.start')(function* () {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    yield* runCmd(['systemctl', '--user', 'start', `${SERVICE_LABEL}.service`], {
      failOnNonZero: true,
    })
  } else {
    yield* runCmd(['launchctl', 'kickstart', '-k', `${launchdDomain()}/${LAUNCHD_LABEL}`], {
      failOnNonZero: true,
    })
  }
})

export const stop = Effect.fn('service.stop')(function* () {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    yield* runCmd(['systemctl', '--user', 'stop', `${SERVICE_LABEL}.service`], {
      failOnNonZero: true,
    })
  } else {
    yield* runCmd(['launchctl', 'kill', 'TERM', `${launchdDomain()}/${LAUNCHD_LABEL}`], {
      failOnNonZero: true,
    })
  }
})

export const restart = Effect.fn('service.restart')(function* () {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    yield* runCmd(['systemctl', '--user', 'restart', `${SERVICE_LABEL}.service`], {
      failOnNonZero: true,
    })
  } else {
    yield* runCmd(['launchctl', 'kickstart', '-k', `${launchdDomain()}/${LAUNCHD_LABEL}`], {
      failOnNonZero: true,
    })
  }
})

export const status = Effect.fn('service.status')(function* () {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    yield* runCmd(['systemctl', '--user', 'status', `${SERVICE_LABEL}.service`])
  } else {
    yield* runCmd(['launchctl', 'print', `${launchdDomain()}/${LAUNCHD_LABEL}`])
  }
})

export const logs = Effect.fn('service.logs')(function* (opts: { follow: boolean; lines: number }) {
  const platform = yield* detectPlatform()

  if (platform === 'systemd') {
    const args = [
      'journalctl',
      '--user',
      '-u',
      `${SERVICE_LABEL}.service`,
      '-n',
      String(opts.lines),
    ]

    if (opts.follow) {
      args.push('-f')
    } else {
      args.push('--no-pager')
    }

    yield* runCmd(args)
    return
  }

  const tailArgs = ['tail']

  if (opts.follow) {
    tailArgs.push('-F')
  }

  tailArgs.push('-n', String(opts.lines), LAUNCHD_ERR_LOG, LAUNCHD_OUT_LOG)
  yield* runCmd(tailArgs)
})
