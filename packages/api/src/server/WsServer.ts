import type { ServerWebSocket } from 'bun'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Option from 'effect/Option'
import * as Runtime from 'effect/Runtime'
import * as Schema from 'effect/Schema'
import { ServerConfig } from '../config'
import type { AuthLabel, BearerToken } from '../domain/ids'
import { SessionId } from '../domain/ids'
import type { TokenRevokedError } from '../errors/auth'
import { AuthRequiredError } from '../errors/auth'
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

// The WebSocket close (code, reason) for every handshake rejection, keyed by error code.
// Exhaustive over HelloErrorCode so the close contract is auditable in one place and a new
// error code cannot be added without deciding how the socket closes.
const HELLO_CLOSE: Record<HelloErrorCode, readonly [number, string]> = {
  AuthRequiredError: [4000, 'auth failed'],
  TokenRevokedError: [4000, 'auth failed'],
  VersionMismatchError: [4004, 'version mismatch'],
  ServerShuttingDownError: [1001, 'server shutting down'],
  UnknownSessionError: [4001, 'unknown session'],
  BadReconnectTokenError: [4002, 'bad reconnect token'],
  ReplayBufferOverflowError: [4003, 'replay buffer overflow'],
  BadHandshakeFrameError: [1002, 'bad handshake'],
}

interface WsData {
  sessionId: SessionId
  handshakeComplete: boolean
}

