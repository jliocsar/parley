import * as Schema from 'effect/Schema'

export const SessionId = Schema.UUID.pipe(Schema.brand('@parley/SessionId'))
export type SessionId = Schema.Schema.Type<typeof SessionId>

export const RoomId = Schema.UUID.pipe(Schema.brand('@parley/RoomId'))
export type RoomId = Schema.Schema.Type<typeof RoomId>

export const MessageId = Schema.UUID.pipe(Schema.brand('@parley/MessageId'))
export type MessageId = Schema.Schema.Type<typeof MessageId>

export const ReconnectToken = Schema.String.pipe(
  Schema.minLength(32),
  Schema.maxLength(128),
  Schema.brand('@parley/ReconnectToken'),
)
export type ReconnectToken = Schema.Schema.Type<typeof ReconnectToken>

export const BearerToken = Schema.String.pipe(
  Schema.pattern(/^parley_tok_[A-Za-z0-9_-]{32,}$/),
  Schema.brand('@parley/BearerToken'),
)
export type BearerToken = Schema.Schema.Type<typeof BearerToken>

export const AuthLabel = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.brand('@parley/AuthLabel'),
)
export type AuthLabel = Schema.Schema.Type<typeof AuthLabel>
