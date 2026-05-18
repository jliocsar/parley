import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'

import { ensureLocalServerEntry, renderLocalServersToml } from './ConfigBootstrap'

let workdir: string
let path: string

beforeEach(() => {
  workdir = mkdtempSync(join(tmpdir(), 'parley-bootstrap-'))
  path = join(workdir, 'servers.toml')
})

afterEach(() => {
  rmSync(workdir, { recursive: true, force: true })
})

const run = <A, E>(eff: Effect.Effect<A, E, never>) => Effect.runPromise(eff)

describe('ensureLocalServerEntry', () => {
  it('writes servers.toml with the local entry on first boot when bound to loopback', async () => {
    const result = await run(ensureLocalServerEntry({ bind: '127.0.0.1', port: 7539, path }))

    expect(result.written).toBe(true)
    const written = await Bun.file(path).text()
    expect(written).toContain('default = "local"')
    expect(written).toContain('[servers.local]')
    expect(written).toContain('url = "ws://127.0.0.1:7539"')
  })

  it('uses the configured port in the local URL', async () => {
    await run(ensureLocalServerEntry({ bind: '127.0.0.1', port: 7000, path }))
    const written = await Bun.file(path).text()
    expect(written).toContain('url = "ws://127.0.0.1:7000"')
  })

  it('does not overwrite an existing config file', async () => {
    const original = 'default = "prod"\n\n[servers.prod]\nurl = "wss://example.com"\n'
    await Bun.write(path, original)

    const result = await run(ensureLocalServerEntry({ bind: '127.0.0.1', port: 7539, path }))

    expect(result.written).toBe(false)

    if (!result.written) {
      expect(result.reason).toBe('already-exists')
    }

    const after = await Bun.file(path).text()
    expect(after).toBe(original)
  })

  it('skips write entirely on non-loopback binds', async () => {
    const result = await run(ensureLocalServerEntry({ bind: '0.0.0.0', port: 7539, path }))

    expect(result.written).toBe(false)

    if (!result.written) {
      expect(result.reason).toBe('non-loopback')
    }

    expect(await Bun.file(path).exists()).toBe(false)
  })

  it('treats ::1 and localhost as loopback', async () => {
    await run(ensureLocalServerEntry({ bind: '::1', port: 7539, path }))
    expect(await Bun.file(path).exists()).toBe(true)

    rmSync(path)

    await run(ensureLocalServerEntry({ bind: 'localhost', port: 7539, path }))
    expect(await Bun.file(path).exists()).toBe(true)
  })
})

describe('renderLocalServersToml', () => {
  it('produces a parseable TOML snippet with default and server entry', () => {
    const toml = renderLocalServersToml('ws://127.0.0.1:7539')
    expect(toml).toBe(
      ['default = "local"', '', '[servers.local]', 'url = "ws://127.0.0.1:7539"', ''].join('\n'),
    )
  })
})
