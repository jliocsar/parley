import { describe, expect, it } from 'bun:test'
import { BearerToken } from '@parley/api/domain'
import { Effect } from 'effect'
import { parseServersToml, renderServersToml } from './ServersConfig'

const run = <A, E>(eff: Effect.Effect<A, E, never>) => Effect.runPromise(eff)

describe('ServersConfig TOML helpers', () => {
  it('parses servers.toml with Bun.TOML and validates the schema', async () => {
    const cfg = await run(
      parseServersToml(
        [
          'default = "prod"',
          '',
          '[servers.prod]',
          'url = "wss://parley.example.com"',
          'token = "parley_tok_abcdefghijklmnopqrstuvwxyzABCDEF"',
          '',
        ].join('\n'),
      ),
    )

    expect(cfg.default).toBe('prod')
    expect(cfg.servers.prod?.url).toBe('wss://parley.example.com')
    expect(cfg.servers.prod?.token).toBe(
      BearerToken.make('parley_tok_abcdefghijklmnopqrstuvwxyzABCDEF'),
    )
  })

  it('renders parseable TOML for entries with and without tokens', async () => {
    const rendered = renderServersToml({
      default: 'local',
      servers: {
        local: { url: 'ws://127.0.0.1:6969' },
        prod: {
          url: 'wss://parley.example.com',
          token: BearerToken.make('parley_tok_abcdefghijklmnopqrstuvwxyzABCDEF'),
        },
      },
    })

    const parsed = await run(parseServersToml(rendered))

    expect(parsed.default).toBe('local')
    expect(parsed.servers.local?.url).toBe('ws://127.0.0.1:6969')
    expect(parsed.servers.prod?.token).toBe(
      BearerToken.make('parley_tok_abcdefghijklmnopqrstuvwxyzABCDEF'),
    )
  })
})
