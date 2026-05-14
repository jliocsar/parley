import { loadMigrations } from './load' with { type: 'comptime' }

export const embeddedMigrations = loadMigrations()
