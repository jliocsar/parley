import * as Schema from 'effect/Schema'

import { BearerToken, ReconnectToken, SessionId } from '../domain/ids'
import { RoomName } from '../domain/room'

export const ResumeBlock = Schema.Struct({
  sessionId: SessionId,
  reconnectToken: ReconnectToken,
  lastAckedSeqByRoom: Schema.Record({ key: RoomName, value: Schema.Number }),
})
export type ResumeBlock = Schema.Schema.Type<typeof ResumeBlock>

export const HelloFrame = Schema.TaggedStruct('hello', {
  clientVersion: Schema.String,
  authToken: Schema.optional(BearerToken),
  resume: Schema.optional(ResumeBlock),
})
export type HelloFrame = Schema.Schema.Type<typeof HelloFrame>

export const HelloOkFrame = Schema.TaggedStruct('hello.ok', {
  sessionId: SessionId,
  reconnectToken: ReconnectToken,
  serverVersion: Schema.String,
})
export type HelloOkFrame = Schema.Schema.Type<typeof HelloOkFrame>

export const HelloErrorCode = Schema.Literal(
  'AuthRequiredError',
  'BadTokenError',
  'TokenRevokedError',
  'VersionMismatchError',
  'ServerShuttingDownError',
  'UnknownSessionError',
  'BadReconnectTokenError',
  'ReplayBufferOverflowError',
  'BadHandshakeFrameError',
)
export type HelloErrorCode = Schema.Schema.Type<typeof HelloErrorCode>

export const HelloErrFrame = Schema.TaggedStruct('hello.err', {
  code: HelloErrorCode,
  message: Schema.String,
})
export type HelloErrFrame = Schema.Schema.Type<typeof HelloErrFrame>
