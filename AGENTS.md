<self-improve>

Whenever you find or define a new pattern/rule, or when you add new parts of the architecture that should be persisted as knowledge, update `.agents/rules/`, `.agents/references/` and `CLAUDE.md` accordingly, creating new documents if needed and updating the relevant documents with up-to-date information.

</self-improve>

<fixing-bugs>

When fixing bugs, once you get them fixed, make sure you add or update a unit test to include a test case for that specific bug.
In other words, every bug (especially critical ones) should have a test case specific to that bug -- making sure we won't run into regression issues later on.

</fixing-bugs>

<architecture-notes>

- MCP tool metadata is owned by `packages/api/src/tools/registry.ts`. Do not recreate tool registries in downstream packages; import/re-export the API registry.
- Mutable user TOML config should be read with Bun's TOML parser (`import { TOML } from "bun"` / `TOML.parse`) and schema-decoded after parsing.
- Keep in-memory registries simple: prefer one primary mutable `Map` inside `Effect.sync` when secondary views can be derived cheaply.
- Embedded Drizzle migrations must delegate execution to Drizzle's native `dialect.migrate(meta, session)`. Read-only migration-table counts are fine for reporting; schema creation/writes belong to Drizzle.

</architecture-notes>
