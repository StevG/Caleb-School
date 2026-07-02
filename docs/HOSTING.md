# Hosting: standalone (Raspberry Pi) vs. HomeHub

The app runs in two places. The **same `server.py`** works in both — the
standalone-only behavior is entirely **opt-in via environment variables and
turns itself off under HomeHub**, so there is nothing to delete when you
migrate. This doc is the map of which knobs belong to which host.

## TL;DR — moving to HomeHub

Nothing in the code needs removing. To deploy on HomeHub you only:
1. Register the app in HomeHub's `projects.json` (dev-first) — slug `spelling`,
   type `command`, start `PORT=$PORT python3 server.py`, prod 8013 / dev 8113.
2. Do **not** set `HOST` or `AUTO_UPDATE` in that start command.

That's it. With those env vars unset, the server binds loopback and never
self-updates — exactly the HomeHub contract. HomeHub does the git pulls and
process management itself. (Belt and suspenders: even if `AUTO_UPDATE=1`
leaked in, the server detects HomeHub via the `HUB_SLUG`/`HUB_ENV` vars
HomeHub exports and disables self-update anyway.)

## The standalone-only knobs (env vars)

| Env var | Default | What it does | Use on… |
|---|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0` exposes the server on the LAN so phones/iPads can reach it. | Pi only. **Never** on HomeHub (it must stay loopback behind the tunnel). |
| `PORT` | `8013` | Listen port. | Both (HomeHub injects it). |
| `AUTO_UPDATE` | off | `1`/`true` → self-update from git (see below). | Pi only. Off/absent on HomeHub. |
| `AUTO_UPDATE_INTERVAL` | `90` | Seconds between update checks (min 15). | Pi only. |
| `AUTO_UPDATE_BRANCH` | current branch | Branch to track. | Pi only. |

## Self-update on the Pi (the HomeHub-like part)

When `AUTO_UPDATE=1`, a daemon thread (`start_auto_updater` in server.py)
every `AUTO_UPDATE_INTERVAL` seconds runs `git fetch` + `git merge --ff-only`
on the tracked branch. If new commits arrived, it **re-execs the process**
(`os.execv`) so new server code takes effect, rebinding the same port. This
mirrors what HomeHub's keeper script does for its apps.

- Progress data (`data/progress.json`) is gitignored, so pulls never touch it
  and it survives restarts.
- Fast-forward only: if the Pi's checkout has local commits/edits that would
  conflict, the merge is skipped (no clobber) until you sort it out by hand.
- After the server updates, the **phone still shows its own "Update" prompt**
  (the PWA notices the new `/api/version`) — the server refreshes itself; the
  installed app refreshes on one tap. The two mechanisms are independent.

### Run it on the Pi with self-update on

```bash
cd ~/Caleb-School
HOST=0.0.0.0 PORT=8013 AUTO_UPDATE=1 python3 server.py
```

Leave that running (or background it with `nohup … &`). From then on, pushing
to `main` updates the Pi within ~90 s with no SSH.

### Optional: run as a service so it survives reboots

`~/.config/systemd/user/spelling.service`:

```ini
[Unit]
Description=Spelling Practice
After=network-online.target

[Service]
WorkingDirectory=%h/Caleb-School
Environment=HOST=0.0.0.0 PORT=8013 AUTO_UPDATE=1
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now spelling
loginctl enable-linger $USER   # keep it running when you're not logged in
```

## What each host is responsible for

| Concern | Standalone (Pi) | HomeHub |
|---|---|---|
| Reach from phones | `HOST=0.0.0.0`, local IP/hostname, plain HTTP | Cloudflare tunnel, HTTPS, `<slug>.smacgray.com` |
| Login/auth | none (LAN) | Cloudflare Access (email) + the app's parent PIN |
| Pulling new code | `AUTO_UPDATE=1` (this app) | HomeHub keeper (auto-pulls `main`) |
| Process lifecycle | you / systemd | HomeHub |
| Offline PWA caching | off over plain HTTP | on (HTTPS) |

The app code is identical across both — only the environment differs.
