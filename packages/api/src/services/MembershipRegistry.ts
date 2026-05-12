import { Effect, MutableHashMap, Option } from 'effect'

import type { SessionId } from '../domain/ids'
import type { Nickname } from '../domain/nickname'
import type { RoomName } from '../domain/room'

export type RoomMember = {
  readonly sessionId: SessionId
  readonly nickname: Nickname
}

type RoomState = {
  readonly bySession: Map<SessionId, Nickname>
  readonly byNickname: Map<Nickname, SessionId>
}

const emptyRoomState = (): RoomState => ({
  bySession: new Map(),
  byNickname: new Map(),
})

export type JoinResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly collidedWith: SessionId }

export class MembershipRegistry extends Effect.Service<MembershipRegistry>()('MembershipRegistry', {
  accessors: true,
  effect: Effect.gen(function* () {
    const rooms = MutableHashMap.empty<RoomName, RoomState>()
    const sessionRooms = MutableHashMap.empty<SessionId, Set<RoomName>>()

    const getOrInitRoom = (room: RoomName): RoomState => {
      const existing = MutableHashMap.get(rooms, room)

      if (Option.isSome(existing)) {
        return existing.value
      }

      const fresh = emptyRoomState()
      MutableHashMap.set(rooms, room, fresh)
      return fresh
    }

    const addSessionRoom = (sessionId: SessionId, room: RoomName) => {
      const existing = MutableHashMap.get(sessionRooms, sessionId)

      if (Option.isSome(existing)) {
        existing.value.add(room)
        return
      }

      MutableHashMap.set(sessionRooms, sessionId, new Set([room]))
    }

    const join = Effect.fn('MembershipRegistry.join')(function* (
      room: RoomName,
      sessionId: SessionId,
      nickname: Nickname,
    ) {
      return yield* Effect.sync((): JoinResult => {
        const state = getOrInitRoom(room)
        const owner = state.byNickname.get(nickname)

        if (owner !== undefined && owner !== sessionId) {
          return { ok: false, collidedWith: owner }
        }

        const previous = state.bySession.get(sessionId)

        if (previous !== undefined && previous !== nickname) {
          state.byNickname.delete(previous)
        }

        state.bySession.set(sessionId, nickname)
        state.byNickname.set(nickname, sessionId)
        addSessionRoom(sessionId, room)
        return { ok: true }
      })
    })

    const leave = Effect.fn('MembershipRegistry.leave')(function* (
      room: RoomName,
      sessionId: SessionId,
    ) {
      yield* Effect.sync(() => {
        const state = MutableHashMap.get(rooms, room)

        if (Option.isSome(state)) {
          const nick = state.value.bySession.get(sessionId)

          if (nick !== undefined) {
            state.value.bySession.delete(sessionId)
            state.value.byNickname.delete(nick)
          }
        }

        const set = MutableHashMap.get(sessionRooms, sessionId)

        if (Option.isSome(set)) {
          set.value.delete(room)
        }
      })
    })

    const dropSession = Effect.fn('MembershipRegistry.dropSession')(function* (
      sessionId: SessionId,
    ) {
      const joined = yield* Effect.sync(() => {
        const set = MutableHashMap.get(sessionRooms, sessionId)
        return Option.isSome(set) ? Array.from(set.value) : []
      })

      yield* Effect.forEach(joined, (room) => leave(room, sessionId), { discard: true })
      yield* Effect.sync(() => MutableHashMap.remove(sessionRooms, sessionId))
    })

    const membersOf = Effect.fn('MembershipRegistry.membersOf')(function* (room: RoomName) {
      return yield* Effect.sync(() => {
        const state = MutableHashMap.get(rooms, room)

        if (Option.isNone(state)) {
          return [] as RoomMember[]
        }

        return Array.from(
          state.value.bySession,
          ([sessionId, nickname]): RoomMember => ({
            sessionId,
            nickname,
          }),
        )
      })
    })

    const roomsOfSession = Effect.fn('MembershipRegistry.roomsOfSession')(function* (
      sessionId: SessionId,
    ) {
      return yield* Effect.sync(() => {
        const set = MutableHashMap.get(sessionRooms, sessionId)
        return Option.isSome(set) ? new Set(set.value) : new Set<RoomName>()
      })
    })

    const memberCount = Effect.fn('MembershipRegistry.memberCount')(function* (room: RoomName) {
      return yield* Effect.sync(() => {
        const state = MutableHashMap.get(rooms, room)
        return Option.isSome(state) ? state.value.bySession.size : 0
      })
    })

    return { join, leave, dropSession, membersOf, roomsOfSession, memberCount }
  }),
}) {}
