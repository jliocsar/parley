import * as Schema from 'effect/Schema'

import { SessionId } from '../domain/ids'
import { RoomName } from '../domain/room'

export class VersionMismatchError extends Schema.TaggedError<VersionMismatchError>()(
  'VersionMismatchError',
  {
    clientVersion: Schema.String,
    minServerVersion: Schema.String,
    message: Schema.String,
  },
) {}

export class ServerShuttingDownError extends Schema.TaggedError<ServerShuttingDownError>()(
  'ServerShuttingDownError',
  {
    message: Schema.String,
  },
) {}

export class UnknownSessionError extends Schema.TaggedError<UnknownSessionError>()(
  'UnknownSessionError',
  {
    sessionId: SessionId,
    message: Schema.String,
  },
) {}

export class BadReconnectTokenError extends Schema.TaggedError<BadReconnectTokenError>()(
  'BadReconnectTokenError',
  {
    message: Schema.String,
  },
) {}

export class ReplayBufferOverflowError extends Schema.TaggedError<ReplayBufferOverflowError>()(
  'ReplayBufferOverflowError',
  {
    room: RoomName,
    message: Schema.String,
  },
) {}
