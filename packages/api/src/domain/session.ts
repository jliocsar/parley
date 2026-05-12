import { Schema } from 'effect'

import { AuthLabel, SessionId } from './ids'

export const Session = Schema.Struct({
  id: SessionId,
  authLabel: Schema.Option(AuthLabel),
  clientVersion: Schema.String,
  connectedAt: Schema.DateTimeUtc,
})
export type Session = Schema.Schema.Type<typeof Session>
