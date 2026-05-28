import * as Schema from 'effect/Schema'

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
    sessionId: Schema.String,
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
    room: Schema.String,
    message: Schema.String,
  },
) {}
