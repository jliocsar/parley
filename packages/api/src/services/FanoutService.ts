import { Effect, MutableHashMap, Option, Schema } from 'effect'

import type { SessionId } from '../domain/ids'
import type { RoomName } from '../domain/room'
import { ReplayBufferOverflowError } from '../errors/handshake'
import { RoomMessageEvent } from '../wire/server'
import { MembershipRegistry } from './MembershipRegistry'
import { SessionRegistry } from './SessionRegistry'

const encodeRoomMessage = Schema.encodeSync(RoomMessageEvent)

const REPLAY_BUFFER_SIZE = 64

type RecipientBuffer = {
  readonly perRoom: Map<RoomName, RoomMessageEvent[]>
  readonly lastAckedSeqByRoom: Map<RoomName, number>
}

const emptyBuffer = (): RecipientBuffer => ({ perRoom: new Map(), lastAckedSeqByRoom: new Map() })

export class FanoutService extends Effect.Service<FanoutService>()('FanoutService', {
  accessors: true,
  dependencies: [MembershipRegistry.Default, SessionRegistry.Default],
  effect: Effect.gen(function* () {
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

    const nextSeqFor = Effect.fn('FanoutService.nextSeqFor')(function* (room: RoomName) {
      return yield* Effect.sync(() => {
        const next = Option.getOrElse(MutableHashMap.get(roomSeqs, room), () => 1)
        MutableHashMap.set(roomSeqs, room, next + 1)
        return next
      })
    })

    const appendToBuffer = (sessionId: SessionId, room: RoomName, event: RoomMessageEvent) =>
      Effect.sync(() => {
        const buf = getOrInitBuffer(sessionId)
        const queue = buf.perRoom.get(room) ?? []
        queue.push(event)

        if (queue.length > REPLAY_BUFFER_SIZE) {
          queue.splice(0, queue.length - REPLAY_BUFFER_SIZE)
        }

        buf.perRoom.set(room, queue)
      })

    const enqueueAndPush = Effect.fn('FanoutService.enqueueAndPush')(function* (
      room: RoomName,
      event: RoomMessageEvent,
    ) {
      const recipients = yield* memberships.membersOf(room)
      const payload = yield* Effect.sync(() => JSON.stringify(encodeRoomMessage(event)))

      yield* Effect.forEach(
        recipients,
        ({ sessionId }) =>
          Effect.gen(function* () {
            yield* appendToBuffer(sessionId, room, event)

            const session = yield* sessions.get(sessionId)
            const sock = Option.flatMap(session, (s) => s.socket)

            if (Option.isSome(sock)) {
              yield* Effect.sync(() => {
                try {
                  sock.value.send(payload)
                } catch {}
              })
            }
          }),
        { concurrency: 16, discard: true },
      )
    })

    const ackUpTo = Effect.fn('FanoutService.ackUpTo')(function* (
      sessionId: SessionId,
      room: RoomName,
      seq: number,
    ) {
      yield* Effect.sync(() => {
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
      })
    })

    type RoomReplay =
      | { readonly overflow: true; readonly room: RoomName }
      | { readonly overflow: false; readonly events: readonly RoomMessageEvent[] }

    const replayRoom = (
      room: RoomName,
      queue: readonly RoomMessageEvent[],
      clientLastSeq: number,
    ): RoomReplay => {
      const oldestBuffered = queue[0]?.seq ?? clientLastSeq + 1

      if (oldestBuffered > clientLastSeq + 1) {
        return { overflow: true, room }
      }

      return { overflow: false, events: queue.filter((e) => e.seq > clientLastSeq) }
    }

    const replay = Effect.fn('FanoutService.replay')(function* (
      sessionId: SessionId,
      lastAckedSeqByRoom: Record<string, number>,
    ) {
      const buf = MutableHashMap.get(buffers, sessionId)

      if (Option.isNone(buf)) {
        return [] as RoomMessageEvent[]
      }

      const toReplay: RoomMessageEvent[] = []

      for (const [room, queue] of buf.value.perRoom) {
        const result = replayRoom(room, queue, lastAckedSeqByRoom[room as string] ?? 0)

        if (result.overflow) {
          return yield* new ReplayBufferOverflowError({
            room: result.room,
            message: `Messages were dropped during disconnect for room ${result.room}`,
          })
        }

        toReplay.push(...result.events)
      }

      return toReplay
    })

    const dropSession = Effect.fn('FanoutService.dropSession')(function* (sessionId: SessionId) {
      yield* Effect.sync(() => MutableHashMap.remove(buffers, sessionId))
    })

    return { nextSeqFor, enqueueAndPush, ackUpTo, replay, dropSession }
  }),
}) {}
