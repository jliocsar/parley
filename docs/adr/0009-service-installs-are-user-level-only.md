# Service installs are user-level only

`parley-server service install` installs Parley as a user-level service only — `~/.config/systemd/user/parley-server.service` on Linux, `~/Library/LaunchAgents/io.parley.server.plist` on macOS — and never offers a system-level (`/etc/systemd/system/`, `/Library/LaunchDaemons/`) variant. The full service surface (`install`, `uninstall`, `start`, `stop`, `restart`, `status`, `logs`) wraps `systemctl --user` and `launchctl bootstrap gui/$UID` respectively.

We rejected a system-level option because Parley's defaults are user-scoped end-to-end: loopback bind, `~/.local/share/parley/parley.db`, `~/.config/parley/servers.toml`. A system daemon writing into a per-user data directory is a category error, and operators who need a privileged production daemon already have their own supervisor (Docker, a hand-rolled systemd unit, Kubernetes) — competing with that surface is not a v0 problem. Configuration flows through `~/.config/parley/server.env`, referenced by `EnvironmentFile=` on systemd and sourced by a small shell wrapper on launchd (plists don't support env files natively); this keeps a single visible source of truth instead of baking values into the unit at install time.

## Consequences

- On Linux distros without `systemd --user` (Alpine without an adapter, WSL pre-systemd, some Docker bases) `service install` errors out clearly and points the operator at running `parley-server run` directly.
- User services don't survive logout by default on systemd; we document `loginctl enable-linger $USER` but do not invoke it automatically (it's a global state change).
- `service uninstall` removes the unit/plist and unloads it; `~/.config/parley/server.env`, the SQLite DB, and macOS log files are preserved. `--purge` also wipes the env file but never the DB.
- launchd's stdout/stderr are redirected to `~/Library/Logs/parley/server.{out,err}.log` (declared in the plist at install time). systemd uses journald; `service logs` execs `journalctl --user -u parley-server -f` on Linux and `tail -F` on macOS, with shared `--follow`/`--lines` flags.
- If we ever need system-level installs, we add them as an opt-in `--system` flag rather than the default — the loopback-default story still holds.
