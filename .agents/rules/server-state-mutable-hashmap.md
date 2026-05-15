<rule-server-state-mutable-hashmap>

Process-local registries that hold in-memory state use `MutableHashMap` from `effect`, not `Ref<HashMap>`. Current call sites: server side — `MembershipRegistry`, `SessionRegistry`, `RateLimiter`, `FanoutService`; client side — `ParleyClient` (pending tool-call deferreds). The same reasoning applies to per-room/per-session sequence trackers — prefer a plain `Map<K, V>` over `Ref<Record<K, V>>` when no fiber-snapshot semantics are exercised.

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
