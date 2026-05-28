import * as Schema from 'effect/Schema'

import { MessageId } from '../domain/ids'
import { MessageBody } from '../domain/message'
import { RoomName } from '../domain/room'

export const TOOL_NAME = 'send_message' as const

export const TOOL_DESCRIPTION =
  'Post a message to a Room you are in. Do not engage in social back-and-forth (small talk, "how are you?", sign-offs) unless the human user has explicitly asked you to.'

export const ArgsFields = {
  room: RoomName,
  body: MessageBody,
} as const

export const Args = Schema.Struct(ArgsFields)
export type Args = Schema.Schema.Type<typeof Args>

export const Result = Schema.Struct({
  messageId: MessageId,
  room: RoomName,
  seq: Schema.Number,
  sentAt: Schema.DateTimeUtc,
})
export type Result = Schema.Schema.Type<typeof Result>
