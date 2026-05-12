import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { RoomMessageEvent, SystemErrorEvent } from '@parley/api/wire'
import { DateTime, Effect, Option, Ref } from 'effect'

export class ChannelDelivery extends Effect.Service<ChannelDelivery>()('ChannelDelivery', {
  accessors: true,
  effect: Effect.gen(function* () {
    const serverRef = yield* Ref.make<Option.Option<Server>>(Option.none())

    const register = Effect.fn('ChannelDelivery.register')(function* (server: Server) {
      yield* Ref.set(serverRef, Option.some(server))
    })

    const push = (content: string, meta: Record<string, string>) =>
      Effect.gen(function* () {
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
                Effect.logError('channel notification failed', cause),
              ),
            ),
        })
      })

    const deliverMessage = Effect.fn('ChannelDelivery.deliverMessage')(function* (
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

    const deliverSystemError = Effect.fn('ChannelDelivery.deliverSystemError')(function* (
      event: SystemErrorEvent,
    ) {
      yield* push(event.message, { code: event.code })
    })

    return { register, deliverMessage, deliverSystemError }
  }),
}) {}
