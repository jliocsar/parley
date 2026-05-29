import { describe, expect, it } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as TestClock from 'effect/TestClock'
import * as TestContext from 'effect/TestContext'

import { SessionId } from '../domain/ids'
import { RateLimiter } from './RateLimiter'

// CAPACITY = 20, REFILL_PER_SECOND = 10 (see RateLimiter.ts).
const session = SessionId.make('00000000-0000-0000-0000-0000000000c1')
const other = SessionId.make('00000000-0000-0000-0000-0000000000c2')

// Driving the limiter off Clock (not Date.now) lets TestClock pin the refill math
// deterministically — the regression this test guards is the bucket branching on a
// non-deterministic wall clock.
const TestLive = Layer.merge(RateLimiter.Default, TestContext.TestContext)

const run = <A>(eff: Effect.Effect<A, unknown, RateLimiter>) =>
  Effect.runPromise(eff.pipe(Effect.provide(TestLive)))

describe('RateLimiter.tryConsume', () => {
  it('allows a full burst of CAPACITY then rejects with a positive retryAfterMs', async () => {
    await run(
      Effect.gen(function*() {
        const limiter = yield* RateLimiter

        for (let i = 0; i < 20; i++) {
          const result = yield* limiter.tryConsume(session)
          expect(result.ok).toBe(true)
        }

        const overflow = yield* limiter.tryConsume(session)
        expect(overflow.ok).toBe(false)

        if (!overflow.ok) {
          expect(overflow.retryAfterMs).toBeGreaterThan(0)
          expect(overflow.retryAfterMs).toBeLessThanOrEqual(100)
        }
      }),
    )
  })

  it('refills over time so a drained bucket accepts again after waiting', async () => {
    await run(
      Effect.gen(function*() {
        const limiter = yield* RateLimiter

        for (let i = 0; i < 20; i++) {
          yield* limiter.tryConsume(session)
        }

        const drained = yield* limiter.tryConsume(session)
        expect(drained.ok).toBe(false)

        // 10 tokens/sec → 100ms restores exactly one token.
        yield* TestClock.adjust('100 millis')

        const afterWait = yield* limiter.tryConsume(session)
        expect(afterWait.ok).toBe(true)
      }),
    )
  })

  it('meters each session independently', async () => {
    await run(
      Effect.gen(function*() {
        const limiter = yield* RateLimiter

        for (let i = 0; i < 20; i++) {
          yield* limiter.tryConsume(session)
        }

        const sessionBlocked = yield* limiter.tryConsume(session)
        expect(sessionBlocked.ok).toBe(false)

        const otherFresh = yield* limiter.tryConsume(other)
        expect(otherFresh.ok).toBe(true)
      }),
    )
  })

  it('dropSession resets the bucket to full capacity', async () => {
    await run(
      Effect.gen(function*() {
        const limiter = yield* RateLimiter

        for (let i = 0; i < 20; i++) {
          yield* limiter.tryConsume(session)
        }

        expect((yield* limiter.tryConsume(session)).ok).toBe(false)

        yield* limiter.dropSession(session)

        expect((yield* limiter.tryConsume(session)).ok).toBe(true)
      }),
    )
  })
})
