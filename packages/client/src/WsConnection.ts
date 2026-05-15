import type { BearerToken } from '@parley/api/domain'
import type { ClientFrame } from '@parley/api/wire'
import { Deferred, Effect, Option, Queue, Ref, Runtime, Schema } from 'effect'

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

export type Inbound =
  | { readonly _tag: 'raw'; readonly value: unknown }
  | { readonly _tag: 'closed' }

export class WsConnection extends Effect.Service<WsConnection>()('WsConnection', {
  accessors: true,
  scoped: Effect.gen(function* () {
    const inbox = yield* Queue.unbounded<Inbound>()
    const socket = yield* Ref.make<Option.Option<WebSocket>>(Option.none())
    const runtime = yield* Effect.runtime<never>()
    const fork = <A, E>(eff: Effect.Effect<A, E, never>) => Runtime.runFork(runtime)(eff)

    const open = Effect.fn('WsConnection.open')(function* (config: WsConfig) {
      const headers: Record<string, string> = {}

      if (Option.isSome(config.authToken)) {
        headers.Authorization = `Bearer ${config.authToken.value}`
      }

      const ws = new WebSocket(config.url, { headers } as unknown as string[])
      const ready = yield* Deferred.make<void, WsConnectionError>()

      ws.onopen = () => {
        fork(Deferred.succeed(ready, undefined))
      }

      ws.onerror = () => {
        fork(
          Deferred.fail(
            ready,
            new WsConnectionError({ message: `WebSocket error connecting to ${config.url}` }),
          ),
        )
      }

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as unknown
          void inbox.unsafeOffer({ _tag: 'raw', value: parsed })
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
