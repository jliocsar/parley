import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import type { SessionId } from '../domain/ids'
import type { Nickname } from '../domain/nickname'
import type { RoomName } from '../domain/room'
import { CryptoService } from '../services/Crypto'
import { FanoutService } from '../services/FanoutService'
import { MembershipRegistry } from '../services/MembershipRegistry'
import { generateNickname, nicknameWithSuffix } from '../services/NicknameGenerator'
import { RateLimiter } from '../services/RateLimiter'
import { RoomRepo } from '../services/RoomRepo'
import { TOOLS } from '../tools/registry'
import type {
  AckFrame,
  ClientFrame,
  JoinRoomReq,
  LeaveRoomReq,
  ListRoomsReq,
  SendMessageReq,
  WhoIsHereReq,
} from '../wire/client'
import type { ToolErrRes, ToolOkRes } from '../wire/server'

const MAX_NICKNAME_ATTEMPTS = 8

// Per-tool result encoders keyed by the registry name — the encode-side mirror of the
// client's resultDecoders. Adding a tool is a registry edit, not another loose const here.
const encodeResult = {
  join_room: Schema.encodeSync(TOOLS.join_room.result),
  leave_room: Schema.encodeSync(TOOLS.leave_room.result),
  list_rooms: Schema.encodeSync(TOOLS.list_rooms.result),
  send_message: Schema.encodeSync(TOOLS.send_message.result),
  who_is_here: Schema.encodeSync(TOOLS.who_is_here.result),
} as const

export type ToolRuntimeResult = ToolOkRes | ToolErrRes | undefined

