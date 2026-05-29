import type { ServerWebSocket } from 'bun'
import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import type { AuthLabel, ReconnectToken, SessionId } from '../domain/ids'

interface SocketData {
  sessionId: SessionId
  handshakeComplete: boolean
}

export interface SessionState {
  readonly id: SessionId
  readonly authLabel: Option.Option<AuthLabel>
  readonly clientVersion: string
  readonly connectedAt: Date
  readonly reconnectToken: ReconnectToken
  readonly socket: Option.Option<ServerWebSocket<SocketData>>
}

export class SessionRegistry extends Effect.Service<SessionRegistry>()('SessionRegistry', {
  accessors: true,
  effect: Effect.gen(function*() {
    const store = MutableHashMap.empty<SessionId, SessionState>()

    const updateSocket = (id: SessionId, socket: Option.Option<ServerWebSocket<SocketData>>) => {
      const existing = MutableHashMap.get(store, id)

      if (Option.isSome(existing)) {
        MutableHashMap.set(store, id, { ...existing.value, socket })
      }
    }

    const register = (state: SessionState) =>
      Effect.sync(() => MutableHashMap.set(store, state.id, state)).pipe(
        Effect.withSpan('SessionRegistry.register'),
      )

    const get = (id: SessionId) =>
      Effect.sync(() => MutableHashMap.get(store, id)).pipe(Effect.withSpan('SessionRegistry.get'))

    const attachSocket = (id: SessionId, socket: ServerWebSocket<SocketData>) =>
      Effect.sync(() => {
        updateSocket(id, Option.some(socket))
      }).pipe(
        Effect.withSpan('SessionRegistry.attachSocket'),
      )

    const detachSocket = (id: SessionId) =>
      Effect.sync(() => {
        updateSocket(id, Option.none())
      }).pipe(
        Effect.withSpan('SessionRegistry.detachSocket'),
      )

    const remove = (id: SessionId) =>
      Effect.sync(() => MutableHashMap.remove(store, id)).pipe(
        Effect.withSpan('SessionRegistry.remove'),
      )

    const list = () =>
      Effect.sync(() => Array.from(MutableHashMap.values(store))).pipe(
        Effect.withSpan('SessionRegistry.list'),
      )

    const sendTo = (id: SessionId, payload: string) =>
      Effect.suspend(() => {
        const session = MutableHashMap.get(store, id)

        if (Option.isNone(session) || Option.isNone(session.value.socket)) {
          return Effect.void
        }

        const socket = session.value.socket.value

        return Effect.try(() => socket.send(payload)).pipe(
          // A throwing send means the socket is dead; detach it so fanout stops
          // retrying a corpse, and surface it instead of swallowing silently.
          Effect.catchTag('UnknownException', () =>
            Effect.logDebug('detaching dead socket after failed send').pipe(
              Effect.zipRight(Effect.sync(() => {
                updateSocket(id, Option.none())
              })),
            )),
        )
      }).pipe(Effect.withSpan('SessionRegistry.sendTo'))

    return { register, get, attachSocket, detachSocket, remove, list, sendTo }
  }),
}) {}
