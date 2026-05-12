import { Schema } from 'effect'

import { AuthLabel, BearerToken } from './ids'

export const AuthTokenRecord = Schema.Struct({
  label: AuthLabel,
  tokenHash: Schema.String,
  createdAt: Schema.DateTimeUtc,
  lastUsedAt: Schema.Option(Schema.DateTimeUtc),
})
export type AuthTokenRecord = Schema.Schema.Type<typeof AuthTokenRecord>

export const IssuedToken = Schema.Struct({
  label: AuthLabel,
  token: BearerToken,
  createdAt: Schema.DateTimeUtc,
})
export type IssuedToken = Schema.Schema.Type<typeof IssuedToken>
