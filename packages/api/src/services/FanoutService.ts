import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { MessageId, SessionId } from '../domain/ids'
import type { MessageBody } from '../domain/message'
import type { Nickname } from '../domain/nickname'
import type { RoomName } from '../domain/room'
import { ReplayBufferOverflowError } from '../errors/handshake'
import { RoomMessageEvent } from '../wire/server'
import { MembershipRegistry } from './MembershipRegistry'
import { SessionRegistry } from './SessionRegistry'

const encodeRoomMessageJson = Schema.encodeSync(Schema.parseJson(RoomMessageEvent))

const REPLAY_BUFFER_SIZE = 64

export interface MessageDraft {
  readonly messageId: MessageId
  readonly fromNickname: Nickname
  readonly body: MessageBody
  readonly sentAt: DateTime.Utc
}

interface RoomBuffer {
  readonly events: RoomMessageEvent[]
  highestEvictedSeq: number
}

interface RecipientBuffer {
  readonly perRoom: Map<RoomName, RoomBuffer>
}

const emptyBuffer = (): RecipientBuffer => ({ perRoom: new Map() })

export class FanoutService extends Effect.Service<FanoutService>()('FanoutService', {
  accessors: true,
  dependencies: [MembershipRegistry.Default, SessionRegistry.Default],
  effect: Effect.gen(function*() {
    const memberships = yield* MembershipRegistry
    const sessions = yield* SessionRegistry

    const roomSeqs = MutableHashMap.empty<RoomName, number>()
    const buffers = MutableHashMap.empty<SessionId, RecipientBuffer>()

    const assignSeq = (room: RoomName): number => {
      const next = Option.getOrElse(MutableHashMap.get(roomSeqs, room), () => 1)
      MutableHashMap.set(roomSeqs, room, next + 1)
      return next
    }

    const getOrInitBuffer = (sessionId: SessionId): RecipientBuffer => {
      const existing = MutableHashMap.get(buffers, sessionId)

      if (Option.isSome(existing)) {
        return existing.value
      }

      const fresh = emptyBuffer()
      MutableHashMap.set(buffers, sessionId, fresh)
      return fresh
    }

    const getOrInitRoomBuffer = (sessionId: SessionId, room: RoomName): RoomBuffer => {
      const buf = getOrInitBuffer(sessionId)
      const existing = buf.perRoom.get(room)

      if (existing !== undefined) {
        return existing
      }

      const fresh: RoomBuffer = { events: [], highestEvictedSeq: 0 }
      buf.perRoom.set(room, fresh)
      return fresh
    }

    const appendToBuffer = (sessionId: SessionId, room: RoomName, event: RoomMessageEvent) => {
      const roomBuffer = getOrInitRoomBuffer(sessionId, room)
      roomBuffer.events.push(event)

      if (roomBuffer.events.length > REPLAY_BUFFER_SIZE) {
        const evicted = roomBuffer.events.splice(0, roomBuffer.events.length - REPLAY_BUFFER_SIZE)
        const lastEvicted = evicted[evicted.length - 1]

        if (lastEvicted !== undefined) {
          roomBuffer.highestEvictedSeq = lastEvicted.seq
        }
      }
    }

    const publish = Effect.fn('FanoutService.publish')(function*(
      room: RoomName,
      draft: MessageDraft,
      senderSessionId: SessionId,
    ) {
      const members = yield* memberships.membersOf(room)
      const recipients = members.filter((member) => member.sessionId !== senderSessionId)

      const { event, payload } = yield* Effect.sync(() => {
        const seq = assignSeq(room)
        const built: RoomMessageEvent = {
          _tag: 'room.message',
          room,
          seq,
          messageId: draft.messageId,
          fromNickname: draft.fromNickname,
          body: draft.body,
          sentAt: draft.sentAt,
        }
        const encoded = encodeRoomMessageJson(built)

        for (const { sessionId } of recipients) {
          appendToBuffer(sessionId, room, built)
        }

        return { event: built, payload: encoded }
      })

      yield* Effect.forEach(recipients, ({ sessionId }) => sessions.sendTo(sessionId, payload), {
        concurrency: 16,
        discard: true,
      })

      return event
    })

    const ackUpTo = (sessionId: SessionId, room: RoomName, seq: number) =>
      Effect.sync(() => {
        const buf = MutableHashMap.get(buffers, sessionId)

        if (Option.isNone(buf)) {
          return
        }

        const roomBuffer = buf.value.perRoom.get(room)

        if (roomBuffer !== undefined) {
          const retained = roomBuffer.events.filter((event) => event.seq > seq)
          roomBuffer.events.length = 0
          roomBuffer.events.push(...retained)
        }
      }).pipe(Effect.withSpan('FanoutService.ackUpTo'))

    const replayRoom = (
      room: RoomName,
      roomBuffer: RoomBuffer,
      clientLastSeq: number,
    ): Effect.Effect<readonly RoomMessageEvent[], ReplayBufferOverflowError> => {
      if (roomBuffer.highestEvictedSeq > clientLastSeq) {
        return Effect.fail(
          new ReplayBufferOverflowError({
            room,
            message: `Messages were dropped during disconnect for room ${room}`,
          }),
        )
      }

      return Effect.succeed(roomBuffer.events.filter((event) => event.seq > clientLastSeq))
    }

    const replay = Effect.fn('FanoutService.replay')(function*(
      sessionId: SessionId,
      lastAckedSeqByRoom: Record<RoomName, number>,
    ) {
      const buf = MutableHashMap.get(buffers, sessionId)

      if (Option.isNone(buf)) {
        return [] as RoomMessageEvent[]
      }

      const groups = yield* Effect.forEach(
        Array.from(buf.value.perRoom),
        ([room, roomBuffer]) => replayRoom(room, roomBuffer, lastAckedSeqByRoom[room] ?? 0),
      )

      return groups.flat()
    })

    const dropSession = (sessionId: SessionId) =>
      Effect.sync(() => MutableHashMap.remove(buffers, sessionId)).pipe(
        Effect.withSpan('FanoutService.dropSession'),
      )

    return { publish, ackUpTo, replay, dropSession }
  }),
}) {}
