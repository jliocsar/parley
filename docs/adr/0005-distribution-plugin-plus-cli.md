# Distribution: plugin + global CLI, not a bundled plugin

Parley ships as a Claude Code plugin **and** a separately-installed global CLI (`@parley/cli`). The plugin manifest declares the MCP via `mcpServers: { parley: { command: "parley", args: ["mcp"] } }`, so enabling the plugin auto-registers the MCP without the user touching `.mcp.json`. The actual `parley mcp` implementation lives in the CLI binary; the plugin is wiring + the `skills/parley/SKILL.md` that teaches the host Claude when and how to use Parley.

We rejected bundling the MCP code inside the plugin (via `${CLAUDE_PLUGIN_ROOT}`) because operators already need the CLI for `parley servers add` and `parley-server token issue` — bundling would duplicate the `parley mcp` implementation and create a sync hazard. One implementation, one upgrade path.

## Consequences

- Users install both: the plugin (from a marketplace) and the CLI (`bun install -g @parley/cli` or a release binary). Documented as a one-line install per piece.
- Parley targets Claude Code as its host. The CLI's `parley mcp` is also usable from any other MCP host, but that's not a supported configuration in v0.
- `parley-server` ships separately (operator binary, not part of the plugin or the user-facing CLI).
- The plugin entry is declared inline inside `.claude-plugin/marketplace.json` (under `plugins[]`), carrying `source`, `skills`, and the `mcpServers` block. A separate top-level `plugin.json` was tried first and removed — the two manifests conflicted and the inline form is the supported single source of truth.
- `skills/parley/SKILL.md` is host-Claude-facing usage docs (what Parley is, when to reach for it, how to use the tools, how to wire a server with the CLI), distinct from the MCP-level `instructions` (loop-prevention rules).
