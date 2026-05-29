import { describe, expect, it } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { MessageId, ReconnectToken, SessionId } from '../domain/ids'
import { MessageBody } from '../domain/message'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'
import type { MessageDraft } from './FanoutService'
import { FanoutService } from './FanoutService'
import { MembershipRegistry } from './MembershipRegistry'
import { SessionRegistry } from './SessionRegistry'

const room = RoomName.make('lobby')
const sessionA = SessionId.make('00000000-0000-0000-0000-00000000000a')
const sessionB = SessionId.make('00000000-0000-0000-0000-00000000000b')
const nickA = Nickname.make('agile-otter')
const nickB = Nickname.make('brave-newt')

const draftFrom = (seq: number, fromNickname: Nickname): MessageDraft => ({
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

describe('FanoutService.publish', () => {
  it('omits the sender from fanout and assigns a monotonic per-room seq', async () => {
    await run(
      Effect.gen(function*() {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        const first = yield* fanout.publish(room, draftFrom(1, nickA), sessionA)
        const second = yield* fanout.publish(room, draftFrom(2, nickB), sessionB)

        expect(first.seq).toBe(1)
        expect(second.seq).toBe(2)

        const senderReplay = yield* fanout.replay(sessionA, {})
        const otherReplay = yield* fanout.replay(sessionB, {})

        // sessionA sent seq 1 (excluded) and received seq 2 from sessionB
        expect(senderReplay.map((event) => event.seq)).toEqual([2])
        // sessionB received seq 1 from sessionA (its own seq 2 is excluded)
        expect(otherReplay.map((event) => event.seq)).toEqual([1])
      }),
    )
  })

  // Regression: per-recipient buffers have gaps in the room-global seq because the
  // sender is excluded from its own buffer. The old overflow detector inferred drops
  // from `queue[0].seq > clientLastSeq + 1`, which fired falsely whenever the other
  // party had spoken — breaking resume for the canonical two-agent conversation.
  it('does not report a false overflow when the only gap is the sender exclusion', async () => {
    await run(
      Effect.gen(function*() {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        // A speaks (seq 1, not buffered for A), then B speaks (seq 2, buffered for A).
        yield* fanout.publish(room, draftFrom(1, nickA), sessionA)
        yield* fanout.publish(room, draftFrom(2, nickB), sessionB)

        // A reconnects having acked nothing. A's buffer head is seq 2, but seq 1 was
        // never destined for A — this must NOT be treated as a dropped message.
        const replayed = yield* fanout.replay(sessionA, {}).pipe(Effect.either)

        expect(replayed._tag).toBe('Right')

        if (replayed._tag === 'Right') {
          expect(replayed.right.map((event) => event.seq)).toEqual([2])
        }
      }),
    )
  })

  it('reports an overflow only when an unacked message was actually evicted', async () => {
    await run(
      Effect.gen(function*() {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        // A sends 100 messages; B's 64-entry buffer evicts the oldest 36 (seq 1..36).
        for (let seq = 1; seq <= 100; seq++) {
          yield* fanout.publish(room, draftFrom(seq, nickA), sessionA)
        }

        // B reconnects having acked only up to seq 10 — seq 11..36 were evicted.
        const overflowed = yield* fanout.replay(sessionB, { [room]: 10 }).pipe(Effect.either)

        expect(overflowed._tag).toBe('Left')

        // B reconnects having acked up to seq 36 — nothing unacked was lost.
        const ok = yield* fanout.replay(sessionB, { [room]: 36 }).pipe(Effect.either)

        expect(ok._tag).toBe('Right')

        if (ok._tag === 'Right') {
          expect(ok.right.every((event) => event.seq > 36)).toBe(true)
        }
      }),
    )
  })

  it('drops acked messages from the replay buffer', async () => {
    await run(
      Effect.gen(function*() {
        const memberships = yield* MembershipRegistry
        const sessions = yield* SessionRegistry
        const fanout = yield* FanoutService

        yield* registerSession(sessions, sessionA)
        yield* registerSession(sessions, sessionB)
        yield* memberships.join(room, sessionA, nickA)
        yield* memberships.join(room, sessionB, nickB)

        yield* fanout.publish(room, draftFrom(1, nickA), sessionA)
        yield* fanout.publish(room, draftFrom(2, nickA), sessionA)
        yield* fanout.ackUpTo(sessionB, room, 1)

        const replayed = yield* fanout.replay(sessionB, {})

        expect(replayed.map((event) => event.seq)).toEqual([2])
      }),
    )
  })
})
