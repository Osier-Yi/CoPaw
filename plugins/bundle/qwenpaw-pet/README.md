# QwenPaw Pet (plugin + desktop runtime)

Full-stack QwenPaw plugin: backend hooks, console UI sidebar, **and** the
desktop pet runtime itself (`qwenpaw_pet_desktop/`). Installing this
plugin gives you everything: the Qt floating pet window, the local HTTP
bridge on `127.0.0.1:8765`, and the QwenPaw side hooks that emit
lifecycle events into it.

```text
plugins/qwenpaw-pet/
├── plugin.json            # manifest (id, hooks entry, dependencies)
├── plugin.py              # backend: startup / shutdown hooks + monkey patches
├── emitter.py             # fire-and-forget HTTP client + autostart spawn
├── router.py              # plugin HTTP routes under /api/qwenpaw-pet/...
├── pet_paths.py           # plugin-local helpers (WORKING_DIR, list pets)
├── patch_runner.py        # monkey patch AgentRunner.query_handler
├── patch_approval.py      # monkey patch approval service hooks
├── event_hub.py           # in-process pub/sub feeding SSE subscribers (v0.2+)
├── pair_tokens.py         # hashed pairing-token store for remote SSE (v0.2+)
├── mode.py                # local / remote mode resolution (v0.2+)
├── frontend/              # Vite + React console UI source
├── dist/index.js          # built console UI bundle (build artifact, committed; regenerated via `npm run build`)
└── qwenpaw_pet_desktop/   # the Qt + FastAPI desktop runtime (embedded)
    ├── app.py             # Qt main loop + uvicorn + optional remote SSE thread
    ├── server.py          # FastAPI app factory (/event, /pet, /bubble, ...)
    ├── window.py          # PetWindow: frameless translucent always-on-top
    ├── sprites.py         # 8x9 atlas constants + event→state mapping
    ├── runtime.py         # paths, PID, token, remote.json, cursor helpers
    ├── pet_package.py     # validate / install / hot-switch pet packages
    ├── remote_client.py   # SSE consumer subscribing to a remote QwenPaw (v0.2+)
    ├── cli.py             # `python -m qwenpaw_pet_desktop` subcommands (incl. pair / unpair)
    └── assets/default-pet/snowpaw/  # default pet manifest (asset fetched on first use)
```

`plugin.py` injects the plugin directory into `sys.path` at import
time, so `qwenpaw_pet_desktop` is importable from QwenPaw's Python
process without any `pip install` step. See
[`qwenpaw_pet_desktop/README.md`](qwenpaw_pet_desktop/README.md) for
internals of the desktop runtime itself.

## Install

Two equivalent ways:

- **From the QwenPaw console** — open the plugin management page and
  install `qwenpaw-pet` like any other QwenPaw plugin. Three input
  shapes are accepted:
  - point it at a local folder,
  - upload a `.zip`, or
  - paste a plugin URL (e.g. a GitHub release / raw archive URL) and
    let the console download and unpack it for you.
- **From the shell** — run:

  ```bash
  qwenpaw plugin install ./plugins/qwenpaw-pet
  ```

> [!IMPORTANT]
> **Restart QwenPaw after install** — the backend only picks up new
> plugin code (hooks, HTTP routes) on startup. The browser console
> usually also needs a hard refresh (`Cmd+Shift+R` / `Ctrl+Shift+R`)
> to drop the cached `dist/index.js` and pull in the new sidebar UI.

### Python dependencies

QwenPaw's interpreter needs these packages on its `sys.path` (declared
in `plugin.json`'s `dependencies`):

- `httpx>=0.27` — fire-and-forget HTTP client
- `fastapi>=0.110`, `uvicorn>=0.27` — local HTTP bridge
- `python-multipart>=0.0.9` — required by FastAPI to parse the
  Import-pet dropzone uploads
- `pillow>=10.0` — spritesheet validation
- `pyside6-essentials>=6.6` — Qt pet window. We only import
  `QtCore`/`QtGui`/`QtWidgets`, all of which live in Essentials, so
  there's no need to pull in the full `PySide6` meta package (which
  also installs `PySide6-Addons` — ~800 MB of WebEngine, 3D,
  Multimedia, etc. that this plugin never touches).

If your QwenPaw install does not auto-resolve plugin dependencies,
install them manually into the same environment:

