# CRM Server launchd agent

The CRM's local Express server (including the avatar render worker) runs as
a macOS launchd user-agent so it starts automatically on login and
restarts on crash. No `npm run dev` needed.

## Install

```bash
bash "/Users/raysmacbook/Desktop/Vernon Tech And Media/Client Projects/VTM/CRM/server/launchd/install.sh"
```

Copies the plist to `~/Library/LaunchAgents/com.vernontm.crm-server.plist`
and loads it via `launchctl`.

## Uninstall

```bash
bash "/Users/raysmacbook/Desktop/Vernon Tech And Media/Client Projects/VTM/CRM/server/launchd/uninstall.sh"
```

## Common commands

| Action | Command |
|---|---|
| Tail live log | `tail -f ~/Library/Logs/vtm-crm-server.out.log` |
| Tail error log | `tail -f ~/Library/Logs/vtm-crm-server.err.log` |
| Check status | `launchctl list \| grep crm-server` |
| Restart (pick up new code) | `launchctl kickstart -k gui/$UID/com.vernontm.crm-server` |
| Stop | `launchctl unload ~/Library/LaunchAgents/com.vernontm.crm-server.plist` |
| Start | `launchctl load ~/Library/LaunchAgents/com.vernontm.crm-server.plist` |
| Free stuck port 3001 | `lsof -ti :3001 \| xargs kill -9` |

## Status column meanings

`launchctl list | grep crm-server` output:

- `PID	0	label` — running, last exit was clean
- `-	0	label` — not running, last exit was clean
- `-	1	label` (or higher) — keeps crashing; check error log

## After code changes

Server code (`CRM/server/**`) isn't bundled, so a restart picks up edits:

```bash
launchctl kickstart -k gui/$UID/com.vernontm.crm-server
```

Client code (`CRM/client/**`) needs a build before it's live:

```bash
cd "/Users/raysmacbook/Desktop/Vernon Tech And Media/Client Projects/VTM"
bash build-crm.sh
git add New/admin && git commit -m "..." && git push origin main
```

Vercel redeploys automatically. No launchd action needed for client changes.

## Env vars

Edit `CRM/server/.env` then restart with `launchctl kickstart -k …`.

Required for the avatar render worker:
- `HEYGEN_API_KEY`
- `ELEVENLABS_API_KEY`
- `SUPABASE_URL` (e.g. `https://ssllepovajmohdhvhzsa.supabase.co`)
- `SUPABASE_SERVICE_KEY` (service_role, not anon)

Startup banner in the log should show:
```
🎬 Avatar render worker ready ✓
[render-worker] started, polling every 10s
```

If instead you see `⚠️  HeyGen not configured` or `⚠️  Supabase not configured`, the env vars didn't load — double-check `.env` syntax and restart.
