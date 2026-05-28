#!/usr/bin/env bun
import * as Command from '@effect/cli/Command'
import * as BunContext from '@effect/platform-bun/BunContext'
import * as BunRuntime from '@effect/platform-bun/BunRuntime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import pkg from '../../package.json' with { type: 'comptime+json' }
import { mcp } from '../commands/mcp'
import { servers } from '../commands/servers'

const main = Command.make('parley').pipe(Command.withSubcommands([mcp, servers]))

const cli = Command.run(main, { name: 'parley', version: pkg.version })

cli(process.argv).pipe(Effect.provide(Layer.mergeAll(BunContext.layer)), BunRuntime.runMain)
