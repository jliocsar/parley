import * as Schema from 'effect/Schema'

import { MessageId } from '../domain/ids'
import { MessageBody } from '../domain/message'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'
import { ToolRequestId } from './client'

export const RoomMessageEvent = Schema.TaggedStruct('room.message', {
  room: RoomName,
  seq: Schema.Number,
  messageId: MessageId,
  fromNickname: Nickname,
  body: MessageBody,
  sentAt: Schema.DateTimeUtc,
})
export type RoomMessageEvent = Schema.Schema.Type<typeof RoomMessageEvent>

export const SystemErrorEvent = Schema.TaggedStruct('system.error', {
  code: Schema.String,
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
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
})
export type ToolErrRes = Schema.Schema.Type<typeof ToolErrRes>

export const ServerFrame = Schema.Union(RoomMessageEvent, SystemErrorEvent, ToolOkRes, ToolErrRes)
export type ServerFrame = Schema.Schema.Type<typeof ServerFrame>
