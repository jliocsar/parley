#!/usr/bin/env bun
import { Command } from '@effect/cli'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import { Effect, Layer } from 'effect'

import { mcp } from '../commands/mcp'
import { servers } from '../commands/servers'

const main = Command.make('parley').pipe(Command.withSubcommands([mcp, servers]))

const cli = Command.run(main, { name: 'parley', version: '0.0.0' })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer)), BunRuntime.runMain)
