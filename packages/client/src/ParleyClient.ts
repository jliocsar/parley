import type {
  BearerToken,
  MessageBody,
  Nickname,
  ReconnectToken,
  RoomName,
  SessionId,
} from '@parley/api/domain'
import * as Tools from '@parley/api/tools'
import {
  type ClientFrame,
  type HelloErrFrame,
  type RoomMessageEvent,
  ServerFrame,
  type SystemErrorEvent,
  type ToolErrRes,
  type ToolOkRes,
  ToolRequestId,
} from '@parley/api/wire'
import { Deferred, Effect, HashMap, Option, PubSub, Ref, Schema, Stream } from 'effect'

import { Handshake } from './Handshake'
import { WsConnection } from './WsConnection'

export type ParleyEvent = RoomMessageEvent | SystemErrorEvent

export class HandshakeFailedError extends Schema.TaggedError<HandshakeFailedError>()(
  'HandshakeFailedError',
  {
    code: Schema.String,
    message: Schema.String,
  },
) {}

const decodeServerFrame = Schema.decodeUnknown(ServerFrame)
const decodeJoin = Schema.decodeUnknown(Tools.JoinRoom.Result)
const decodeLeave = Schema.decodeUnknown(Tools.LeaveRoom.Result)
const decodeList = Schema.decodeUnknown(Tools.ListRooms.Result)
const decodeSend = Schema.decodeUnknown(Tools.SendMessage.Result)
const decodeWho = Schema.decodeUnknown(Tools.WhoIsHere.Result)

type ClientState = {
  readonly sessionId: SessionId
  readonly reconnectToken: ReconnectToken
}

const makeReqId = () => ToolRequestId.make(crypto.randomUUID())

const handshakeErrToError = (frame: HelloErrFrame) =>
  new HandshakeFailedError({ code: frame.code, message: frame.message })

export class ParleyClient extends Effect.Service<ParleyClient>()('ParleyClient', {
  accessors: true,
  dependencies: [WsConnection.Default, Handshake.Default],
  scoped: Effect.gen(function* () {
    const ws = yield* WsConnection
    const handshake = yield* Handshake

    const state = yield* Ref.make<Option.Option<ClientState>>(Option.none())
    const events = yield* PubSub.unbounded<ParleyEvent>()
    const pending = yield* Ref.make(
      HashMap.empty<ToolRequestId, Deferred.Deferred<ToolOkRes, ToolErrRes>>(),
    )
    const lastSeqByRoom = yield* Ref.make<Record<string, number>>({})

    const completeOk = (frame: ToolOkRes) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pending)
        const def = HashMap.get(map, frame.requestId)

        if (Option.isSome(def)) {
          yield* Deferred.succeed(def.value, frame)
          yield* Ref.update(pending, HashMap.remove(frame.requestId))
        }
      })

    const completeErr = (frame: ToolErrRes) =>
      Effect.gen(function* () {
        const map = yield* Ref.get(pending)
        const def = HashMap.get(map, frame.requestId)

        if (Option.isSome(def)) {
          yield* Deferred.fail(def.value, frame)
          yield* Ref.update(pending, HashMap.remove(frame.requestId))
        }
      })

    const processInbound = (raw: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* decodeServerFrame(raw).pipe(Effect.either)

        if (decoded._tag === 'Left') {
          yield* Effect.logWarning('failed to decode server frame')
          return
        }

        const frame = decoded.right

        switch (frame._tag) {
          case 'room.message': {
            yield* Ref.update(lastSeqByRoom, (m) => ({ ...m, [frame.room]: frame.seq }))
            yield* PubSub.publish(events, frame)
            return
          }

          case 'system.error': {
            yield* PubSub.publish(events, frame)
            return
          }

          case 'tool.ok': {
            yield* completeOk(frame)
            return
          }

          case 'tool.err': {
            yield* completeErr(frame)
            return
          }
        }
      })

    const pump: Effect.Effect<void, never, never> = Effect.gen(function* () {
      while (true) {
        const inbound = yield* ws.take()

        if (inbound._tag === 'closed') {
          return
        }

        if (inbound._tag === 'server') {
          yield* processInbound(inbound.raw)
        }
      }
    }).pipe(Effect.catchAllCause((c) => Effect.logError('client pump crashed', c)))

    const call = <A>(
      makeFrame: (requestId: ToolRequestId) => ClientFrame,
      decode: (raw: unknown) => Effect.Effect<A, unknown, never>,
    ) =>
      Effect.gen(function* () {
        const requestId = makeReqId()
        const def = yield* Deferred.make<ToolOkRes, ToolErrRes>()
        yield* Ref.update(pending, HashMap.set(requestId, def))
        yield* ws.send(makeFrame(requestId))
        const res = yield* Deferred.await(def)
        return yield* decode(res.result)
      })

    const connect = Effect.fn('ParleyClient.connect')(function* (params: {
      readonly url: string
      readonly authToken: Option.Option<BearerToken>
    }) {
      yield* ws.open({ url: params.url, authToken: params.authToken })

      const result = yield* handshake.send({
        authToken: params.authToken,
        resume: Option.none(),
      })

      if (result._tag === 'err') {
        return yield* handshakeErrToError(result.frame)
      }

      yield* Ref.set(
        state,
        Option.some<ClientState>({
          sessionId: result.sessionId,
          reconnectToken: result.reconnectToken,
        }),
      )

      yield* Effect.forkScoped(pump)
    })

    const joinRoom = Effect.fn('ParleyClient.joinRoom')(function* (
      room: RoomName,
      nickname?: Nickname,
    ) {
      return yield* call(
        (requestId) =>
          nickname !== undefined
            ? { _tag: 'tool.join_room', requestId, room, nickname }
            : { _tag: 'tool.join_room', requestId, room },
        decodeJoin,
      )
    })

    const leaveRoom = Effect.fn('ParleyClient.leaveRoom')(function* (room: RoomName) {
      return yield* call((requestId) => ({ _tag: 'tool.leave_room', requestId, room }), decodeLeave)
    })

    const listRooms = Effect.fn('ParleyClient.listRooms')(function* () {
      return yield* call((requestId) => ({ _tag: 'tool.list_rooms', requestId }), decodeList)
    })

    const sendMessage = Effect.fn('ParleyClient.sendMessage')(function* (
      room: RoomName,
      body: MessageBody,
    ) {
      return yield* call(
        (requestId) => ({ _tag: 'tool.send_message', requestId, room, body }),
        decodeSend,
      )
    })

    const whoIsHere = Effect.fn('ParleyClient.whoIsHere')(function* (room: RoomName) {
      return yield* call((requestId) => ({ _tag: 'tool.who_is_here', requestId, room }), decodeWho)
    })

    const ack = Effect.fn('ParleyClient.ack')(function* (room: RoomName, seq: number) {
      yield* ws.send({ _tag: 'ack', room, seq })
    })

    const sessionInfo = Effect.fn('ParleyClient.sessionInfo')(function* () {
      const s = yield* Ref.get(state)
      const seqs = yield* Ref.get(lastSeqByRoom)
      return Option.map(s, (c) => ({
        sessionId: c.sessionId,
        reconnectToken: c.reconnectToken,
        lastAckedSeqByRoom: seqs,
      }))
    })

    const incoming: Stream.Stream<ParleyEvent> = Stream.fromPubSub(events)

    return {
      connect,
      joinRoom,
      leaveRoom,
      listRooms,
      sendMessage,
      whoIsHere,
      ack,
      sessionInfo,
      incoming,
    }
  }),
}) {}
