// low-level Server needed for setRequestHandler; McpServer migration is a separate effort
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { RoomMessageEvent, SystemErrorEvent } from '@parley/api/wire'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Ref from 'effect/Ref'
export class ChannelDelivery extends Effect.Service<ChannelDelivery>()('ChannelDelivery', {
  accessors: true,
  effect: Effect.gen(function*() {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see Server import note
    const serverRef = yield* Ref.make<Option.Option<Server>>(Option.none())

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- see import note
    const register = Effect.fn('ChannelDelivery.register')(function*(server: Server) {
      yield* Ref.set(serverRef, Option.some(server))
    })

    const push = (content: string, meta: Record<string, string>) =>
      Effect.gen(function*() {
        const ref = yield* Ref.get(serverRef)

        yield* Option.match(ref, {
          onNone: () =>
            Effect.logWarning('ChannelDelivery.push called before register; event dropped'),
          onSome: (server) =>
            Effect.tryPromise({
              try: () =>
                server.notification({
                  method: 'notifications/claude/channel',
                  params: { content, meta },
                }),
              catch: (e) =>
                new Error(`channel push failed: ${e instanceof Error ? e.message : String(e)}`),
            }).pipe(
              Effect.catchAllCause((cause) =>
                Effect.logError('channel notification failed', cause)
              ),
            ),
        })
      })

    const deliverMessage = Effect.fn('ChannelDelivery.deliverMessage')(function*(
      event: RoomMessageEvent,
    ) {
      yield* push(event.body, {
        room: event.room,
        from_nickname: event.fromNickname,
        seq: String(event.seq),
        message_id: event.messageId,
        sent_at: DateTime.formatIso(event.sentAt),
      })
    })

    const deliverSystemError = Effect.fn('ChannelDelivery.deliverSystemError')(function*(
      event: SystemErrorEvent,
    ) {
      yield* push(event.message, { code: event.code })
    })

    return { register, deliverMessage, deliverSystemError }
  }),
}) {}
