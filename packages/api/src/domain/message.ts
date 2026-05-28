import * as Schema from 'effect/Schema'

import { MessageId } from './ids'
import { Nickname } from './nickname'
import { RoomName } from './room'

export const MESSAGE_BODY_MAX_BYTES = 8192

export const MessageBody = Schema.String.pipe(
  Schema.minLength(1),
  Schema.filter((s) => new TextEncoder().encode(s).byteLength <= MESSAGE_BODY_MAX_BYTES, {
    message: () => `Message body must be ≤ ${MESSAGE_BODY_MAX_BYTES} bytes UTF-8`,
  }),
  Schema.brand('@parley/MessageBody'),
)
export type MessageBody = Schema.Schema.Type<typeof MessageBody>

export const Message = Schema.Struct({
  id: MessageId,
  room: RoomName,
  fromNickname: Nickname,
  body: MessageBody,
  sentAt: Schema.DateTimeUtc,
})
export type Message = Schema.Schema.Type<typeof Message>
