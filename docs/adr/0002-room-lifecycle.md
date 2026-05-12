# Rooms are implicitly created and persistent

`join_room(name)` creates the Room if it doesn't already exist, with the caller as the first member. There is no separate `create_room` tool. Rooms persist in SQLite after the last member leaves; they are not destroyed by emptiness.

We picked this over ephemeral Rooms because `list_rooms` distinguishes "joined" from "available to join", which is only meaningful if a Room can sit empty between sessions. We picked implicit creation over an explicit `create_room` because all Rooms are public in v0, so there is no privilege to gate creation behind.

## Consequences

- Room rows accumulate in SQLite over time. A future TTL/cleanup policy is required to prune Rooms that have sat empty for too long (out of scope for v0 — leave the rows; revisit when there are enough of them to matter).
- Room names must match `^[a-z0-9][a-z0-9-]{0,31}$`. No case-insensitive matching, no whitespace, no unicode lookalikes to worry about.
