import { Schema } from 'effect'

export const NicknameRegex = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/

export const Nickname = Schema.String.pipe(
  Schema.pattern(NicknameRegex, {
    message: () =>
      'Nickname must be 1-32 chars, alphanumeric plus _ or -, no leading hyphen/underscore',
  }),
  Schema.brand('@parley/Nickname'),
)
export type Nickname = Schema.Schema.Type<typeof Nickname>
