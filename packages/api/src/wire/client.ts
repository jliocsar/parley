import { Schema } from 'effect'

import { MessageBody } from '../domain/message'
import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'

export const ToolRequestId = Schema.String.pipe(Schema.brand('@parley/ToolRequestId'))
export type ToolRequestId = Schema.Schema.Type<typeof ToolRequestId>

export const JoinRoomReq = Schema.TaggedStruct('tool.join_room', {
  requestId: ToolRequestId,
  room: RoomName,
  nickname: Schema.optional(Nickname),
})
export type JoinRoomReq = Schema.Schema.Type<typeof JoinRoomReq>

export const LeaveRoomReq = Schema.TaggedStruct('tool.leave_room', {
  requestId: ToolRequestId,
  room: RoomName,
})
export type LeaveRoomReq = Schema.Schema.Type<typeof LeaveRoomReq>

export const ListRoomsReq = Schema.TaggedStruct('tool.list_rooms', {
  requestId: ToolRequestId,
})
export type ListRoomsReq = Schema.Schema.Type<typeof ListRoomsReq>

export const SendMessageReq = Schema.TaggedStruct('tool.send_message', {
  requestId: ToolRequestId,
  room: RoomName,
  body: MessageBody,
})
export type SendMessageReq = Schema.Schema.Type<typeof SendMessageReq>

export const WhoIsHereReq = Schema.TaggedStruct('tool.who_is_here', {
  requestId: ToolRequestId,
  room: RoomName,
})
export type WhoIsHereReq = Schema.Schema.Type<typeof WhoIsHereReq>

export const AckFrame = Schema.TaggedStruct('ack', {
  room: RoomName,
  seq: Schema.Number,
})
export type AckFrame = Schema.Schema.Type<typeof AckFrame>

export const ClientFrame = Schema.Union(
  JoinRoomReq,
  LeaveRoomReq,
  ListRoomsReq,
  SendMessageReq,
  WhoIsHereReq,
  AckFrame,
)
export type ClientFrame = Schema.Schema.Type<typeof ClientFrame>
