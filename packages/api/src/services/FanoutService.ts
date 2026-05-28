import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { SessionId } from '../domain/ids'
import type { RoomName } from '../domain/room'
import { ReplayBufferOverflowError } from '../errors/handshake'
import { RoomMessageEvent } from '../wire/server'
import { MembershipRegistry } from './MembershipRegistry'
import { SessionRegistry } from './SessionRegistry'

const encodeRoomMessage = Schema.encodeSync(RoomMessageEvent)

const REPLAY_BUFFER_SIZE = 64

interface RecipientBuffer {
  readonly perRoom: Map<RoomName, RoomMessageEvent[]>
  readonly lastAckedSeqByRoom: Map<RoomName, number>
}

const emptyBuffer = (): RecipientBuffer => ({ perRoom: new Map(), lastAckedSeqByRoom: new Map() })

export class FanoutService extends Effect.Service<FanoutService>()('FanoutService', {
  accessors: true,
  dependencies: [MembershipRegistry.Default, SessionRegistry.Default],
  effect: Effect.gen(function*() {
    const memberships = yield* MembershipRegistry
    const sessions = yield* SessionRegistry

    const roomSeqs = MutableHashMap.empty<RoomName, number>()
    const buffers = MutableHashMap.empty<SessionId, RecipientBuffer>()

    const getOrInitBuffer = (sessionId: SessionId): RecipientBuffer => {
      const existing = MutableHashMap.get(buffers, sessionId)

      if (Option.isSome(existing)) {
        return existing.value
      }

      const fresh = emptyBuffer()
      MutableHashMap.set(buffers, sessionId, fresh)
      return fresh
    }

    const appendToBuffer = (sessionId: SessionId, room: RoomName, event: RoomMessageEvent) => {
      const buf = getOrInitBuffer(sessionId)
      const queue = buf.perRoom.get(room) ?? []
      queue.push(event)

      if (queue.length > REPLAY_BUFFER_SIZE) {
        queue.splice(0, queue.length - REPLAY_BUFFER_SIZE)
      }

      buf.perRoom.set(room, queue)
    }

    const nextSeqFor = (room: RoomName) =>
      Effect.sync(() => {
        const next = Option.getOrElse(MutableHashMap.get(roomSeqs, room), () => 1)
        MutableHashMap.set(roomSeqs, room, next + 1)
        return next
      }).pipe(Effect.withSpan('FanoutService.nextSeqFor'))

    const enqueueAndPush = Effect.fn('FanoutService.enqueueAndPush')(function*(
      room: RoomName,
      event: RoomMessageEvent,
      senderSessionId?: SessionId,
    ) {
      const allRecipients = yield* memberships.membersOf(room)
      const recipients = senderSessionId
        ? allRecipients.filter((m) => m.sessionId !== senderSessionId)
        : allRecipients
      const payload = JSON.stringify(encodeRoomMessage(event))

      yield* Effect.forEach(
        recipients,
        ({ sessionId }) =>
          Effect.sync(() => {
            appendToBuffer(sessionId, room, event)
          }).pipe(
            Effect.zipRight(sessions.sendTo(sessionId, payload)),
          ),
        { concurrency: 16, discard: true },
      )
    })

    const ackUpTo = (sessionId: SessionId, room: RoomName, seq: number) =>
      Effect.sync(() => {
        const buf = MutableHashMap.get(buffers, sessionId)

        if (Option.isNone(buf)) {
          return
        }

        const queue = buf.value.perRoom.get(room)

        if (queue) {
          buf.value.perRoom.set(
            room,
            queue.filter((e) => e.seq > seq),
          )
        }

        buf.value.lastAckedSeqByRoom.set(room, seq)
      }).pipe(Effect.withSpan('FanoutService.ackUpTo'))

    const replayRoom = (
      room: RoomName,
      queue: readonly RoomMessageEvent[],
      clientLastSeq: number,
    ): Effect.Effect<readonly RoomMessageEvent[], ReplayBufferOverflowError> => {
      const oldestBuffered = queue[0]?.seq ?? clientLastSeq + 1

      if (oldestBuffered > clientLastSeq + 1) {
        return Effect.fail(
          new ReplayBufferOverflowError({
            room,
            message: `Messages were dropped during disconnect for room ${room}`,
          }),
        )
      }

      return Effect.succeed(queue.filter((e) => e.seq > clientLastSeq))
    }

    const replay = Effect.fn('FanoutService.replay')(function*(
      sessionId: SessionId,
      lastAckedSeqByRoom: Record<string, number>,
    ) {
      const buf = MutableHashMap.get(buffers, sessionId)

      if (Option.isNone(buf)) {
        return [] as RoomMessageEvent[]
      }

      const groups = yield* Effect.forEach(
        Array.from(buf.value.perRoom),
        ([room, queue]) => replayRoom(room, queue, lastAckedSeqByRoom[room as string] ?? 0),
      )

      return groups.flat()
    })

    const dropSession = (sessionId: SessionId) =>
      Effect.sync(() => MutableHashMap.remove(buffers, sessionId)).pipe(
        Effect.withSpan('FanoutService.dropSession'),
      )

    return { nextSeqFor, enqueueAndPush, ackUpTo, replay, dropSession }
  }),
}) {}
