import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type { IssuedToken } from '../domain/auth'
import type { AuthLabel, BearerToken } from '../domain/ids'
import { TokenRevokedError } from '../errors/auth'
import { CryptoService } from './Crypto'
import { TokenRepo } from './TokenRepo'

export class TokenService extends Effect.Service<TokenService>()('TokenService', {
  accessors: true,
  dependencies: [TokenRepo.Default, CryptoService.Default],
  effect: Effect.gen(function*() {
    const repo = yield* TokenRepo
    const crypto = yield* CryptoService

    const issue = Effect.fn('TokenService.issue')(function*(label: AuthLabel) {
      const token = yield* crypto.issueBearerToken()
      const hash = yield* crypto.hashToken(token)

      yield* repo.insert(label, hash)

      const record = yield* repo.findByLabel(label)
      const createdAt = Option.match(record, {
        onNone: () => DateTime.unsafeNow(),
        onSome: (r) => r.createdAt,
      })

      return { label, token, createdAt } satisfies IssuedToken
    })

    const revoke = Effect.fn('TokenService.revoke')(function*(label: AuthLabel) {
      yield* repo.deleteByLabel(label)
    })

    const list = Effect.fn('TokenService.list')(function*() {
      return yield* repo.listAll()
    })

    const verify = Effect.fn('TokenService.verify')(function*(presented: BearerToken) {
      const hash = yield* crypto.hashToken(presented)
      const record = yield* repo.findByHash(hash)

      return yield* Option.match(record, {
        onNone: () =>
          Effect.fail(
            new TokenRevokedError({
              label: '',
              message: 'Token is not recognised or has been revoked',
            }),
          ),
        onSome: (r) => repo.touchLastUsed(r.label).pipe(Effect.as(r.label)),
      })
    })

    return { issue, revoke, list, verify }
  }),
}) {}
