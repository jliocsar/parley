import * as Schema from 'effect/Schema'

import { RoomId } from './ids'

export const RoomNameRegex = /^[a-z0-9][a-z0-9-]{0,31}$/

export const RoomName = Schema.String.pipe(
  Schema.pattern(RoomNameRegex, {
    message: () =>
      'Room name must be 1-32 chars of lowercase ASCII, digits, or hyphens (no leading hyphen)',
  }),
  Schema.brand('@parley/RoomName'),
)
export type RoomName = Schema.Schema.Type<typeof RoomName>

export const Room = Schema.Struct({
  id: RoomId,
  name: RoomName,
  createdAt: Schema.DateTimeUtc,
})
export type Room = Schema.Schema.Type<typeof Room>
