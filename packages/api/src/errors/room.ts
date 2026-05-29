import * as Schema from 'effect/Schema'

import { Nickname } from '../domain/nickname'
import { RoomName } from '../domain/room'

export class NicknameTakenError extends Schema.TaggedError<NicknameTakenError>()(
  'NicknameTakenError',
  {
    room: RoomName,
    nickname: Nickname,
    message: Schema.String,
  },
) {}

export class NotInRoomError extends Schema.TaggedError<NotInRoomError>()('NotInRoomError', {
  room: RoomName,
  message: Schema.String,
}) {}

export class AlreadyInRoomError extends Schema.TaggedError<AlreadyInRoomError>()(
  'AlreadyInRoomError',
  {
    room: RoomName,
    message: Schema.String,
  },
) {}

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  'RoomNotFoundError',
  {
    room: RoomName,
    message: Schema.String,
  },
) {}

export class RateLimitedError extends Schema.TaggedError<RateLimitedError>()('RateLimitedError', {
  retryAfterMs: Schema.Number,
  message: Schema.String,
}) {}
