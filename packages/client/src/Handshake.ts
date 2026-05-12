import type { BearerToken, ReconnectToken, SessionId } from '@parley/api/domain'
import type { HelloErrFrame, HelloOkFrame } from '@parley/api/wire'
import { Effect, Option } from 'effect'

import { WsConnection } from './WsConnection'

export const CLIENT_VERSION = '0.0.0'

export type HelloResult =
  | {
      readonly _tag: 'ok'
      readonly sessionId: SessionId
      readonly reconnectToken: ReconnectToken
      readonly serverVersion: string
    }
  | { readonly _tag: 'err'; readonly frame: HelloErrFrame }

export class Handshake extends Effect.Service<Handshake>()('Handshake', {
  accessors: true,
  dependencies: [WsConnection.Default],
  effect: Effect.gen(function* () {
    const ws = yield* WsConnection

    const send = Effect.fn('Handshake.send')(function* (params: {
      readonly authToken: Option.Option<BearerToken>
      readonly resume: Option.Option<{
        readonly sessionId: SessionId
        readonly reconnectToken: ReconnectToken
        readonly lastAckedSeqByRoom: Record<string, number>
      }>
    }) {
      yield* ws.send({
        _tag: 'hello',
        clientVersion: CLIENT_VERSION,
        ...(Option.isSome(params.authToken) ? { authToken: params.authToken.value } : {}),
        ...(Option.isSome(params.resume) ? { resume: params.resume.value } : {}),
      })

      while (true) {
        const inbound = yield* ws.take()

        if (inbound._tag === 'hello.ok') {
          const ok: HelloOkFrame = inbound.frame
          const ret: HelloResult = {
            _tag: 'ok',
            sessionId: ok.sessionId,
            reconnectToken: ok.reconnectToken,
            serverVersion: ok.serverVersion,
          }
          return ret
        }

        if (inbound._tag === 'hello.err') {
          const ret: HelloResult = { _tag: 'err', frame: inbound.frame }
          return ret
        }

        if (inbound._tag === 'closed') {
          return yield* Effect.die(new Error('Handshake: connection closed before reply'))
        }
      }
    })

    return { send }
  }),
}) {}
