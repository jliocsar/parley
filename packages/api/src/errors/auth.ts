import * as Schema from 'effect/Schema'

export class AuthRequiredError extends Schema.TaggedError<AuthRequiredError>()(
  'AuthRequiredError',
  {
    message: Schema.String,
  },
) {}

export class BadTokenError extends Schema.TaggedError<BadTokenError>()('BadTokenError', {
  message: Schema.String,
}) {}

export class TokenRevokedError extends Schema.TaggedError<TokenRevokedError>()(
  'TokenRevokedError',
  {
    label: Schema.String,
    message: Schema.String,
  },
) {}
