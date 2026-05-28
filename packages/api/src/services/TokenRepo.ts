import { eq } from 'drizzle-orm'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { authTokens } from '../db/schema/auth-tokens'
import { AuthTokenRecord } from '../domain/auth'
import type { AuthLabel } from '../domain/ids'
import { Db } from './Db'

export class TokenRepo extends Effect.Service<TokenRepo>()('TokenRepo', {
  accessors: true,
  dependencies: [Db.Default],
  effect: Effect.gen(function*() {
    const db = yield* Db

    const decode = (row: {
      label: string
      tokenHash: string
      createdAt: Date
      lastUsedAt: Date | null
    }) =>
      Schema.decodeUnknown(AuthTokenRecord)({
        label: row.label,
        tokenHash: row.tokenHash,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? undefined,
      })

    const findFirstBy = (column: typeof authTokens.label | typeof authTokens.tokenHash) =>
      Effect.fn('TokenRepo.findFirstBy')(function*(value: string) {
        const rows = yield* db.run((h) =>
          h.select().from(authTokens).where(eq(column, value)).limit(1)
        )

        const row = rows[0]
        return row ? Option.some(yield* decode(row)) : Option.none<AuthTokenRecord>()
      })

    const findByLabel = findFirstBy(authTokens.label)
    const findByHash = findFirstBy(authTokens.tokenHash)

    const insert = Effect.fn('TokenRepo.insert')(function*(label: AuthLabel, tokenHash: string) {
      yield* db.run((h) => h.insert(authTokens).values({ label, tokenHash, createdAt: new Date() }))
    })

    const deleteByLabel = Effect.fn('TokenRepo.deleteByLabel')(function*(label: AuthLabel) {
      yield* db.run((h) => h.delete(authTokens).where(eq(authTokens.label, label)))
    })

    const touchLastUsed = Effect.fn('TokenRepo.touchLastUsed')(function*(label: AuthLabel) {
      yield* db.run((h) =>
        h.update(authTokens).set({ lastUsedAt: new Date() }).where(eq(authTokens.label, label))
      )
    })

    const listAll = Effect.fn('TokenRepo.listAll')(function*() {
      const rows = yield* db.run((h) => h.select().from(authTokens))
      return yield* Effect.forEach(rows, decode)
    })

    return { findByLabel, findByHash, insert, deleteByLabel, touchLastUsed, listAll }
  }),
}) {}
