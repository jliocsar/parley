# One `parley mcp` process talks to exactly one server

A `parley mcp` process connects to a single Parley server for its entire lifetime, picked at startup via `--server <name>` (or the default from `~/.config/parley/servers.toml`). Tools (`join_room`, `send_message`, …) carry no server argument; Room names are unqualified slugs.

We rejected multi-server-per-process because qualifying Room names with a server (`prod/general`) contradicts the strict slug format and inflates every tool argument, every error message, and every push event with a server dimension that's almost always trivially "the only one". Users who genuinely need two servers from one Claude session install the plugin a second time or hand-edit `.mcp.json` to register two named MCP entries (`parley-prod`, `parley-staging`), each pointing at `parley mcp --server <name>`.

## Consequences

- The plugin manifest registers a single MCP entry by default.
- Per-server reconnect/auth/telemetry stays localised to the process.
- "Cross-server" use cases are explicitly out of scope for v0; documented as "spawn two Claude sessions".
