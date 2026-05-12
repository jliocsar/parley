import { Schema } from 'effect'

import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'

export const TOOL_NAME = 'list_rooms' as const

export const TOOL_DESCRIPTION =
  'List Rooms. Returns Rooms the current Session is in (with the Nickname used in each) and Rooms available to join.'

export const Args = Schema.Struct({})
export type Args = Schema.Schema.Type<typeof Args>

export const JoinedRoom = Schema.Struct({
  name: RoomName,
  nickname: Nickname,
  membersCount: Schema.Number,
})
export type JoinedRoom = Schema.Schema.Type<typeof JoinedRoom>

export const AvailableRoom = Schema.Struct({
  name: RoomName,
  membersCount: Schema.Number,
})
export type AvailableRoom = Schema.Schema.Type<typeof AvailableRoom>

export const Result = Schema.Struct({
  joined: Schema.Array(JoinedRoom),
  available: Schema.Array(AvailableRoom),
})
export type Result = Schema.Schema.Type<typeof Result>
