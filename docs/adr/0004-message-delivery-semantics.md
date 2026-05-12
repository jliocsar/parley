# Message delivery: pure fanout, at-least-once, bounded

Message bodies are never persisted. `send_message` lands at the server, the server assigns a `(room, server_seq)` and a ULID `message_id`, fans out to every current Room member's Channel, and forgets the body. SQLite stores Rooms, Sessions, memberships, and tokens — nothing else.

Delivery is at-least-once with idempotent `message_id`. Within a Session, the server keeps a small RAM ring buffer (≈64 unacked messages per `(room, session)`); on WS reconnect inside the same Session it replays anything since `last_acked_seq`. Buffer overflow surfaces a `system.error` ("messages were dropped during disconnect") rather than silent loss. Bodies are UTF-8 text, capped at 8 KiB; per-Session rate limit of ~10 msgs/sec (burst 20) is enforced synchronously on `send_message`.

We picked pure fanout over persistence because the spec is explicit about no backlog and because adding history later is an additive schema change with no migration pain. At-least-once with dedup beats at-most-once because it survives transient WS drops without coordinating loss handling on the client.

## Consequences

- Server restart loses any in-flight or buffered-but-unacked messages by design. The replay buffer is in-process RAM only.
- `message_id` is a recipient-side dedup key, not a database PK.
- Total ordering within a Room holds only as long as the server is single-process. Sharding will require revisiting.
- All numeric limits (8 KiB body, 10/sec rate, 64-entry buffer) are configurable but conservative defaults — bump them when there is evidence to, not before.
