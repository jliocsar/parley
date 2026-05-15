import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type EmbeddedMigration = {
  readonly tag: string
  readonly sql: readonly string[]
  readonly bps: boolean
  readonly folderMillis: number
  readonly hash: string
}

export function loadMigrations(): EmbeddedMigration[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const drizzleDir = join(here, '..', '..', 'drizzle')
  const journalPath = join(drizzleDir, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { tag: string; when: number; breakpoints: boolean }[]
  }

  return journal.entries.map((entry) => {
    const query = readFileSync(join(drizzleDir, `${entry.tag}.sql`), 'utf8')

    return {
      tag: entry.tag,
      sql: query.split('--> statement-breakpoint'),
      bps: entry.breakpoints,
      folderMillis: entry.when,
      hash: createHash('sha256').update(query).digest('hex'),
    }
  })
}
