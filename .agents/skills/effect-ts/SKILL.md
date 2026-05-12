---
name: effect-ts
description: Use to fetch Effect-TS documentation
---

<effect-ts>

<docs>

! curl https://effect.website/llms.txt

</docs>

<cli>

When creating CLI tools using Effect, refer to the [@effect/cli docs](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/cli/README.md).

</cli>

<drizzle>

Database access goes through Drizzle ORM, not `@effect/sql`. References:

- Bun SQLite quick-start: https://orm.drizzle.team/docs/get-started/bun-sqlite-new
- Bun SQLite connect + runtime migrate: https://orm.drizzle.team/docs/connect-bun-sqlite
- Effect Schema integration (`drizzle-orm/effect-schema`): https://orm.drizzle.team/docs/effect-schema
- Migration generation: https://orm.drizzle.team/docs/drizzle-kit-generate
- Migration apply (CLI + runtime): https://orm.drizzle.team/docs/drizzle-kit-migrate
- Index of all docs: https://orm.drizzle.team/llms.txt
- Full guide for deep dives: https://orm.drizzle.team/llms-full.txt

Patterns:

- Define tables in `packages/api/src/db/schema/` using `sqliteTable` from `drizzle-orm/sqlite-core`.
- Wrap a single `bun:sqlite` `Database` in `drizzle({ client })`. Configure pragmas (e.g. `journal_mode = WAL`) on the `Database` before wrapping.
- Wrap the drizzle handle in an `Effect.Service` (`Db`) so callers consume `Db.query(...)` / `Db.transaction(...)` rather than the raw client.
- Generate migrations with `bun x drizzle-kit generate`, apply on server boot via `migrate(db, { migrationsFolder, migrationsTable: '__drizzle_migrations' })` from `drizzle-orm/bun-sqlite/migrator`.
- Derive HTTP API schemas with `createInsertSchema` / `createSelectSchema` / `createUpdateSchema` from `drizzle-orm/effect-schema` so the wire schema and the table stay in lockstep.

</drizzle>

<opentelemetry>

When using Effect + OTel, refer to these examples:

- [Simple](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/opentelemetry/examples/index.ts)
- [Metrics](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/opentelemetry/examples/metrics.ts)
- [Native exporter](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/opentelemetry/examples/native-exporter.ts)
- [OTLP exporter](https://raw.githubusercontent.com/Effect-TS/effect/refs/heads/main/packages/opentelemetry/examples/otlp-exporter.ts)

</opentelemetry>

<how-to>

Search through the links to find information as needed.
Always fetch and read the `Guidelines` before changing any code.
If you need more details about implementation details, refer to the [full guide](https://effect.website/llms-full.txt).

</how-to>

</effect-ts>
