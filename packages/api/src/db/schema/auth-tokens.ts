import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const authTokens = sqliteTable('auth_tokens', {
  label: text('label').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
})

export type AuthTokenRow = typeof authTokens.$inferSelect
export type AuthTokenInsert = typeof authTokens.$inferInsert
