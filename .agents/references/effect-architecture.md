# Effect-TS architecture & layering

How Parley's packages are wired together, who depends on whom, and how Layers compose at each entry point. Source-of-truth for the dependency graph — when you add a service, locate the right spot in this graph before deciding where to put it.

## Package dependency direction

```
@parley/config   (pure: tsconfig only)
        ▲
        │
@parley/api  ────►  domain / wire / tools / errors  (pure Schemas — re-exportable)
   │   │
   │   └──► server / services / db / layers          (Bun + Drizzle + OTel runtime)
   │
   ▼
@parley/client  ────►  WsConnection, Handshake, ParleyClient
        │
        ▼
@parley/mcp     ────►  McpServer (MCP SDK glue), ChannelDelivery (Channels SDK)
        │
        ▼
@parley/cli     ────►  parley bin (mcp, servers …)
```

`@parley/api` exposes subpath exports so downstream packages import contract types **without pulling in server runtime** (Bun.serve, Drizzle, OTel SDK):

| Subpath | Contents | Safe to import from anywhere? |
|---|---|---|
| `@parley/api/domain` | Branded IDs, `Room`, `Session`, `Nickname`, `Message`, auth records | Yes |
| `@parley/api/wire` | Handshake frames, client/server frames | Yes |
| `@parley/api/tools` | MCP tool argument + result Schemas, the `MCP_SERVER_INSTRUCTIONS` constant | Yes |
| `@parley/api/errors` | All `Schema.TaggedError` types | Yes |
| `@parley/api/server` | Re-exports server entry layers + `ServerConfig` | Server-side only |
| `@parley/api/layers` | `ServerLive`, `AdminLive`, etc. | Server-side only |

Binaries:
- `parley-server` — `@parley/api/src/bin/parley-server.ts`
- `parley` — `@parley/cli/src/bin/parley.ts`

## Effect Service inventory

Pattern: every service uses `Effect.Service<Self>()(tag, { accessors: true, dependencies: [...], effect/scoped: ... })`. Dependencies are declared on the service, not at usage sites.

### `@parley/api` services

| Service | Kind | Depends on | Purpose |
|---|---|---|---|
| `Db` | `scoped` infra | `ServerConfig` (Config) | Wraps `bun:sqlite` + Drizzle; opens DB, sets pragmas, releases on shutdown. |
| `CryptoService` | service | — | Random token minting, SHA-256 hashing. |
| `RoomRepo` | service | `Db` | Drizzle CRUD on `rooms`. `ensure` is idempotent create-or-fetch. |
| `TokenRepo` | service | `Db` | Drizzle CRUD on `auth_tokens`. |
| `TokenService` | service | `TokenRepo`, `CryptoService` | Issue/revoke/list/verify bearer tokens. |
| `SessionRegistry` | in-memory | — | `session_id → SessionState` (auth label, socket handle, reconnect token, connectedAt). |
| `MembershipRegistry` | in-memory | — | Room ↔ Session mapping with per-Room Nickname uniqueness. |
| `RateLimiter` | in-memory | — | Token-bucket per Session (cap 20, refill 10/sec). |
| `NicknameGenerator` | service | — | Returns random `adjective-animal` Nicknames; `withSuffix` appends `-N` on collision. Used by the `join_room` handler when the caller omits `nickname`. |
| `FanoutService` | in-memory | `MembershipRegistry`, `SessionRegistry` | Assigns `(room, server_seq)`, fans out, holds the ≤64-entry replay ring buffer per (room, session). |
| `WsServer` | `scoped` infra | All of the above | Owns `Bun.serve`, accepts upgrades, drives handshake, routes frames. |
| `TelemetryLive` | layer | `ServerConfig` | OTel exporter — no-op if `OTEL_EXPORTER_OTLP_ENDPOINT` is unset. |

### `@parley/client` services