export class ToolRuntime extends Effect.Service<ToolRuntime>()('ToolRuntime', {
  accessors: true,
  dependencies: [
    RoomRepo.Default,
    MembershipRegistry.Default,
    FanoutService.Default,
    RateLimiter.Default,
    CryptoService.Default,
  ],
  effect: Effect.gen(function*() {
    const rooms = yield* RoomRepo
    const memberships = yield* MembershipRegistry
    const fanout = yield* FanoutService
    const rateLimiter = yield* RateLimiter
    const cryptoSvc = yield* CryptoService

    const ok = (requestId: ToolOkRes['requestId'], result: unknown): ToolOkRes => ({
      _tag: 'tool.ok',
      requestId,
      result,
    })

    const err = (
      requestId: ToolErrRes['requestId'],
      code: string,
      message: string,
      details?: unknown,
    ): ToolErrRes => ({ _tag: 'tool.err', requestId, code, message, details })

    const allocateNickname = (req: JoinRoomReq, sessionId: SessionId) =>
      Effect.gen(function*() {
        const base = generateNickname()

        for (let attempt = 1; attempt <= MAX_NICKNAME_ATTEMPTS; attempt++) {
          const candidate: Nickname = attempt === 1 ? base : nicknameWithSuffix(base, attempt)
          const result = yield* memberships.join(req.room, sessionId, candidate)

          if (result.ok) {
            return Option.some(candidate)
          }
        }

        return Option.none<Nickname>()
      })

    const joinRoom = Effect.fn('ToolRuntime.joinRoom')(function*(
      sessionId: SessionId,
      req: JoinRoomReq,
    ) {
      yield* rooms.ensure(req.room)

      if (req.nickname !== undefined) {
        const result = yield* memberships.join(req.room, sessionId, req.nickname)

        if (!result.ok) {
          return err(
            req.requestId,
            'NicknameTakenError',
            `Nickname ${req.nickname} is taken in ${req.room}`,
          )
        }

        const membersCount = yield* memberships.memberCount(req.room)
        return ok(
          req.requestId,
          encodeResult.join_room({ room: req.room, nickname: req.nickname, membersCount }),
        )
      }

      const allocated = yield* allocateNickname(req, sessionId)

      if (Option.isNone(allocated)) {
        return err(
          req.requestId,
          'NicknameTakenError',
          `Could not allocate a unique nickname in ${req.room}`,
        )
      }

      const membersCount = yield* memberships.memberCount(req.room)
      return ok(
        req.requestId,
        encodeResult.join_room({
          room: req.room,
          nickname: allocated.value,
          membersCount,
        }),
      )
    })

    const leaveRoom = Effect.fn('ToolRuntime.leaveRoom')(function*(
      sessionId: SessionId,
      req: LeaveRoomReq,
    ) {
      yield* memberships.leave(req.room, sessionId)
      return ok(req.requestId, encodeResult.leave_room({ room: req.room }))
    })

    const listRooms = Effect.fn('ToolRuntime.listRooms')(function*(
      sessionId: SessionId,
      req: ListRoomsReq,
    ) {
      const all = yield* rooms.listAll()
      const joined: { name: RoomName; nickname: Nickname; membersCount: number }[] = []
      const available: { name: RoomName; membersCount: number }[] = []

      for (const r of all) {
        const { membersCount, mine } = yield* memberships.summarise(r.name, sessionId)

        if (Option.isSome(mine)) {
          joined.push({ name: r.name, nickname: mine.value, membersCount })
        } else {
          available.push({ name: r.name, membersCount })
        }
      }

      return ok(req.requestId, encodeResult.list_rooms({ joined, available }))
    })

    const sendMessage = Effect.fn('ToolRuntime.sendMessage')(function*(
      sessionId: SessionId,
      req: SendMessageReq,
    ) {
      const limit = yield* rateLimiter.tryConsume(sessionId)

      if (!limit.ok) {
        return err(
          req.requestId,
          'RateLimitedError',
          `Rate limited; retry after ${limit.retryAfterMs}ms`,
          { retryAfterMs: limit.retryAfterMs },
        )
      }

      // Body size (≤ MESSAGE_BODY_MAX_BYTES) is enforced by the MessageBody schema during
      // ClientFrame decode, so an oversized body never reaches this handler.
      const members = yield* memberships.membersOf(req.room)
      const me = members.find((m) => m.sessionId === sessionId)

      if (!me) {
        return err(req.requestId, 'NotInRoomError', `Not joined to room ${req.room}`)
      }

      const messageId = yield* cryptoSvc.issueMessageId()
      const sentAt = DateTime.unsafeNow()

      const event = yield* fanout.publish(
        req.room,
        { messageId, fromNickname: me.nickname, body: req.body, sentAt },
        sessionId,
      )

      return ok(
        req.requestId,
        encodeResult.send_message({ room: req.room, seq: event.seq, messageId, sentAt }),
      )
    })

    const whoIsHere = Effect.fn('ToolRuntime.whoIsHere')(function*(
      _sessionId: SessionId,
      req: WhoIsHereReq,
    ) {
      const members = yield* memberships.membersOf(req.room)
      return ok(
        req.requestId,
        encodeResult.who_is_here({ room: req.room, nicknames: members.map((m) => m.nickname) }),
      )
    })

    const ack = Effect.fn('ToolRuntime.ack')(function*(sessionId: SessionId, frame: AckFrame) {
      yield* fanout.ackUpTo(sessionId, frame.room, frame.seq)
    })

    const run = Effect.fn('ToolRuntime.run')(function*(sessionId: SessionId, frame: ClientFrame) {
      switch (frame._tag) {
        case 'tool.join_room':
          return yield* joinRoom(sessionId, frame)
        case 'tool.leave_room':
          return yield* leaveRoom(sessionId, frame)
        case 'tool.list_rooms':
          return yield* listRooms(sessionId, frame)
        case 'tool.send_message':
          return yield* sendMessage(sessionId, frame)
        case 'tool.who_is_here':
          return yield* whoIsHere(sessionId, frame)
        case 'ack':
          yield* ack(sessionId, frame)
          return undefined
      }
    })

    return { run }
  }),
}) {}
