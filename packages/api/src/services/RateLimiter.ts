import { Effect, MutableHashMap, Option } from 'effect'

import type { SessionId } from '../domain/ids'

const CAPACITY = 20
const REFILL_PER_SECOND = 10

type Bucket = {
  readonly tokens: number
  readonly lastRefillMs: number
}

export class RateLimiter extends Effect.Service<RateLimiter>()('RateLimiter', {
  accessors: true,
  effect: Effect.gen(function* () {
    const store = MutableHashMap.empty<SessionId, Bucket>()

    type ConsumeResult =
      | { readonly ok: true }
      | { readonly ok: false; readonly retryAfterMs: number }

    const tryConsume = Effect.fn('RateLimiter.tryConsume')(function* (id: SessionId) {
      return yield* Effect.sync((): ConsumeResult => {
        const now = Date.now()
        const bucket = Option.getOrElse(MutableHashMap.get(store, id), () => ({
          tokens: CAPACITY,
          lastRefillMs: now,
        }))

        const elapsed = (now - bucket.lastRefillMs) / 1000
        const refilled = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_PER_SECOND)

        if (refilled < 1) {
          const retryAfterMs = Math.ceil(((1 - refilled) / REFILL_PER_SECOND) * 1000)
          return { ok: false, retryAfterMs }
        }

        MutableHashMap.set(store, id, { tokens: refilled - 1, lastRefillMs: now })
        return { ok: true }
      })
    })

    const dropSession = Effect.fn('RateLimiter.dropSession')(function* (id: SessionId) {
      yield* Effect.sync(() => MutableHashMap.remove(store, id))
    })

    return { tryConsume, dropSession }
  }),
}) {}
