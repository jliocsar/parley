import type { BearerToken } from '@parley/api/domain'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Ref from 'effect/Ref'
import * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'
export class WsConnectionError extends Schema.TaggedError<WsConnectionError>()(
  'WsConnectionError',
  {
    message: Schema.String,
  },
) {}

export interface WsConfig {
  readonly url: string
  readonly authToken: Option.Option<BearerToken>
}

export type Inbound =
  | { readonly _tag: 'raw'; readonly value: unknown }
  | { readonly _tag: 'closed' }

export class WsConnection extends Effect.Service<WsConnection>()('WsConnection', {
  accessors: true,
  scoped: Effect.gen(function*() {
    const inbox = yield* Queue.unbounded<Inbound>()
    const socket = yield* Ref.make<Option.Option<WebSocket>>(Option.none())
    const runtime = yield* Effect.runtime()
    const fork = <A, E>(eff: Effect.Effect<A, E>) => Runtime.runFork(runtime)(eff)

    const open = Effect.fn('WsConnection.open')(function*(config: WsConfig) {
      const headers: Record<string, string> = {}

      if (Option.isSome(config.authToken)) {
        headers.Authorization = `Bearer ${config.authToken.value}`
      }

      // Bun's WebSocket accepts an options object with `headers`; the WHATWG
      // lib.dom type only permits a protocols `string[]`. This double-cast
      // through `unknown` is Bun-specific and intentional.
      const ws = new WebSocket(config.url, { headers } as unknown as string[])
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- Deferred<void> is the standard "signal" pattern in Effect
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
          fork(Queue.offer(inbox, { _tag: 'raw', value: parsed }))
        } catch {
          /* malformed frame — surfaced upstream as protocol error */
        }
      }

      ws.onclose = () => {
        fork(Queue.offer(inbox, { _tag: 'closed' }))
      }

      yield* Ref.set(socket, Option.some(ws))
      yield* Deferred.await(ready)
    })

    // Transport-only: writes an already-serialised frame to the socket. The transport
    // stays protocol-agnostic — Schema-based frame encoding (Schema.parseJson) lives in
    // the callers (ParleyClient for ClientFrame, Handshake for the hello frame).
    const send = Effect.fn('WsConnection.send')(function*(payload: string) {
      const current = yield* Ref.get(socket)
      yield* Option.match(current, {
        onNone: () => Effect.die(new Error('WsConnection: send called before open')),
        onSome: (ws) =>
          Effect.sync(() => {
            ws.send(payload)
          }),
      })
    })

    const take = Effect.fn('WsConnection.take')(function*() {
      return yield* Queue.take(inbox)
    })

    const close = Effect.fn('WsConnection.close')(function*() {
      const current = yield* Ref.get(socket)
      yield* Option.match(current, {
        onNone: () => Effect.void,
        onSome: (ws) =>
          Effect.sync(() => {
            ws.close()
          }),
      })
    })

    return { open, send, take, close }
  }),
}) {}
