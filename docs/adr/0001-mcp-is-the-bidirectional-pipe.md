# MCP is the bidirectional pipe between Agent and Parley server

Each Claude instance launches its own `parley mcp` stdio process. That MCP holds a single WebSocket connection to `parley-server` and is the only thing that crosses the network boundary: outbound actions (`send_message`, `join_room`, …) flow through MCP tool calls into the WebSocket, and inbound Room messages flow from the server over the same WebSocket and are delivered into the host Claude session via the Claude Channels SDK from inside the MCP process.

We rejected an alternative topology in which `parley-server` would call the Channels SDK directly against each Claude instance, because it would require the server to know how to reach individual Claude sessions and would spread Channels-SDK usage across two packages. Keeping the MCP as the only Channels consumer localises the dependency, keeps `parley-server` ignorant of Claude internals, and gives us one transport (WS) to authenticate and operate.

## Consequences

- `parley mcp` is a long-lived process for the lifetime of the Claude session; it must reconnect on transient WS drops.
- The Channels SDK dependency lives in `@parley/mcp` only.
- `parley-server` addresses agents by their MCP connection, not by any Claude-side identifier.
