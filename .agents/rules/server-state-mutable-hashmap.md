<rule-server-state-mutable-hashmap>

Server-local registries (`MembershipRegistry`, `SessionRegistry`, `RateLimiter`, `FanoutService`) hold in-memory state. They use `MutableHashMap` from `effect`, not `Ref<HashMap>`.

<why>

- The immutability of `HashMap` was never exercised — no snapshots crossed fiber boundaries, no rollback semantics.
- `Ref.update` on a `HashMap` allocates a new map every mutation. On hot paths (`Fanout.enqueueAndPush` per recipient, `RateLimiter.tryConsume` per `send_message`) this is wasteful.
- `MutableHashMap` is in-place mutation wrapped in `Effect.sync`. `Effect.sync` is atomic from a JS-runtime perspective, so read-modify-write inside a single `sync` block is safe.

</why>

<pattern>

```ts
import { Effect, MutableHashMap, Option } from 'effect'

const store = MutableHashMap.empty<SessionId, Bucket>()

const tryConsume = Effect.fn('RateLimiter.tryConsume')(function* (id: SessionId) {
  return yield* Effect.sync(() => {
    const bucket = Option.getOrElse(MutableHashMap.get(store, id), () => initial())
    // compute…
    MutableHashMap.set(store, id, next)
    return result
  })
})
```

- `store` is created once at service construction (not inside `Ref.make`).
- Multi-step read-modify-write goes in a single `Effect.sync` block.
- Inner per-entry structures use plain `Map`/`Set` (not `HashMap`/`HashSet`) for the same reason.

</pattern>

<exceptions>

- Domain values that travel across fiber boundaries or get returned to callers as snapshots should still be immutable. `MutableHashMap` is for the registry's *internal* storage only — return arrays / new Maps to callers.
- Persisted state via `Ref<Schema>` is unaffected — `Ref` still applies when you want STM semantics or transactional swaps.

</exceptions>

</rule-server-state-mutable-hashmap>
