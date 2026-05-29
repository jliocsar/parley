import * as Schema from 'effect/Schema'

export class AuthRequiredError extends Schema.TaggedError<AuthRequiredError>()(
  'AuthRequiredError',
  {
    message: Schema.String,
  },
) {}

export class TokenRevokedError extends Schema.TaggedError<TokenRevokedError>()(
  'TokenRevokedError',
  {
    message: Schema.String,
  },
) {}
