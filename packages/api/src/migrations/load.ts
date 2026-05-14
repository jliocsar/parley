import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type EmbeddedMigration = {
  readonly tag: string
  readonly sql: string
}

export function loadMigrations(): EmbeddedMigration[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const drizzleDir = join(here, '..', '..', 'drizzle')
  const journal = JSON.parse(readFileSync(join(drizzleDir, 'meta', '_journal.json'), 'utf8')) as {
    entries: { tag: string }[]
  }

  return journal.entries.map((entry) => ({
    tag: entry.tag,
    sql: readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8'),
  }))
}
