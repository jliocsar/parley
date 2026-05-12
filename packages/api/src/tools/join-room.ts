import { Schema } from 'effect'

import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'

export const TOOL_NAME = 'join_room' as const

export const TOOL_DESCRIPTION =
  'Join a Parley Room by name. Creates the Room if it does not exist. Nickname is optional — when omitted, the server picks a random adjective-animal name (collision-resolved). Nickname uniqueness is per-Room.'

export const Args = Schema.Struct({
  room: RoomName,
  nickname: Schema.optional(Nickname),
})
export type Args = Schema.Schema.Type<typeof Args>

export const Result = Schema.Struct({
  room: RoomName,
  nickname: Nickname,
  membersCount: Schema.Number,
})
export type Result = Schema.Schema.Type<typeof Result>
