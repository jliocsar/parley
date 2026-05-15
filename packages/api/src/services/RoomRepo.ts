import { eq } from 'drizzle-orm'
import { Effect, Option, Schema } from 'effect'

import { rooms } from '../db/schema/rooms'
import { RoomId } from '../domain/ids'
import { Room, type RoomName } from '../domain/room'
import { Db } from './Db'

export class RoomRepo extends Effect.Service<RoomRepo>()('RoomRepo', {
  accessors: true,
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db

    const decode = (row: { id: string; name: string; createdAt: Date }) =>
      Schema.decodeUnknown(Room)({
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
      })

    const findByName = Effect.fn('RoomRepo.findByName')(function* (name: RoomName) {
      const rows = yield* db.run((h) => h.select().from(rooms).where(eq(rooms.name, name)).limit(1))
      const row = rows[0]
      return row ? Option.some(yield* decode(row)) : Option.none<Room>()
    })

    const ensure = Effect.fn('RoomRepo.ensure')(function* (name: RoomName) {
      const existing = yield* findByName(name)

      if (Option.isSome(existing)) {
        return existing.value
      }

      yield* db.run((h) =>
        h
          .insert(rooms)
          .values({ id: RoomId.make(crypto.randomUUID()), name, createdAt: new Date() })
          .onConflictDoNothing(),
      )

      const fresh = yield* findByName(name)

      return yield* Option.match(fresh, {
        onNone: () =>
          Effect.die(new Error(`RoomRepo.ensure: post-insert lookup failed for ${name}`)),
        onSome: Effect.succeed,
      })
    })

    const listAll = Effect.fn('RoomRepo.listAll')(function* () {
      const rowsRes = yield* db.run((h) => h.select().from(rooms))
      return yield* Effect.forEach(rowsRes, decode)
    })

    return { findByName, ensure, listAll }
  }),
}) {}
