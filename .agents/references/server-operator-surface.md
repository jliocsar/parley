# `parley-server` CLI and runtime config

Operator-facing surface for running and administering a Parley server.

## Subcommands

```
parley-server run                              # start the WS server
parley-server token issue --label <name>       # mint a token, print once
parley-server token list                       # label, created_at, last_used_at
parley-server token revoke <label>             # delete a token
parley-server rooms list                       # rooms + member counts
parley-server sessions list                    # active sessions
parley-server db migrate                       # apply pending Drizzle migrations
```

`run` auto-migrates on boot — migrations are comptime-embedded and applied via Drizzle's own `dialect.migrate(...)` against the standard `__drizzle_migrations` table (`id / hash / created_at`). `db migrate` remains as an explicit pre-flight / diagnostic; it's a no-op when the DB is up to date.

## Runtime config (env vars only — Bun auto-loads `.env`)

| Var | Default | Notes |
|---|---|---|
| `PARLEY_PORT` | `7539` | WS listen port. |
| `PARLEY_BIND` | `127.0.0.1` | Bind address. Loopback default avoids accidental LAN exposure. |
| `PARLEY_DB_FILE` | `~/.local/share/parley/parley.db` | XDG data path. Drizzle's `drizzle.config.ts` may keep `./parley.dev.db` as its migration-generation default, but the server runtime reads this env var. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | Standard OTel var; unset → no-op exporter. |

There is no `PARLEY_DISABLE_AUTH` flag. Auth state is derived from the bind:

- `PARLEY_BIND=127.0.0.1` (or any loopback address) → auth disabled.
- Anything else → auth required; no env knob bypasses it.

This makes the safe default the obvious default: `parley-server run` on a laptop is the zero-config local-dev mode, and deploying anywhere remote automatically forces tokens.

## Filesystem layout

| Path | Purpose |
|---|---|
| `~/.config/parley/servers.toml` | CLI side — list of known servers + tokens. Auto-created on `parley-server run`'s first boot when bound to loopback (writes `default = "local"` and a `[servers.local]` entry pointing at `ws://127.0.0.1:<PARLEY_PORT>`); never overwritten if it already exists. |
| `~/.local/share/parley/parley.db` | Server side — SQLite data file |
