import * as Effect from 'effect/Effect'
import * as MutableHashMap from 'effect/MutableHashMap'
import * as Option from 'effect/Option'
import type { SessionId } from '../domain/ids'

const CAPACITY = 20
const REFILL_PER_SECOND = 10

interface Bucket {
  readonly tokens: number
  readonly lastRefillMs: number
}

type ConsumeResult = { readonly ok: true } | { readonly ok: false; readonly retryAfterMs: number }

export class RateLimiter extends Effect.Service<RateLimiter>()('RateLimiter', {
  accessors: true,
  effect: Effect.gen(function*() {
    const store = MutableHashMap.empty<SessionId, Bucket>()

    const tryConsume = (id: SessionId) =>
      Effect.sync((): ConsumeResult => {
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
      }).pipe(Effect.withSpan('RateLimiter.tryConsume'))

    const dropSession = (id: SessionId) =>
      Effect.sync(() => MutableHashMap.remove(store, id)).pipe(
        Effect.withSpan('RateLimiter.dropSession'),
      )

    return { tryConsume, dropSession }
  }),
}) {}
