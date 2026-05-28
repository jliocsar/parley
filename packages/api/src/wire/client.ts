import * as Schema from 'effect/Schema'

import { RoomName } from '../domain/room'
import { TOOLS } from '../tools/registry'

export const ToolRequestId = Schema.String.pipe(Schema.brand('@parley/ToolRequestId'))
export type ToolRequestId = Schema.Schema.Type<typeof ToolRequestId>

const requestFields = {
  requestId: ToolRequestId,
} as const

export const JoinRoomReq = Schema.TaggedStruct(TOOLS.join_room.tag, {
  ...requestFields,
  ...TOOLS.join_room.argsFields,
})
export type JoinRoomReq = Schema.Schema.Type<typeof JoinRoomReq>

export const LeaveRoomReq = Schema.TaggedStruct(TOOLS.leave_room.tag, {
  ...requestFields,
  ...TOOLS.leave_room.argsFields,
})
export type LeaveRoomReq = Schema.Schema.Type<typeof LeaveRoomReq>

export const ListRoomsReq = Schema.TaggedStruct(TOOLS.list_rooms.tag, {
  ...requestFields,
  ...TOOLS.list_rooms.argsFields,
})
export type ListRoomsReq = Schema.Schema.Type<typeof ListRoomsReq>

export const SendMessageReq = Schema.TaggedStruct(TOOLS.send_message.tag, {
  ...requestFields,
  ...TOOLS.send_message.argsFields,
})
export type SendMessageReq = Schema.Schema.Type<typeof SendMessageReq>

export const WhoIsHereReq = Schema.TaggedStruct(TOOLS.who_is_here.tag, {
  ...requestFields,
  ...TOOLS.who_is_here.argsFields,
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
