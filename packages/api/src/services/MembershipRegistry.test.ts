import { describe, expect, it } from 'bun:test'
import { Effect } from 'effect'

import { SessionId } from '../domain/ids'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'
import { MembershipRegistry } from './MembershipRegistry'

const room = RoomName.make('lobby')
const sessionA = SessionId.make('00000000-0000-0000-0000-00000000000a')
const sessionB = SessionId.make('00000000-0000-0000-0000-00000000000b')
const nickOne = Nickname.make('agile-otter')
const nickTwo = Nickname.make('brave-newt')

const run = <A>(eff: Effect.Effect<A, unknown, MembershipRegistry>) =>
  Effect.runPromise(eff.pipe(Effect.provide(MembershipRegistry.Default)))

describe('MembershipRegistry.join', () => {
  it('frees the previous nickname when the same session rejoins with a different nickname', async () => {
    await run(
      Effect.gen(function* () {
        const reg = yield* MembershipRegistry

        const first = yield* reg.join(room, sessionA, nickOne)
        expect(first.ok).toBe(true)

        const second = yield* reg.join(room, sessionA, nickTwo)
        expect(second.ok).toBe(true)

        const reclaim = yield* reg.join(room, sessionB, nickOne)
        expect(reclaim.ok).toBe(true)
      }),
    )
  })

  it('reports collision when a different session holds the nickname', async () => {
    await run(
      Effect.gen(function* () {
        const reg = yield* MembershipRegistry

        yield* reg.join(room, sessionA, nickOne)
        const collided = yield* reg.join(room, sessionB, nickOne)

        expect(collided.ok).toBe(false)

        if (!collided.ok) {
          expect(collided.collidedWith).toBe(sessionA)
        }
      }),
    )
  })

  it('is idempotent for the same (session, nickname)', async () => {
    await run(
      Effect.gen(function* () {
        const reg = yield* MembershipRegistry

        yield* reg.join(room, sessionA, nickOne)
        const again = yield* reg.join(room, sessionA, nickOne)
        expect(again.ok).toBe(true)

        const members = yield* reg.membersOf(room)
        expect(members).toHaveLength(1)
        expect(members[0]).toBeDefined()
        const first = members[0]
        if (first) {
          expect(first.nickname).toBe(nickOne)
        }
      }),
    )
  })
})

describe('MembershipRegistry.dropSession', () => {
  // Regression: a Session's memberships must survive WS disconnect (spec in CONTEXT.md).
  // Memberships only disappear when dropSession is explicitly called, e.g. by the
  // session-expiry path in WsServer — never directly from a `close` handler.
  it('removes the session from every room it joined', async () => {
    await run(
      Effect.gen(function* () {
        const reg = yield* MembershipRegistry
        const otherRoom = RoomName.make('arena')

        yield* reg.join(room, sessionA, nickOne)
        yield* reg.join(otherRoom, sessionA, nickTwo)

        const before = yield* reg.roomsOfSession(sessionA)
        expect(before.size).toBe(2)

        yield* reg.dropSession(sessionA)

        const after = yield* reg.roomsOfSession(sessionA)
        expect(after.size).toBe(0)
        expect((yield* reg.membersOf(room)).length).toBe(0)
        expect((yield* reg.membersOf(otherRoom)).length).toBe(0)
      }),
    )
  })

  it('does not affect other sessions in the same room', async () => {
    await run(
      Effect.gen(function* () {
        const reg = yield* MembershipRegistry

        yield* reg.join(room, sessionA, nickOne)
        yield* reg.join(room, sessionB, nickTwo)

        yield* reg.dropSession(sessionA)

        const members = yield* reg.membersOf(room)
        expect(members).toHaveLength(1)
        expect(members[0]?.sessionId).toBe(sessionB)
      }),
    )
  })
})
