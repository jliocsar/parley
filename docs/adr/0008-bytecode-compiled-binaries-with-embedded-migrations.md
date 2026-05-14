# Bytecode-compiled binaries with embedded migrations

Parley ships two `bun build --compile --bytecode` binaries — `parley` (from `@parley/cli`) and `parley-server` (from `@parley/api`) — built independently, each as a single self-contained file. The `parley-server` binary embeds its Drizzle migrations at compile time using [`comptime.ts`](https://comptime.js.org/) so the SQL files do not need to live next to the binary at runtime, and `parley-server run` auto-applies pending migrations on every boot (idempotent against `__drizzle_migrations`).

We rejected shipping `packages/api/drizzle/` as a sibling resource directory because it defeats the single-file distribution goal and adds a "did you copy the migrations folder?" failure mode to every install. We also rejected a hand-maintained list of text imports — `comptime.ts` lets a single `loadMigrations()` call walk the journal at build time and inline the entries, so adding a migration is still just `bun --filter @parley/api db:generate` with no follow-up edit. Drizzle's stock `migrate()` does disk I/O via `node:fs.readdirSync` and can't consume an in-memory array, so we replace the call site with a ~20-line custom runner keyed by `tag` (the embedded entries are pre-validated by Drizzle's generator; we drop the runtime hash check because the SQL is frozen into the binary).

## Consequences

- Adding a migration: run `db:generate`, then re-run the per-package build script. No manual import edits.
- `bun build --compile` doesn't accept `--plugins` on the CLI, so each package owns a small programmatic `scripts/build.ts` calling `Bun.build({ compile, bytecode: true, minify: true, plugins: [comptime()] })`. The `comptime` plugin is required only for the `@parley/api` build.
- `parley-server db migrate` becomes a no-op-when-up-to-date diagnostic command; the server itself always migrates on `run`. This is safe because SQLite migrations are forward-only and the journal lookup is a single indexed read.
- `parley --version` and `parley-server --version` read `package.json` at build time via `comptime+json` instead of the hardcoded `'0.0.0'` strings.
- The compiled binaries are the artifacts symlinked into `$XDG_BIN_HOME` (defaults to `~/.local/bin`) by the repo-root `bun run install:bin` contributor script. The marketplace / `bun install -g @parley/cli` distribution paths from ADR 0005 are unchanged.
