# Bearer-token auth and CLI-managed server registry

Parley servers authenticate inbound MCP connections with a per-user bearer token issued by the operator. `parley-server token issue --label <name>` mints a token (printed once); the operator hands it to the user out-of-band; the user adds it via `parley servers add <name> <url> --token <tok>`. The CLI stores `(name, url, token)` entries in `~/.config/parley/servers.toml` and `parley mcp` picks a server with `--server <name>` (or the default, set via `parley servers default`). **Loopback binds (`127.0.0.1`) disable auth by default** — running `parley-server run` on your laptop with no flags is the canonical local-dev mode and requires no token. Non-loopback binds always require auth; this is non-negotiable and can't be disabled by env var.

We picked this over (a) no auth, which can't ship beyond localhost, and (b) full OAuth/OIDC, which is wildly disproportionate to the use case. The token model gives us per-user revocation (`parley-server token revoke <label>`) and a stable principal handle (the token label) we can attach to Sessions without committing to a full account system.

## Consequences

- Server stores `token_hash` (never the plaintext), `label`, `created_at`, `last_used_at`.
- The token label is the only User-like identifier in v0. Real accounts are deferred.
- `local` is not a hardcoded magic entry — it's just a conventional default name for a loopback URL; users may rename or replace it.
- The CLI surface is: `parley servers list | add | remove | default`.
