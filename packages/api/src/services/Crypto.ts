import * as Effect from 'effect/Effect'

import { BearerToken, MessageId, ReconnectToken, RoomId } from '../domain/ids'

const randomBase64Url = (bytes: number) =>
  Effect.sync(() => {
    const buf = new Uint8Array(bytes)
    crypto.getRandomValues(buf)
    return Buffer.from(buf).toString('base64url')
  })

export class CryptoService extends Effect.Service<CryptoService>()('CryptoService', {
  accessors: true,
  effect: Effect.gen(function*() {
    const issueBearerToken = Effect.fn('CryptoService.issueBearerToken')(function*() {
      const b64 = yield* randomBase64Url(32)
      return BearerToken.make(`parley_tok_${b64}`)
    })

    const issueReconnectToken = Effect.fn('CryptoService.issueReconnectToken')(function*() {
      const b64 = yield* randomBase64Url(32)
      return ReconnectToken.make(b64)
    })

    const issueMessageId = Effect.fn('CryptoService.issueMessageId')(function*() {
      return MessageId.make(yield* Effect.sync(() => Bun.randomUUIDv7()))
    })

    const issueRoomId = Effect.fn('CryptoService.issueRoomId')(function*() {
      return RoomId.make(yield* Effect.sync(() => crypto.randomUUID()))
    })

    const hashToken = Effect.fn('CryptoService.hashToken')(function*(token: string) {
      const data = new TextEncoder().encode(token)
      const digest = yield* Effect.promise(() => crypto.subtle.digest('SHA-256', data))
      return Buffer.from(digest).toString('hex')
    })

    return { issueBearerToken, issueReconnectToken, issueMessageId, issueRoomId, hashToken }
  }),
}) {}