const encodeHelloOk = Schema.encodeSync(Schema.parseJson(HelloOkFrame))
const encodeHelloErr = Schema.encodeSync(Schema.parseJson(HelloErrFrame))
const encodeServerFrame = Schema.encodeSync(Schema.parseJson(ServerFrame))
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
  // eslint-disable-next-line max-lines-per-function -- full WS server lifecycle (helpers + handlers + listener); extracting into helpers would scatter the closure over `config`/`fork`/registries
  scoped: Effect.gen(function*() {
    const config = yield* ServerConfig
    const tokens = yield* TokenService
    const sessions = yield* SessionRegistry
    const memberships = yield* MembershipRegistry
    const fanout = yield* FanoutService
    const rateLimiter = yield* RateLimiter
    const cryptoSvc = yield* CryptoService
    const tools = yield* ToolRuntime

    const runtime = yield* Effect.runtime()
    const fork = <A, E>(eff: Effect.Effect<A, E>) => Runtime.runFork(runtime)(eff)

    const expiryFibers = new Map<SessionId, Fiber.RuntimeFiber<void>>()

    yield* Effect.addFinalizer(() =>
      Effect.gen(function*() {
        yield* Effect.forEach(Array.from(expiryFibers.values()), Fiber.interrupt, {
          discard: true,
        })
        expiryFibers.clear()
      })
    )

    const safeSend = (ws: ServerWebSocket<WsData>, json: string) =>
      Effect.try(() => ws.send(json)).pipe(
        Effect.catchTag(
          'UnknownException',
          () => Effect.logDebug('failed to send frame to socket'),
        ),
      )

    const sendEncoded = <A>(
      ws: ServerWebSocket<WsData>,
      encode: (a: A) => string,
      frame: A,
      label: string,
    ) =>
      Effect.try(() => encode(frame)).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.logError(`failed to encode ${label}`),
          onSuccess: (encoded) => safeSend(ws, encoded),
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
        // A dead database (DbError) or a corrupt row (ParseError) is not an auth decision —
        // crash rather than masking infrastructure failure as "token revoked".
        Effect.catchTags({
          DbError: (cause) => Effect.die(cause),
          ParseError: (cause) => Effect.die(cause),
        }),
      )
    }

    const rejectHello = (ws: ServerWebSocket<WsData>, code: HelloErrorCode, message: string) => {
      const [closeCode, closeReason] = HELLO_CLOSE[code]

      return sendHelloErr(ws, code, message).pipe(
        Effect.zipRight(Effect.sync(() => {
          ws.close(closeCode, closeReason)
        })),
      )
    }

    const handleResumeHello = (
      ws: ServerWebSocket<WsData>,
      resume: NonNullable<HelloFrame['resume']>,
    ) =>
      Effect.gen(function*() {
        const existing = yield* sessions.get(resume.sessionId)

        if (Option.isNone(existing)) {
          yield* rejectHello(ws, 'UnknownSessionError', 'No such session')
          return
        }

        if (existing.value.reconnectToken !== resume.reconnectToken) {
          yield* rejectHello(ws, 'BadReconnectTokenError', 'Bad reconnect token')
          return
        }

        const replayed = yield* fanout
          .replay(resume.sessionId, resume.lastAckedSeqByRoom)
          .pipe(Effect.either)

        if (replayed._tag === 'Left') {
          yield* rejectHello(ws, 'ReplayBufferOverflowError', replayed.left.message)
          return
        }

        ws.data.sessionId = resume.sessionId
        yield* cancelExpiry(resume.sessionId)
        yield* sessions.attachSocket(resume.sessionId, ws)
        // Mark handshake-complete only after the socket is attached, so the invariant
        // "handshakeComplete ⇒ session has an attached socket" always holds.
        ws.data.handshakeComplete = true

        yield* sendHelloOk(ws, {
          _tag: 'hello.ok',
          sessionId: resume.sessionId,
          reconnectToken: existing.value.reconnectToken,
          serverVersion: SERVER_VERSION,
        })

        yield* Effect.forEach(replayed.right, (ev) => sendServerFrame(ws, ev), { discard: true })
      })

    const handleFreshHello = (ws: ServerWebSocket<WsData>, hello: HelloFrame) =>
      Effect.gen(function*() {
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
          AuthRequiredError: (err) => rejectHello(ws, 'AuthRequiredError', err.message),
          TokenRevokedError: (err) => rejectHello(ws, 'TokenRevokedError', err.message),
        }),
      )

    const handleHello = (ws: ServerWebSocket<WsData>, raw: unknown) =>
      Effect.gen(function*() {
        const decoded = yield* decodeHello(raw).pipe(Effect.either)

        if (decoded._tag === 'Left') {
          yield* rejectHello(ws, 'BadHandshakeFrameError', 'Could not decode hello frame')
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
            response === undefined ? Effect.void : sendServerFrame(ws, response)
          ),
        )

    const handleMessage = (ws: ServerWebSocket<WsData>, text: string) =>
      Effect.gen(function*() {
        // Parse JSON before schema-decoding so we can distinguish transport garbage
        // (not even JSON → silently dropped) from a well-formed-but-invalid frame
        // (decoded below → answered with a protocol error). Fusing this into
        // Schema.parseJson would collapse both into one indistinguishable ParseError.
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
            Effect.gen(function*() {
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
            })
          ),
        )
      }).pipe(Effect.catchAllCause((cause) => Effect.logError('handleMessage crashed', cause)))

    const performSessionExpiry = (sessionId: SessionId) =>
      Effect.gen(function*() {
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
      Effect.gen(function*() {
        const fiber = expiryFibers.get(sessionId)

        if (fiber) {
          expiryFibers.delete(sessionId)
          yield* Fiber.interrupt(fiber)
        }
      })

    const handleClose = (ws: ServerWebSocket<WsData>) =>
      Effect.gen(function*() {
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
              return undefined
            }

            return new Response('upgrade failed', { status: 400 })
          },
          websocket: {
            // eslint-disable-next-line @typescript-eslint/no-empty-function -- Bun WS requires a handler; per-session setup happens in `message` on the `hello` frame
            open(_ws: ServerWebSocket<WsData>) {},
            message(ws: ServerWebSocket<WsData>, data: string | Buffer) {
              const text = typeof data === 'string' ? data : data.toString('utf8')
              fork(handleMessage(ws, text))
            },
            close(ws: ServerWebSocket<WsData>) {
              fork(handleClose(ws))
            },
          },
        })
      ),
      (s) => Effect.promise(() => s.stop()),
    )

    yield* Effect.log(`Parley server listening on ws://${config.bind}:${config.port}`)

    return { server }
  }),
}) {}
