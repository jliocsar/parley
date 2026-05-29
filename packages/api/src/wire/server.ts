import * as Schema from 'effect/Schema'

import { MessageId } from '../domain/ids'
import { MessageBody } from '../domain/message'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'
import { ToolRequestId } from './client'
import { HelloErrorCode } from './hello'

export const RoomMessageEvent = Schema.TaggedStruct('room.message', {
  room: RoomName,
  seq: Schema.Number,
  messageId: MessageId,
  fromNickname: Nickname,
  body: MessageBody,
  sentAt: Schema.DateTimeUtc,
})
export type RoomMessageEvent = Schema.Schema.Type<typeof RoomMessageEvent>

// Closed set of tool-failure codes carried on `tool.err`. Mirrors the
// `HelloErrorCode` pattern so clients can discriminate failures exhaustively
// instead of switching on an open string.
export const ToolErrorCode = Schema.Literal(
  'NicknameTakenError',
  'RateLimitedError',
  'NotInRoomError',
  'InternalError',
)
export type ToolErrorCode = Schema.Schema.Type<typeof ToolErrorCode>

// `system.error` carries either a server-side framing failure or a relayed
// handshake failure (the client republishes a failed reconnect's hello error
// as a system error), so the code set is `BadFrameError` ∪ HelloErrorCode.
export const SystemErrorCode = Schema.Union(Schema.Literal('BadFrameError'), HelloErrorCode)
export type SystemErrorCode = Schema.Schema.Type<typeof SystemErrorCode>

export const SystemErrorEvent = Schema.TaggedStruct('system.error', {
  code: SystemErrorCode,
  message: Schema.String,
})
export type SystemErrorEvent = Schema.Schema.Type<typeof SystemErrorEvent>

export const ToolOkRes = Schema.TaggedStruct('tool.ok', {
  requestId: ToolRequestId,
  result: Schema.Unknown,
})
export type ToolOkRes = Schema.Schema.Type<typeof ToolOkRes>

export const ToolErrRes = Schema.TaggedStruct('tool.err', {
  requestId: ToolRequestId,
  code: ToolErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
})
export type ToolErrRes = Schema.Schema.Type<typeof ToolErrRes>

export const ServerFrame = Schema.Union(RoomMessageEvent, SystemErrorEvent, ToolOkRes, ToolErrRes)
export type ServerFrame = Schema.Schema.Type<typeof ServerFrame>