| Service | Kind | Depends on | Purpose |
|---|---|---|---|
| `WsConnection` | `scoped` | — | Raw WebSocket lifecycle + inbound message Queue. |
| `Handshake` | service | `WsConnection` | Sends `hello`, awaits `hello.ok` / `hello.err`. |
| `ParleyClient` | `scoped` | `WsConnection`, `Handshake` | High-level: `connect`, `joinRoom`, `leaveRoom`, `listRooms`, `sendMessage`, `whoIsHere`, `ack`, plus a `Stream` of inbound events. |

### `@parley/mcp` services

| Service | Kind | Depends on | Purpose |
|---|---|---|---|
| `ChannelDelivery` | service | — | Pushes `room.message` / `system.error` events into the host Claude via the Claude Channels SDK. |
| `McpServer` | `scoped` | `ChannelDelivery` | Runs the `@modelcontextprotocol/sdk` Server over stdio; registers tools from `@parley/mcp/tools/registry`. |

### `@parley/cli` services

| Service | Kind | Depends on | Purpose |
|---|---|---|---|
| `ServersConfig` | service | — | Reads/writes `~/.config/parley/servers.toml` via Bun's native TOML loader; resolves a name (or default) to `{ url, token }`. Resolver falls back to `ws://127.0.0.1:6969` when no entry is configured for `local`, so first-time clients work even before the file exists. |

The matching server-side bootstrap lives in `@parley/api/services/ConfigBootstrap.ts` — `ensureLocalServerEntry({ bind, port })` is called at the start of `parley-server run` and writes the same `servers.toml` (with `default = "local"`) on first boot when bound to loopback. Idempotent: never overwrites an existing file, never writes when bind is non-loopback.

## Composed Layers

### Server entry (`parley-server run`)

```
ServerLive = WsServer.Default
  ▷ Layer.provideMerge(DomainLive)         // TokenService, SessionRegistry, MembershipRegistry, FanoutService, RateLimiter, NicknameGenerator
  ▷ Layer.provideMerge(RepoLive)           // RoomRepo, TokenRepo
  ▷ Layer.provideMerge(InfrastructureLive) // Db, CryptoService, TelemetryLive
```

### Server admin (token CLI, db migrate)

```
AdminLive = (TokenService.Default ⊕ RoomRepo.Default)
  ▷ Layer.provideMerge(RepoLive)
  ▷ Layer.provideMerge(InfrastructureLive)
```

Same infrastructure foundation, no WsServer. Sharing `InfrastructureLive` means both binaries open the same `Db`-pragma settings and the same Telemetry pipeline; one place to change them.

### MCP entry (`parley mcp`)

```
McpLive    = McpServer.Default ▷ Layer.provideMerge(ChannelDelivery.Default)
ClientLive = ParleyClient.Default ▷ Layer.provideMerge(Handshake.Default) ▷ Layer.provideMerge(WsConnection.Default)
Layer.mergeAll(McpLive, ClientLive, ServersConfig.Default)
```

## Conventions to follow when adding code

- **Always `Effect.Service`** for business logic; reserve `Context.Tag` for cases where the runtime injects a non-Effect resource we don't control.
- **Always `Schema.TaggedError`** — every distinct failure mode gets its own error type. Don't collapse into a generic `RoomError`.
- **Brand every ID** that crosses a package boundary. Plain `string` is forbidden for identifiers.
- **Effect.fn with the dotted span name** for service methods (`'RoomRepo.ensure'`, `'FanoutService.enqueueAndPush'`). This is what powers OTel spans for free.
- **`Layer.mergeAll` for siblings, `Layer.provideMerge` for incremental chains.** Avoid nested `Layer.provide` chains — they explode TypeScript LSP types.
- **No `JSON.parse` / `JSON.stringify` in hot paths.** Use `Schema.decodeUnknown` / `Schema.encodeUnknown` for wire frames — the Effect language service will flag the difference.
- **No `process.env`** — use `Config.*` in `config.ts`.
- **No `console.log`** — use `Effect.log` / `Effect.logInfo` / `Effect.logWarning`. They thread through the OTel logger.
- **No top-level `Effect.runPromise` / `Effect.runSync`** inside services. Only the `bin/` files own the runtime (`BunRuntime.runMain`).
