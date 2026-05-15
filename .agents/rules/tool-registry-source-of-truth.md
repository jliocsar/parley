<rule-tool-registry-source-of-truth>

MCP tool metadata lives in `packages/api/src/tools/registry.ts`. Downstream packages import that registry instead of recreating their own lists.

<why>

- Tool names, wire tags, argument schemas, result schemas, and descriptions must stay in lockstep.
- Adding a tool should be a single API registry edit plus explicit client/server behavior, not independent edits to MCP metadata, wire schemas, encoders, and handlers.
- The MCP package is glue. It re-exports `@parley/api/tools` metadata and binds handlers to the client; it does not own tool definitions.

</why>

<pattern>

- Each tool module exports `ArgsFields`, `Args`, and `Result`.
- `tools/registry.ts` combines those with `name`, `tag`, and `description`.
- `wire/client.ts` builds request schemas from the registry's `tag` and `argsFields`.
- `@parley/mcp/src/tools/registry.ts` re-exports the API registry.

</pattern>

</rule-tool-registry-source-of-truth>
