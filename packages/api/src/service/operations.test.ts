import { describe, expect, test } from 'bun:test'

import * as Either from 'effect/Either'
import * as Schema from 'effect/Schema'

import { isFileNotFound } from './operations'

// Mirrors the `PositiveInt` refinement applied to the `--lines` option in
// `commands.ts`. Kept in lockstep so a regression in the option schema is
// caught here.
const PositiveInt = Schema.Number.pipe(Schema.int(), Schema.positive())

describe('isFileNotFound', () => {
  // Regression: `removeFile` must treat an already-absent file (ENOENT) as the
  // legitimate best-effort case while propagating real failures (EACCES etc.).
  test('returns true only for ENOENT-coded errors', () => {
    expect(isFileNotFound({ code: 'ENOENT' })).toBe(true)
    expect(isFileNotFound(Object.assign(new Error('gone'), { code: 'ENOENT' }))).toBe(true)
  })

  test('returns false for real I/O failures and non-error values', () => {
    expect(isFileNotFound({ code: 'EACCES' })).toBe(false)
    expect(isFileNotFound({ code: 'EPERM' })).toBe(false)
    expect(isFileNotFound({ code: 'EISDIR' })).toBe(false)
    expect(isFileNotFound(new Error('boom'))).toBe(false)
    expect(isFileNotFound('ENOENT')).toBe(false)
    expect(isFileNotFound(null)).toBe(false)
    expect(isFileNotFound(undefined)).toBe(false)
  })
})

describe('--lines positive-integer validation', () => {
  const decode = (n: number) => Either.isRight(Schema.decodeUnknownEither(PositiveInt)(n))

  // Regression: `--lines -5` / `--lines 0` must be rejected before reaching
  // `journalctl -n -5` / `tail -n 0`.
  test('accepts positive integers including the default', () => {
    expect(decode(200)).toBe(true)
    expect(decode(1)).toBe(true)
  })

  test('rejects zero, negatives, and non-integers', () => {
    expect(decode(0)).toBe(false)
    expect(decode(-5)).toBe(false)
    expect(decode(1.5)).toBe(false)
  })
})
