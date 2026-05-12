import type { ServerWebSocket } from 'bun'
import { Effect, MutableHashMap, Option } from 'effect'

import type { AuthLabel, ReconnectToken, SessionId } from '../domain/ids'

type SocketData = { sessionId: SessionId; handshakeComplete: boolean }

export type SessionState = {
  readonly id: SessionId
  readonly authLabel: Option.Option<AuthLabel>
  readonly clientVersion: string
  readonly connectedAt: Date
  readonly reconnectToken: ReconnectToken
  readonly socket: Option.Option<ServerWebSocket<SocketData>>
}

export class SessionRegistry extends Effect.Service<SessionRegistry>()('SessionRegistry', {
  accessors: true,
  effect: Effect.gen(function* () {
    const store = MutableHashMap.empty<SessionId, SessionState>()

    const updateSocket = (id: SessionId, socket: Option.Option<ServerWebSocket<SocketData>>) =>
      Effect.sync(() => {
        const existing = MutableHashMap.get(store, id)

        if (Option.isSome(existing)) {
          MutableHashMap.set(store, id, { ...existing.value, socket })
        }
      })

    const register = Effect.fn('SessionRegistry.register')(function* (state: SessionState) {
      yield* Effect.sync(() => MutableHashMap.set(store, state.id, state))
    })

    const get = Effect.fn('SessionRegistry.get')(function* (id: SessionId) {
      return yield* Effect.sync(() => MutableHashMap.get(store, id))
    })

    const attachSocket = Effect.fn('SessionRegistry.attachSocket')(function* (
      id: SessionId,
      socket: ServerWebSocket<SocketData>,
    ) {
      yield* updateSocket(id, Option.some(socket))
    })

    const detachSocket = Effect.fn('SessionRegistry.detachSocket')(function* (id: SessionId) {
      yield* updateSocket(id, Option.none())
    })

    const remove = Effect.fn('SessionRegistry.remove')(function* (id: SessionId) {
      yield* Effect.sync(() => MutableHashMap.remove(store, id))
    })

    const list = Effect.fn('SessionRegistry.list')(function* () {
      return yield* Effect.sync(() => Array.from(MutableHashMap.values(store)))
    })

    return { register, get, attachSocket, detachSocket, remove, list }
  }),
}) {}
