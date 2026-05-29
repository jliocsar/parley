import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type { SessionId } from '../domain/ids'
import type { Nickname } from '../domain/nickname'
import type { RoomName } from '../domain/room'

export interface RoomMember {
  readonly sessionId: SessionId
  readonly nickname: Nickname
}

type RoomState = Map<SessionId, Nickname>

export type JoinResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly collidedWith: SessionId }

export class MembershipRegistry extends Effect.Service<MembershipRegistry>()('MembershipRegistry', {
  accessors: true,
  effect: Effect.gen(function*() {
    const rooms = new Map<RoomName, RoomState>()

    const getOrInitRoom = (room: RoomName): RoomState => {
      const existing = rooms.get(room)

      if (existing !== undefined) {
        return existing
      }

      const fresh = new Map<SessionId, Nickname>()
      rooms.set(room, fresh)
      return fresh
    }

    const leaveSync = (room: RoomName, sessionId: SessionId) => {
      const state = rooms.get(room)

      if (state !== undefined) {
        state.delete(sessionId)
      }
    }

    const join = (room: RoomName, sessionId: SessionId, nickname: Nickname) =>
      Effect.sync((): JoinResult => {
        const state = getOrInitRoom(room)

        for (const [candidateSessionId, candidateNickname] of state) {
          if (candidateNickname === nickname && candidateSessionId !== sessionId) {
            return { ok: false, collidedWith: candidateSessionId }
          }
        }

        state.set(sessionId, nickname)
        return { ok: true }
      }).pipe(Effect.withSpan('MembershipRegistry.join'))

    const leave = (room: RoomName, sessionId: SessionId) =>
      Effect.sync(() => {
        leaveSync(room, sessionId)
      }).pipe(
        Effect.withSpan('MembershipRegistry.leave'),
      )

    const dropSession = (sessionId: SessionId) =>
      Effect.sync(() => {
        for (const state of rooms.values()) {
          state.delete(sessionId)
        }
      }).pipe(Effect.withSpan('MembershipRegistry.dropSession'))

    const membersOf = (room: RoomName) =>
      Effect.sync(() => {
        const state = rooms.get(room)

        if (state === undefined) {
          return [] as RoomMember[]
        }

        return Array.from(
          state,
          ([sessionId, nickname]): RoomMember => ({
            sessionId,
            nickname,
          }),
        )
      }).pipe(Effect.withSpan('MembershipRegistry.membersOf'))

    const roomsOfSession = (sessionId: SessionId) =>
      Effect.sync(() => {
        const joined = new Set<RoomName>()

        for (const [room, state] of rooms) {
          if (state.has(sessionId)) {
            joined.add(room)
          }
        }

        return joined
      }).pipe(Effect.withSpan('MembershipRegistry.roomsOfSession'))

    const memberCount = (room: RoomName) =>
      Effect.sync(() => {
        const state = rooms.get(room)
        return state?.size ?? 0
      }).pipe(Effect.withSpan('MembershipRegistry.memberCount'))

    const summarise = (room: RoomName, sessionId: SessionId) =>
      Effect.sync(() => {
        const state = rooms.get(room)

        if (state === undefined) {
          return { membersCount: 0, mine: Option.none<Nickname>() }
        }

        const mine = state.get(sessionId)

        return {
          membersCount: state.size,
          mine: mine !== undefined ? Option.some(mine) : Option.none<Nickname>(),
        }
      }).pipe(Effect.withSpan('MembershipRegistry.summarise'))

    return { join, leave, dropSession, membersOf, roomsOfSession, memberCount, summarise }
  }),
}) {}
