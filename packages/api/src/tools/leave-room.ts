import { Schema } from 'effect'

import { RoomName } from '../domain/room'

export const TOOL_NAME = 'leave_room' as const

export const TOOL_DESCRIPTION = 'Leave a Parley Room. Silent — no other member is notified.'

export const ArgsFields = {
  room: RoomName,
} as const

export const Args = Schema.Struct(ArgsFields)
export type Args = Schema.Schema.Type<typeof Args>

export const Result = Schema.Struct({
  room: RoomName,
})
export type Result = Schema.Schema.Type<typeof Result>
