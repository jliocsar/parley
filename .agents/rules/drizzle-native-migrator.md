<rule-drizzle-native-migrator>

Apply Drizzle migrations by delegating to Drizzle's own `dialect.migrate(meta, session)`. Never reimplement `__drizzle_migrations` table management, statement-breakpoint splitting, or transaction handling by hand.

<why>

- The official table schema (`id / hash / created_at`) and ordering logic must stay compatible with `drizzle-kit migrate` so an operator running it externally against a Parley DB doesn't desync the bookkeeping.
- Drizzle's stock `migrate()` wrapper does disk I/O (`readMigrationFiles`) and can't consume an in-memory array — incompatible with our `bun build --compile` single-binary distribution.
- The fix is to pre-build the `MigrationMeta` shape at comptime (`sql[]`, `hash`, `folderMillis`, `bps`) and pass it straight to `dialect.migrate(...)`. We bypass disk I/O, not the migrator.

</why>

<pattern>

`packages/api/src/migrations/load.ts` walks `drizzle/meta/_journal.json` + the `.sql` files at *build time* (via `comptime.ts`) and emits a `MigrationMeta[]` array. `run.ts` calls `db.dialect.migrate(meta, db.session)` — that's it. Adding a migration is still just `bun --filter @parley/api db:generate` + rebuild; no hand-edits to the runner.

</pattern>

<anti-pattern>

Anything that touches `__drizzle_migrations` directly from application code — `CREATE TABLE ... __drizzle_migrations`, `INSERT INTO __drizzle_migrations`, splitting on `--> statement-breakpoint` ourselves, hashing or ordering our own way. If you find yourself doing that, you're rebuilding the migrator. Stop and call `dialect.migrate` instead.

</anti-pattern>

</rule-drizzle-native-migrator>
