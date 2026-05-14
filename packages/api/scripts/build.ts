#!/usr/bin/env bun
import { join } from 'node:path'

import { comptime } from 'comptime.ts/bun'

const root = new URL('..', import.meta.url).pathname
const outfile = join(root, 'dist', 'parley-server')

const result = await Bun.build({
  entrypoints: [join(root, 'src/bin/parley-server.ts')],
  target: 'bun',
  format: 'esm',
  minify: true,
  bytecode: true,
  compile: { outfile },
  plugins: [comptime()],
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Built ${outfile}`)
