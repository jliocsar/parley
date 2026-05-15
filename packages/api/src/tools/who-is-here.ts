import { Schema } from 'effect'

import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'

export const TOOL_NAME = 'who_is_here' as const

export const TOOL_DESCRIPTION = 'List Nicknames currently present in a Room you are in.'

export const ArgsFields = {
  room: RoomName,
} as const

export const Args = Schema.Struct(ArgsFields)
export type Args = Schema.Schema.Type<typeof Args>

export const Result = Schema.Struct({
  room: RoomName,
  nicknames: Schema.Array(Nickname),
})
export type Result = Schema.Schema.Type<typeof Result>
