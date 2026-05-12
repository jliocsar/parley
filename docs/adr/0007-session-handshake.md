# Sessions are established via an explicit `hello` handshake

After the WebSocket upgrade and before any MCP tool call surfaces, `parley mcp` sends a `hello` frame carrying `client_version` and (when not on loopback) the bearer token. The server creates the Session record, attaches the auth label, and replies with `(session_id, reconnect_token)`. On a transient WS drop within the same MCP process, the MCP reconnects and replays the handshake with a `resume` block containing the previous `session_id`, the `reconnect_token`, and `last_acked_seq_per_room`; the server replays buffered messages or surfaces `system.error` if the ring buffer was exceeded (per ADR-0004).

We picked an explicit handshake over implicit Session-on-first-tool-call because we need the reconnect token issued before the first possible reconnect, the bearer token verified once (not per tool call), and a clean place to surface auth / version errors without dressing them up as `join_room` failures.

## Consequences

- `(session_id, reconnect_token)` lives only in the MCP process's RAM. No persistence, no recovery across MCP process restarts — this is consistent with "MCP process death ≡ Session death".
- The wire protocol gains a `hello` / `hello.ok` / `hello.err` triad. Error codes at handshake time: `auth_required`, `bad_token`, `version_mismatch`, `server_shutting_down`.
- Telemetry: `mcp.session.connected` starts at the handshake, giving visibility into "connected but did nothing" clients.
