import type { ServerWebSocket } from 'bun'
import { Effect, Fiber, Option, Runtime, Schema } from 'effect'

import { ServerConfig } from '../config'
import type { AuthLabel, BearerToken } from '../domain/ids'
import { SessionId } from '../domain/ids'
import { AuthRequiredError, TokenRevokedError } from '../errors/auth'
import { CryptoService } from '../services/Crypto'
import { FanoutService } from '../services/FanoutService'
import { MembershipRegistry } from '../services/MembershipRegistry'
import { RateLimiter } from '../services/RateLimiter'
import { SessionRegistry } from '../services/SessionRegistry'
import { TokenService } from '../services/TokenService'
import { ClientFrame, type ToolRequestId } from '../wire/client'
import { HelloErrFrame, type HelloErrorCode, HelloFrame, HelloOkFrame } from '../wire/hello'
import {
  type RoomMessageEvent,
  ServerFrame,
  type SystemErrorEvent,
  type ToolErrRes,
  type ToolOkRes,
} from '../wire/server'
import { ToolRuntime } from './ToolRuntime'

const SERVER_VERSION = '0.1.0'
const SESSION_EXPIRY_MS = 60_000

type WsData = {
  sessionId: SessionId
  handshakeComplete: boolean
}

const encodeHelloOk = Schema.encodeSync(HelloOkFrame)
const encodeHelloErr = Schema.encodeSync(HelloErrFrame)
const encodeServerFrame = Schema.encodeSync(ServerFrame)
const decodeHello = Schema.decodeUnknown(HelloFrame)
const decodeClient = Schema.decodeUnknown(ClientFrame)

