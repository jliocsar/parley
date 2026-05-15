import { describe, expect, it } from 'bun:test'
import { TOOLS as API_TOOLS } from '@parley/api/tools'

import { TOOLS } from './registry'

describe('MCP tool registry', () => {
  it('re-exports the API tool registry as the single source of truth', () => {
    expect(TOOLS).toBe(API_TOOLS)
    expect(Object.keys(TOOLS)).toEqual([
      'join_room',
      'leave_room',
      'list_rooms',
      'send_message',
      'who_is_here',
    ])
  })
})
