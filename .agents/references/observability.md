# Observability (OpenTelemetry)

Both `@parley/api` and `@parley/mcp` are instrumented via the EffectTS OTel API; trace context is propagated MCP→server over the WS so a single request shows as one trace end-to-end.

## Spans (v0 floor — add more later, never less)

**Server (`@parley/api`)**
- `mcp.session.connected` — WS upgrade → close. Attrs: `session_id`, `auth_label`, `client_version`.
- `mcp.tool.<name>` — one per tool invocation. Attrs: room, nickname, body length.
- `room.fanout` — child of `mcp.tool.send_message`. Attrs: `room`, `recipient_count`, `bytes`.
- `channel.push` — child of `room.fanout`, one per recipient. Attrs: `recipient_session_id`, `success`.

**MCP (`@parley/mcp`)**
- `mcp.client.connect` — initial WS handshake and `initialize`.
- `mcp.tool.<name>.handler` — incoming MCP tool call (parent of the server span).
- `channel.deliver` — receiving a push event and surfacing it to the host Claude.

## Metrics

`parley.messages.sent`, `parley.messages.fanout_recipients`, `parley.sessions.active`, `parley.rooms.active`, `parley.tokens.in_use`.

## Logs

Structured via Effect's `Logger`, exported through the same OTel pipeline.

## Exporter

OTLP/HTTP, endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT`. Unset → no-op exporter (drop on the floor). No bundled collector — operators bring their own. Resource attributes: `service.name` (`parley-server` or `parley-mcp`), `service.version` (from `package.json`), `parley.server.url` on the MCP side. Sampling: parent-based, head-sample 100% by default.