export class WsServer extends Effect.Service<WsServer>()('WsServer', {
  accessors: true,
  dependencies: [
    TokenService.Default,
    SessionRegistry.Default,
    MembershipRegistry.Default,
    FanoutService.Default,
    RateLimiter.Default,
    CryptoService.Default,
    ToolRuntime.Default,
  ],
  scoped: Effect.gen(function* () {
    const config = yield* ServerConfig
    const tokens = yield* TokenService
    const sessions = yield* SessionRegistry
    const memberships = yield* MembershipRegistry
    const fanout = yield* FanoutService
    const rateLimiter = yield* RateLimiter
    const cryptoSvc = yield* CryptoService
    const tools = yield* ToolRuntime

    const runtime = yield* Effect.runtime<never>()
    const fork = <A, E>(eff: Effect.Effect<A, E, never>) => Runtime.runFork(runtime)(eff)

    const expiryFibers = new Map<SessionId, Fiber.RuntimeFiber<void, never>>()

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Effect.forEach(Array.from(expiryFibers.values()), Fiber.interrupt, {
          discard: true,
        })
        expiryFibers.clear()
      }),
    )

    const safeSend = (ws: ServerWebSocket<WsData>, json: string) =>
      Effect.sync(() => {
        try {
          ws.send(json)
        } catch {}
      })

    const sendEncoded = <A, I>(
      ws: ServerWebSocket<WsData>,
      encode: (a: A) => I,
      frame: A,
      label: string,
    ) =>
      Effect.try(() => encode(frame)).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.logError(`failed to encode ${label}`),
          onSuccess: (e) => safeSend(ws, JSON.stringify(e)),
        }),
      )

    const sendHelloOk = (ws: ServerWebSocket<WsData>, frame: HelloOkFrame) =>
      sendEncoded(ws, encodeHelloOk, frame, 'hello.ok')

    const sendHelloErr = (ws: ServerWebSocket<WsData>, code: HelloErrorCode, message: string) =>
      sendEncoded(ws, encodeHelloErr, { _tag: 'hello.err', code, message }, 'hello.err')

    const sendServerFrame = (
      ws: ServerWebSocket<WsData>,
      frame: ToolOkRes | ToolErrRes | SystemErrorEvent | RoomMessageEvent,
    ) => sendEncoded(ws, encodeServerFrame, frame, 'server frame')

    const sendToolErr = (
      ws: ServerWebSocket<WsData>,
      requestId: ToolRequestId,
      code: string,
      message: string,
      details?: unknown,
    ) => sendServerFrame(ws, { _tag: 'tool.err', requestId, code, message, details })

    const runAuth = (
      token: BearerToken | undefined,
    ): Effect.Effect<Option.Option<AuthLabel>, AuthRequiredError | TokenRevokedError> => {
      if (!config.authEnabled) {
        return Effect.succeed(Option.none<AuthLabel>())
      }

      if (token === undefined) {
        return Effect.fail(new AuthRequiredError({ message: 'Auth required' }))
      }

      return tokens.verify(token).pipe(
        Effect.map(Option.some),
        Effect.catchAll((err) =>
          err._tag === 'TokenRevokedError'
            ? Effect.fail(err)
            : Effect.fail(new TokenRevokedError({ label: '', message: err.message })),
        ),
      )
    }

    const closeAuthFailure = (
      ws: ServerWebSocket<WsData>,
      code: 'AuthRequiredError' | 'TokenRevokedError',
      message: string,
    ) =>
      sendHelloErr(ws, code, message).pipe(
        Effect.zipRight(Effect.sync(() => ws.close(4000, 'auth failed'))),
      )

    const handleResumeHello = (
      ws: ServerWebSocket<WsData>,
      resume: NonNullable<HelloFrame['resume']>,
    ) =>
      Effect.gen(function* () {
        const existing = yield* sessions.get(resume.sessionId)

        if (Option.isNone(existing)) {
          yield* sendHelloErr(ws, 'UnknownSessionError', 'No such session')
          yield* Effect.sync(() => ws.close(4001, 'unknown session'))
          return
        }

        if (existing.value.reconnectToken !== resume.reconnectToken) {
          yield* sendHelloErr(ws, 'BadReconnectTokenError', 'Bad reconnect token')
          yield* Effect.sync(() => ws.close(4002, 'bad reconnect token'))
          return
        }

        const replayed = yield* fanout
          .replay(resume.sessionId, resume.lastAckedSeqByRoom as Record<string, number>)
          .pipe(Effect.either)

        if (replayed._tag === 'Left') {
          yield* sendHelloErr(ws, 'ReplayBufferOverflowError', replayed.left.message)
          yield* Effect.sync(() => ws.close(4003, 'replay buffer overflow'))
          return
        }

        ws.data.sessionId = resume.sessionId
        ws.data.handshakeComplete = true
        yield* cancelExpiry(resume.sessionId)
        yield* sessions.attachSocket(resume.sessionId, ws)

        yield* sendHelloOk(ws, {
          _tag: 'hello.ok',
          sessionId: resume.sessionId,
          reconnectToken: existing.value.reconnectToken,
          serverVersion: SERVER_VERSION,
        })

        yield* Effect.forEach(replayed.right, (ev) => sendServerFrame(ws, ev), { discard: true })
      })

    const handleFreshHello = (ws: ServerWebSocket<WsData>, hello: HelloFrame) =>
      Effect.gen(function* () {
        const label = yield* runAuth(hello.authToken)
        const reconnectToken = yield* cryptoSvc.issueReconnectToken()
        const sessionId = ws.data.sessionId

        yield* sessions.register({
          id: sessionId,
          authLabel: label,
          clientVersion: hello.clientVersion,
          connectedAt: new Date(),
          reconnectToken,
          socket: Option.some(ws),
        })

        ws.data.handshakeComplete = true

        yield* sendHelloOk(ws, {
          _tag: 'hello.ok',
          sessionId,
          reconnectToken,
          serverVersion: SERVER_VERSION,
        })
      }).pipe(
        Effect.catchTags({
          AuthRequiredError: (err) => closeAuthFailure(ws, 'AuthRequiredError', err.message),
          TokenRevokedError: (err) => closeAuthFailure(ws, 'TokenRevokedError', err.message),
        }),
      )

    const handleHello = (ws: ServerWebSocket<WsData>, raw: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* decodeHello(raw).pipe(Effect.either)

        if (decoded._tag === 'Left') {
          yield* sendHelloErr(ws, 'BadHandshakeFrameError', 'Could not decode hello frame')
          yield* Effect.sync(() => ws.close(1002, 'bad handshake'))
          return
        }

        const hello = decoded.right

        if (hello.resume !== undefined) {
          yield* handleResumeHello(ws, hello.resume)
          return
        }

        yield* handleFreshHello(ws, hello)
      })

    const dispatch = (ws: ServerWebSocket<WsData>, frame: ClientFrame) =>
      tools
        .run(ws.data.sessionId, frame)
        .pipe(
          Effect.flatMap((response) =>
            response === undefined ? Effect.void : sendServerFrame(ws, response),
          ),
        )

    const handleMessage = (ws: ServerWebSocket<WsData>, text: string) =>
      Effect.gen(function* () {
        const parsed = yield* Effect.try({
          try: () => JSON.parse(text) as unknown,
          catch: () => 'bad-json' as const,
        }).pipe(Effect.either)

        if (parsed._tag === 'Left') {
          yield* Effect.logWarning('bad json frame from client')
          return
        }

        const raw = parsed.right

        if (!ws.data.handshakeComplete) {
          yield* handleHello(ws, raw)
          return
        }

        const frameResult = yield* decodeClient(raw).pipe(Effect.either)

        if (frameResult._tag === 'Left') {
          yield* sendServerFrame(ws, {
            _tag: 'system.error',
            code: 'BadFrameError',
            message: 'Could not decode client frame',
          })
          return
        }

        yield* dispatch(ws, frameResult.right).pipe(
          Effect.catchAllCause((cause) =>
            Effect.gen(function* () {
              yield* Effect.logError('client frame handler crashed', cause)

              const tag = frameResult.right._tag

              if (tag !== 'ack') {
                yield* sendToolErr(
                  ws,
                  frameResult.right.requestId,
                  'InternalError',
                  'Internal server error',
                )
              }
            }),
          ),
        )
      }).pipe(Effect.catchAllCause((cause) => Effect.logError('handleMessage crashed', cause)))

    const performSessionExpiry = (sessionId: SessionId) =>
      Effect.gen(function* () {
        yield* memberships.dropSession(sessionId)
        yield* fanout.dropSession(sessionId)
        yield* rateLimiter.dropSession(sessionId)
        yield* sessions.remove(sessionId)
        expiryFibers.delete(sessionId)
      }).pipe(Effect.catchAllCause((cause) => Effect.logError('session expiry crashed', cause)))

    const scheduleExpiry = (sessionId: SessionId) =>
      Effect.sync(() => {
        const fiber = Runtime.runFork(runtime)(
          Effect.sleep(SESSION_EXPIRY_MS).pipe(Effect.zipRight(performSessionExpiry(sessionId))),
        )
        expiryFibers.set(sessionId, fiber)
      })

    const cancelExpiry = (sessionId: SessionId) =>
      Effect.gen(function* () {
        const fiber = expiryFibers.get(sessionId)

        if (fiber) {
          expiryFibers.delete(sessionId)
          yield* Fiber.interrupt(fiber)
        }
      })

    const handleClose = (ws: ServerWebSocket<WsData>) =>
      Effect.gen(function* () {
        const sessionId = ws.data.sessionId

        if (!ws.data.handshakeComplete) {
          yield* sessions.remove(sessionId)
          return
        }

        yield* sessions.detachSocket(sessionId)
        yield* scheduleExpiry(sessionId)
      }).pipe(Effect.catchAllCause((cause) => Effect.logError('handleClose crashed', cause)))

    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve<WsData>({
          port: config.port,
          hostname: config.bind,
          fetch(req, srv) {
            const sessionId = SessionId.make(crypto.randomUUID())

            if (srv.upgrade(req, { data: { sessionId, handshakeComplete: false } })) {
              return undefined as unknown as Response
            }

            return new Response('upgrade failed', { status: 400 })
          },
          websocket: {
            open(_ws: ServerWebSocket<WsData>) {},
            message(ws: ServerWebSocket<WsData>, data: string | Buffer) {
              const text = typeof data === 'string' ? data : data.toString('utf8')
              fork(handleMessage(ws, text))
            },
            close(ws: ServerWebSocket<WsData>) {
              fork(handleClose(ws))
            },
          },
        }),
      ),
      (s) => Effect.promise(() => s.stop()),
    )

    yield* Effect.log(`Parley server listening on ws://${config.bind}:${config.port}`)

    return { server }
  }),
}) {}
