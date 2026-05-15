import { describe, expect, it } from 'bun:test'

import { HandshakeFailedError } from './ParleyClient'

describe('HandshakeFailedError', () => {
  it('keeps handshake failures tagged for callers', () => {
    const err = new HandshakeFailedError({
      code: 'AuthRequiredError',
      message: 'Auth required',
    })

    expect(err._tag).toBe('HandshakeFailedError')
    expect(err.code).toBe('AuthRequiredError')
    expect(err.message).toBe('Auth required')
  })
})