```bash
pip install -r plugins/qwenpaw-pet/requirements.txt
```

PySide6-Essentials wheels exist only for **Python 3.10–3.13**. On 3.14
the pet window cannot start; QwenPaw itself will still run, the pet
will just stay offline and the plugin logs a warning.

## Running the desktop pet

The plugin's startup hook calls `emitter.ensure_desktop_available()`,
which spawns the desktop process on demand:

```python
subprocess.Popen(
    [sys.executable, "-m", "qwenpaw_pet_desktop.app",
     "--port", "8765"],
    start_new_session=True,
)
```

Manual control (any of these work):

```bash
# Foreground (logs to terminal)
python -m qwenpaw_pet_desktop.app --port 8765 --scale 0.58

# CLI subcommands (daemonized: PID file + log redirect)
python -m qwenpaw_pet_desktop start
python -m qwenpaw_pet_desktop status
python -m qwenpaw_pet_desktop stop
python -m qwenpaw_pet_desktop switch --pet-id snowpaw

# Send a test event once the window is up
curl -X POST http://127.0.0.1:8765/event \
  -H 'Content-Type: application/json' \
  -d '{"event":"query.running","text":"Thinking"}'
```

Hot-switch the running pet (no restart):

```bash
curl -X POST http://127.0.0.1:8765/pet \
  -H 'Content-Type: application/json' \
  -d '{"pet_id":"snowpaw"}'
# pet_id may be the pets/ *folder name* or the pet.json "id" when they differ
```

Autostart can be disabled with `QWENPAW_PET_AUTOSTART=0`.

## Remote mode (cloud QwenPaw → laptop pet)

When QwenPaw runs on a server the user cannot reach inbound (typical
home/office NAT in front of a cloud ECS), the loopback push above is a
dead end. Remote mode flips the direction: the **desktop subscribes to
the cloud** over a long-lived SSE stream, so every event the server
emits flows back to the floating pet without any port forwarding.

```text
QwenPaw + plugin (ECS) ──SSE──▶ qwenpaw_pet_desktop on the laptop
        ▲                              │
        └── pairing token in remote.json
```

The plugin still publishes every event to an internal hub regardless of
mode — the loopback path is just one consumer; SSE subscribers are
another. Switching mode does not need a QwenPaw restart.

### Switching mode

Mode precedence: `QWENPAW_PET_MODE` env var > config file > **auto**.

- **`local`** (default for desktop installs) — plugin autostarts the
  local Qt window and pushes events over loopback. Identical to v0.1
  behaviour.
- **`remote`** — plugin skips autostart; the console UI shows the
  pairing card; the desktop process lives on the user's laptop.
- **`auto`** — picks `remote` on a headless POSIX host (no `DISPLAY` /
  `WAYLAND_DISPLAY` / macOS / Windows GUI session), `local` otherwise.

