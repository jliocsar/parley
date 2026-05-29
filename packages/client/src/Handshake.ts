import type { BearerToken, ReconnectToken, SessionId } from '@parley/api/domain'
import {
  type HelloErrFrame,
  HelloErrFrame as HelloErrSchema,
  HelloFrame,
  HelloOkFrame,
} from '@parley/api/wire'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { WsConnection } from './WsConnection'

export const CLIENT_VERSION = '0.0.0'

// A malformed-but-open server could stream frames that never decode to a hello
// response. Bound how many we tolerate before failing the handshake instead of
// spinning forever with zero diagnostics.
const MAX_UNDECODABLE_FRAMES = 16

export type HelloResult =
  | {
    readonly _tag: 'ok'
    readonly sessionId: SessionId
    readonly reconnectToken: ReconnectToken
    readonly serverVersion: string
  }
  | { readonly _tag: 'err'; readonly frame: HelloErrFrame }

const HelloResponseSchema = Schema.Union(HelloOkFrame, HelloErrSchema)
const decodeHelloResponse = Schema.decodeUnknown(HelloResponseSchema)
const encodeHello = Schema.encodeSync(Schema.parseJson(HelloFrame))

export class Handshake extends Effect.Service<Handshake>()('Handshake', {
  accessors: true,
  dependencies: [WsConnection.Default],
  effect: Effect.gen(function*() {
    const ws = yield* WsConnection

    const send = Effect.fn('Handshake.send')(function*(params: {
      readonly authToken: Option.Option<BearerToken>
      readonly resume: Option.Option<{
        readonly sessionId: SessionId
        readonly reconnectToken: ReconnectToken
        readonly lastAckedSeqByRoom: Record<string, number>
      }>
    }) {
      yield* ws.send(encodeHello({
        _tag: 'hello',
        clientVersion: CLIENT_VERSION,
        ...(Option.isSome(params.authToken) ? { authToken: params.authToken.value } : {}),
        ...(Option.isSome(params.resume) ? { resume: params.resume.value } : {}),
      }))

      let undecodable = 0

      for (;;) {
        const inbound = yield* ws.take()

        if (inbound._tag === 'closed') {
          return yield* Effect.die(new Error('Handshake: connection closed before reply'))
        }

        const decoded = yield* decodeHelloResponse(inbound.value).pipe(Effect.either)

        if (decoded._tag === 'Left') {
          undecodable += 1

          yield* Effect.logWarning('handshake: undecodable frame', {
            error: decoded.left.message,
            raw: inbound.value,
            count: undecodable,
          })

          if (undecodable >= MAX_UNDECODABLE_FRAMES) {
            return yield* Effect.die(
              new Error(
                `Handshake: gave up after ${String(MAX_UNDECODABLE_FRAMES)} undecodable frames`,
              ),
            )
          }

          continue
        }

        const frame = decoded.right

        if (frame._tag === 'hello.ok') {
          const ret: HelloResult = {
            _tag: 'ok',
            sessionId: frame.sessionId,
            reconnectToken: frame.reconnectToken,
            serverVersion: frame.serverVersion,
          }
          return ret
        }

        const ret: HelloResult = { _tag: 'err', frame }
        return ret
      }
    })

    return { send }
  }),
}) {}
