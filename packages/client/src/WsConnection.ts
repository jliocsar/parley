import type { BearerToken } from '@parley/api/domain'
import {
  type ClientFrame,
  type HelloErrFrame,
  HelloErrFrame as HelloErrSchema,
  type HelloOkFrame,
  HelloOkFrame as HelloOkSchema,
} from '@parley/api/wire'
import { Deferred, Effect, Option, Queue, Ref, Schema } from 'effect'

export class WsConnectionError extends Schema.TaggedError<WsConnectionError>()(
  'WsConnectionError',
  {
    message: Schema.String,
  },
) {}

export type WsConfig = {
  readonly url: string
  readonly authToken: Option.Option<BearerToken>
}

type Inbound =
  | { readonly _tag: 'hello.ok'; readonly frame: HelloOkFrame }
  | { readonly _tag: 'hello.err'; readonly frame: HelloErrFrame }
  | { readonly _tag: 'server'; readonly raw: unknown }
  | { readonly _tag: 'closed' }

export class WsConnection extends Effect.Service<WsConnection>()('WsConnection', {
  accessors: true,
  scoped: Effect.gen(function* () {
    const inbox = yield* Queue.unbounded<Inbound>()
    const socket = yield* Ref.make<Option.Option<WebSocket>>(Option.none())

    const open = Effect.fn('WsConnection.open')(function* (config: WsConfig) {
      const headers: Record<string, string> = {}

      if (Option.isSome(config.authToken)) {
        headers.Authorization = `Bearer ${config.authToken.value}`
      }

      const ws = new WebSocket(config.url, { headers } as unknown as string[])
      const ready = yield* Deferred.make<void, WsConnectionError>()

      ws.onopen = () => {
        void Effect.runFork(Deferred.succeed(ready, undefined))
      }

      ws.onerror = () => {
        void Effect.runFork(
          Deferred.fail(
            ready,
            new WsConnectionError({ message: `WebSocket error connecting to ${config.url}` }),
          ),
        )
      }

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as { _tag?: string }

          if (parsed._tag === 'hello.ok') {
            const frame = Schema.decodeUnknownSync(HelloOkSchema)(parsed)
            void inbox.unsafeOffer({ _tag: 'hello.ok', frame })
            return
          }

          if (parsed._tag === 'hello.err') {
            const frame = Schema.decodeUnknownSync(HelloErrSchema)(parsed)
            void inbox.unsafeOffer({ _tag: 'hello.err', frame })
            return
          }

          void inbox.unsafeOffer({ _tag: 'server', raw: parsed })
        } catch {
          /* malformed frame — surfaced upstream as protocol error */
        }
      }

      ws.onclose = () => {
        void inbox.unsafeOffer({ _tag: 'closed' })
      }

      yield* Ref.set(socket, Option.some(ws))
      yield* Deferred.await(ready)
    })

    const send = Effect.fn('WsConnection.send')(function* (
      frame: ClientFrame | { _tag: 'hello'; [k: string]: unknown },
    ) {
      const current = yield* Ref.get(socket)
      yield* Option.match(current, {
        onNone: () => Effect.die(new Error('WsConnection: send called before open')),
        onSome: (ws) => Effect.sync(() => ws.send(JSON.stringify(frame))),
      })
    })

    const take = Effect.fn('WsConnection.take')(function* () {
      return yield* Queue.take(inbox)
    })

    const close = Effect.fn('WsConnection.close')(function* () {
      const current = yield* Ref.get(socket)
      yield* Option.match(current, {
        onNone: () => Effect.void,
        onSome: (ws) => Effect.sync(() => ws.close()),
      })
    })

    return { open, send, take, close }
  }),
}) {}