Auto-detection covers the common ECS case out of the box. To flip mode
manually from the console UI, open the **Pet** sidebar — the toggle at
the top calls `POST /api/qwenpaw-pet/mode`. Setting
`QWENPAW_PET_MODE=local|remote|auto` in the environment overrides the
config file and disables the UI toggle (the badge reads "Mode is fixed
by the environment variable").

The config file lives at
`<WORKING_DIR>/qwenpaw-pet-config.json` so it follows QwenPaw's working
directory backup story.

### Pairing flow (cloud UI → desktop app)

1. Open the **Pet** sidebar on the cloud QwenPaw console (already
   authenticated with your QwenPaw master token).
2. Switch mode to **Remote**.
3. Optionally type a device label (`MyMac`, `WorkPC`, …).
4. Click **Copy pairing link** — the UI calls
   `POST /api/qwenpaw-pet/pair-token`, gets back a one-shot plaintext
   token, base64url-encodes the current `window.location.origin`, and
   writes
   `qwenpaw-pet://pair?url=<b64u>&token=<ptoken_...>&v=1` to the
   clipboard. The plaintext is shown **exactly once** — re-issue if
   you lose it.
5. On the user's laptop (with the desktop app installed), paste:

   ```bash
   qwenpaw-pet pair "qwenpaw-pet://pair?url=...&token=...&v=1"
   # or, for scripted use:
   qwenpaw-pet pair --url https://qwenpaw.example.com --token ptoken_... \
                    --label MyMac
   ```

   The desktop writes `~/.qwenpaw-pet/runtime/remote.json`
   (`0600` on POSIX; NTFS user ACL on Windows) and starts a daemon
   thread that opens `GET <url>/api/qwenpaw-pet/events/stream` with the
   token in `Authorization: Bearer`.
6. The sidebar's **Paired devices** card now lists this laptop with
   its hostname (auto-filled from the
   `X-QwenPaw-Pet-Client-Label` header the client sends on connect).
   Click **Revoke** to invalidate the token — the desktop will receive
   a `401` on its next reconnect attempt and stop the retry loop.

Pairing tokens are **scoped**: they only authorize
`GET /events/stream`. They are stored hashed (sha256) in
`<WORKING_DIR>/qwenpaw-pet-pair-tokens.json`; only the plaintext is
ever returned, only at issuance. Default lifetime is 30 days; tune via
`QWENPAW_PET_PAIR_TTL_DAYS`. Hard cap of 16 active tokens (oldest
unused entry is evicted on overflow).

### Desktop runtime: remote-mode CLI

```bash
qwenpaw-pet pair "qwenpaw-pet://pair?url=...&token=..."
qwenpaw-pet unpair                # forget the saved pairing
qwenpaw-pet status                # prints remote URL + last event id
```

Reconnect strategy: exponential backoff capped at 30 s. The server's
event hub keeps a ring buffer of the last 256 events, so a brief blip
re-syncs via `Last-Event-ID` without missing anything. The cursor is
persisted to `~/.qwenpaw-pet/runtime/remote-cursor.json` so even a
desktop restart resumes from where it left off. TCP keepalive is
enabled on Linux (`SO_KEEPALIVE` + `TCP_KEEPIDLE=30s`,
`TCP_KEEPINTVL=10s`, `TCP_KEEPCNT=3`) to defeat silent NAT/proxy
idle timeouts; macOS and Windows fall back to their respective OS
defaults.

## Frontend (console sidebar)

Manifest field `"frontend": "dist/index.js"`. The committed
`dist/index.js` is a **build artifact** generated from
`frontend/src/index.tsx` — keep it in lockstep with the source by
rebuilding whenever you edit `frontend/src/`:

```bash
cd frontend && npm install && npm run build
```

> [!NOTE]
> `dist/index.js` is committed (not gitignored) so the plugin installs
> cleanly without an npm toolchain on the target machine. Reviewers
> can ignore diffs to `dist/index.js` and look at `frontend/src/`
> instead — the bundle is fully reproducible from the source via the
> command above. The frontend's `frontend/.npmrc` pins the public
> `https://registry.npmjs.org/` so anyone can reproduce the lockfile
> from outside Alibaba's intranet.

Reinstall the plugin, or copy `dist/index.js` into your
`~/.copaw/plugins/qwenpaw-pet/dist/index.js` and refresh the console.

### Console host API compatibility

The bundle is built with `react` and `react-dom` marked `external` in
`vite.config.ts` and consumes both — plus `antd` — from the console
host at runtime (`window.QwenPaw.host.React`, `host.antd`,
`host.getApiUrl`, `host.getApiToken`). The shape of this contract is
declared in `frontend/src/qwenpaw-host.d.ts`. If the console host
bumps `antd` across a major version (e.g. drops `Typography.Text`,
renames `message`, etc.), the sidebar UI may need to be updated and
the bundle rebuilt; the Python plugin is unaffected.

The UI adds a sidebar page **Pet** (`/plugin/qwenpaw-pet/pets`): lists
pets under `<WORKING_DIR>/pets`, **Start desktop pet** (calls `POST
/api/qwenpaw-pet/desktop/start`), **Switch** (hot-switch via `POST
/pet` on the desktop), and **Import pet** — opens a modal with a
dropzone: drag a folder **or** a `.zip` onto it (drop area highlights
in blue), or click to choose a `.zip` via the system file picker.
Files are streamed as `multipart/form-data` to
`POST /api/qwenpaw-pet/import-pet-upload`, then validated and copied
into `<WORKING_DIR>/pets/<id>/`. The source (or the unzipped archive)
must contain `pet.json` and the spritesheet referenced by it
(1536×1872 webp); a single top-level subfolder is also accepted, which
is what macOS Finder's "Compress" produces.

## QwenPaw plugin HTTP routes

```text
GET    /api/qwenpaw-pet/status
GET    /api/qwenpaw-pet/pets
GET    /api/qwenpaw-pet/pets/{folder}/spritesheet
POST   /api/qwenpaw-pet/desktop/start
POST   /api/qwenpaw-pet/switch-pet
POST   /api/qwenpaw-pet/import-pet          # JSON body — server-side path
POST   /api/qwenpaw-pet/import-pet-upload   # multipart/form-data — browser
POST   /api/qwenpaw-pet/emit-test

# remote mode (v0.2+)
GET    /api/qwenpaw-pet/mode                # {mode, source}
POST   /api/qwenpaw-pet/mode                # {mode: "local"|"remote"|"auto"}
GET    /api/qwenpaw-pet/pair-token          # list active pairings (no plaintext)
POST   /api/qwenpaw-pet/pair-token          # issue a token (plaintext returned once)
DELETE /api/qwenpaw-pet/pair-token/{id}     # revoke
GET    /api/qwenpaw-pet/events/stream       # SSE — pairing token only
GET    /api/qwenpaw-pet/desktop/info        # {mode, subscribers}
```

The SSE endpoint authenticates **only** with a pairing token
(`Authorization: Bearer ptoken_...` or `?token=...`). Master-token
routes (`/mode`, `/pair-token`, …) use QwenPaw's existing console
auth.

**`/import-pet`** (JSON, for CLI / SDK use) takes
`{"path": "<absolute path>", "replace": true}` and reads a folder or
`.zip` that already exists on the server's filesystem.

**`/import-pet-upload`** (multipart, used by the dropzone in the UI)
takes one or more files in the `files` field plus a `replace` form
field. Two shapes:

* a single `.zip` file — extracted server-side (zip-slip protected),
* one or more files whose `filename` is a relative path
  (`webkitRelativePath`-style) — written into a tempdir to recreate the
  folder structure.

Both paths share the same install logic. The package must contain
`pet.json` + the spritesheet it references (defaults to
`spritesheet.webp`, 1536×1872). The manifest `id` is checked against
`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` before becoming a folder name
under `pets/`. Returns `409` when the pet already exists and `replace`
is `false`.

## Desktop runtime HTTP API (`127.0.0.1:8765`)

```text
GET  /health    # liveness + process state
GET  /state     # current state.json snapshot
GET  /bubble    # current bubble.json snapshot
GET  /event     # list valid state names
POST /event     # drive the pet (event + state mapping)
POST /bubble    # replace bubble text (200 char cap)
POST /pet       # hot-switch pet (pet_id or pet_dir)
```

Mutating endpoints (`POST /event`, `POST /bubble`, `POST /pet`) require
`X-QwenPaw-Pet-Token: <runtime/update-token>` by default — the bundled
QwenPaw plugin reads the token file automatically; standalone clients
must do the same. Set `QWENPAW_PET_REQUIRE_TOKEN=0` to disable the check
(only recommended for trusted single-user development setups).

## Pet package contract

A Codex-compatible pet folder needs:

```text
<pet-dir>/pet.json           # {"id":"...", "spritesheetPath":"spritesheet.webp"}
<pet-dir>/spritesheet.webp   # exactly 1536 x 1872 (8 cols x 9 rows of 192x208)
```

Row layout (driven by `qwenpaw_pet_desktop/sprites.py`):

```text
0 idle           6 frames
1 running-right  8 frames
2 running-left   8 frames
3 waving         4 frames
4 jumping        5 frames
5 failed         8 frames
6 waiting        6 frames
7 running        6 frames
8 review         6 frames
```

Default pet shipped with this plugin: **Snowpaw**
(`qwenpaw_pet_desktop/assets/default-pet/snowpaw/`).

Only the tiny `pet.json` manifest is committed; the 1.6 MB
`spritesheet.webp` is downloaded from a CDN the first time the pet is
installed and cached under `~/.qwenpaw-pet/cache/snowpaw-spritesheet.webp`
for subsequent runs. Override the source with `QWENPAW_PET_SNOWPAW_URL`
(e.g. point at an internal mirror or a `file://` URL for offline
installs). To ship the atlas inside the plugin instead, drop a valid
`spritesheet.webp` into
`qwenpaw_pet_desktop/assets/default-pet/snowpaw/` and the bundled copy
will take precedence over the cache and the network fetch.

## Backend hooks

`plugin.py` registers, via the documented `PluginApi`:

- `register_startup_hook` — patches `AgentRunner.query_handler` and the
  approval service, autostarts the desktop runtime, then emits
  `qwenpaw.startup`. Patch failures (e.g. an upstream rename of
  `AgentRunner` / `ApprovalService`) are reported via
  `logger.exception` so a broken plugin install does not stay silently
  dead.
- `register_shutdown_hook` — emits `qwenpaw.shutdown`, terminates the
  pet desktop process that this QwenPaw process has adopted (either
  autostarted by the plugin or already healthy on startup /
  `desktop/start`; controlled by `QWENPAW_PET_STOP_ON_SHUTDOWN`), and
  restores the patched class methods. So when the user exits QwenPaw
  the floating pet exits with it, including the case where the pet was
  a leftover from a previous QwenPaw run.
- `register_http_router` — mounts `router.py` under `/qwenpaw-pet`.

## Environment variables

| Var | Purpose | Default |
| --- | --- | --- |
| `QWENPAW_PET_DESKTOP_URL` | Full base URL for the plugin → desktop HTTP bridge. If set, port auto-fallback is **disabled** (URL and listener must agree). | unset ⇒ derive from host + port below |
| `QWENPAW_PET_DESKTOP_HOST` | Bind address when spawning (`--host`) | `127.0.0.1` |
| `QWENPAW_PET_DESKTOP_PORT` | Preferred port when spawning; if busy, the plugin scans upward (unless `DESKTOP_URL` is set or `STRICT` is on) | `8765` |
| `QWENPAW_PET_DESKTOP_STRICT_PORT` | `1` ⇒ never auto-pick another port (fail with EADDRINUSE if taken) | `0` |
| `QWENPAW_PET_DESKTOP_SCALE` | Spawn-time scale (e.g. `0.58`) | unset |
| `QWENPAW_PET_DESKTOP_PET_DIR` | Spawn-time pet folder override | unset |
| `QWENPAW_PET_TOKEN_PATH` | Path to the local update token | `~/.qwenpaw-pet/runtime/update-token` |
| `QWENPAW_PET_REQUIRE_TOKEN` | `0` ⇒ desktop *skips* the token check on mutating endpoints (anything else, including unset, enforces it) | `1` |
| `QWENPAW_PET_AUTOSTART` | `0` ⇒ plugin will not spawn the desktop | `1` |
| `QWENPAW_PET_STOP_ON_SHUTDOWN` | `0` ⇒ leave the pet desktop running after QwenPaw exits. Default: terminate any pet desktop QwenPaw has adopted (either by autostarting it or by seeing it healthy at startup / explicit `desktop/start`). | `1` |
| `QWENPAW_PET_HOME` | Runtime dir (PID file, log, **cache**, token, **remote.json**) | `~/.qwenpaw-pet/` |
| `QWENPAW_PET_SNOWPAW_URL` | CDN URL for snowpaw's `spritesheet.webp` (downloaded once on first install) | Alicdn-hosted default |
| `QWENPAW_WORKING_DIR` / `COPAW_WORKING_DIR` | Where `pets/`, `qwenpaw-pet-config.json`, `qwenpaw-pet-pair-tokens.json` live | falls back to `~/.copaw` then `~/.qwenpaw` |
| `QWENPAW_PET_MODE` | Hard-overrides mode. `local` / `remote` / `auto`. When set, UI toggle is disabled. | unset ⇒ `auto` |
| `QWENPAW_PET_PAIR_TTL_DAYS` | Default validity (days) for newly issued pairing tokens | `30` |

### Pet desktop log / common errors

`~/.qwenpaw-pet/runtime/pet-desktop.log` captures stderr from the spawned
desktop process.

- **`ModuleNotFoundError: No module named 'PySide6'`** — install Qt into the
  **same** Python as QwenPaw:
  `pip install "pyside6-essentials>=6.6"` (see `plugin.json` / `requirements.txt`).

- **`[Errno 48] address already in use` (uvicorn)** — something else is bound
  to the configured port (often a leftover pet or another app). Either stop
  that process, set `QWENPAW_PET_DESKTOP_PORT` to a free port, or unset
  `QWENPAW_PET_DESKTOP_URL` and let the plugin auto-pick the next free port
  after the preferred one.

The effective listen URL is mirrored under
`~/.qwenpaw-pet/runtime/desktop-bridge.json` (`url` field) so the plugin can
find the bridge after a port change.
