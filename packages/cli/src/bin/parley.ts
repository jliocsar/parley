#!/usr/bin/env bun
import { Command } from '@effect/cli'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import pkg from '../../package.json' with { type: 'comptime+json' }
import { mcp } from '../commands/mcp'
import { servers } from '../commands/servers'

const main = Command.make('parley').pipe(Command.withSubcommands([mcp, servers]))

const cli = Command.run(main, { name: 'parley', version: pkg.version })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer)), BunRuntime.runMain)
