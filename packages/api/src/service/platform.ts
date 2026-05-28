import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
export type Platform = 'systemd' | 'launchd'

export class UnsupportedPlatformError extends Data.TaggedError('UnsupportedPlatformError')<{
  readonly message: string
}> {}

export const detectPlatform = Effect.fn('detectPlatform')(function*() {
  if (process.platform === 'darwin') {
    return 'launchd'
  }

  if (process.platform === 'linux') {
    const proc = Bun.spawn(['systemctl', '--user', '--version'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    const code = yield* Effect.promise(() => proc.exited)

    if (code !== 0) {
      return yield* new UnsupportedPlatformError({
        message:
          'systemd --user is not available on this system. Install Parley as a service is not supported here — you can still run \'parley-server run\' directly.',
      })
    }

    return 'systemd'
  }

  return yield* new UnsupportedPlatformError({
    message:
      `Unsupported platform: ${process.platform}. Service install is available on Linux (systemd --user) and macOS (launchd) only.`,
  })
})
