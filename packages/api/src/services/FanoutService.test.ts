import { describe, expect, it } from 'bun:test'
import { DateTime, Effect, Layer, Option } from 'effect'

import { MessageId, ReconnectToken, SessionId } from '../domain/ids'
import { MessageBody } from '../domain/message'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'
import type { RoomMessageEvent } from '../wire/server'
import { FanoutService } from './FanoutService'
import { MembershipRegistry } from './MembershipRegistry'
import { SessionRegistry } from './SessionRegistry'

const room = RoomName.make('lobby')
const sessionA = SessionId.make('00000000-0000-0000-0000-00000000000a')
const sessionB = SessionId.make('00000000-0000-0000-0000-00000000000b')
const nickA = Nickname.make('agile-otter')
const nickB = Nickname.make('brave-newt')

const eventFrom = (seq: number, fromNickname: Nickname): RoomMessageEvent => ({
  _tag: 'room.message',
  room,
  seq,
  messageId: MessageId.make(`00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`),
  fromNickname,
  body: MessageBody.make(`hello ${seq}`),
  sentAt: DateTime.unsafeNow(),
})

const registerSession = (sessions: SessionRegistry, id: SessionId) =>
  sessions.register({
    id,
    authLabel: Option.none(),
    clientVersion: 'test',
    connectedAt: new Date(),
    reconnectToken: ReconnectToken.make('reconnect-token-test-padding-padding-padding'),
    socket: Option.none(),
  })

const TestLayer = Layer.mergeAll(
  FanoutService.Default,
  MembershipRegistry.Default,
  SessionRegistry.Default,
)

const run = <A>(
  eff: Effect.Effect<A, unknown, FanoutService | MembershipRegistry | SessionRegistry>,
) => Effect.runPromise(eff.pipe(Effect.provide(TestLayer)))

describe('FanoutService.enqueueAndPush', () => {
  it('omits the sender from fanout when a senderSessionId is provided', async () => {
    await run(
      Effect.gen(function* () {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        const event = eventFrom(1, nickA)
        yield* fanout.enqueueAndPush(room, event, sessionA)

        const senderReplay = yield* fanout.replay(sessionA, {})
        const otherReplay = yield* fanout.replay(sessionB, {})

        expect(senderReplay).toHaveLength(0)
        expect(otherReplay).toHaveLength(1)
        expect(otherReplay[0]?.fromNickname).toBe(nickA)
      }),
    )
  })

  it('still broadcasts to every member when no senderSessionId is given', async () => {
    await run(
      Effect.gen(function* () {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        yield* fanout.enqueueAndPush(room, eventFrom(1, nickA))

        const aReplay = yield* fanout.replay(sessionA, {})
        const bReplay = yield* fanout.replay(sessionB, {})

        expect(aReplay).toHaveLength(1)
        expect(bReplay).toHaveLength(1)
      }),
    )
  })
})
