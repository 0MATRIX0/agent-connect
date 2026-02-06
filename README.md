# Agent Connect

Push notifications for AI coding agents — get notified on your phone when Claude Code, Copilot, or other agents need attention.

## Quick Start

```bash
npx agent-connect
```

The setup wizard checks prerequisites, configures Tailscale HTTPS, generates VAPID keys, and starts the servers. Open the displayed URL on your phone to enable push notifications.

## Requirements

- Node.js >= 18
- [Tailscale](https://tailscale.com) (free plan works)

## Commands

| Command | Description |
|---|---|
| `agent-connect` | Start servers (runs setup on first use) |
| `agent-connect setup` | Run interactive setup wizard |
| `agent-connect start` | Start servers (skip setup check) |
| `agent-connect status` | Show connection & subscription info |
| `agent-connect notify "msg"` | Send a push notification |
| `agent-connect install-hook` | Install Claude Code notification hook |

## Notify Options

```bash
agent-connect notify "Task finished!"
agent-connect notify "Need input" --type input_needed
agent-connect notify "Build failed" --title "CI" --type error
```

## Claude Code Integration

Setup automatically installs a notification hook in `~/.claude/CLAUDE.md` so Claude Code sends push notifications when it completes tasks or needs input.

To manually install the hook:

```bash
agent-connect install-hook
```

## Notification Types

| Type | Description | Behavior |
|---|---|---|
| `completed` | Task finished | Default, auto-dismiss |
| `input_needed` | Agent needs input | Persistent until dismissed |
| `error` | Something went wrong | Auto-dismiss |

## API

```bash
curl -X POST https://YOUR_TAILSCALE_HOST:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'
```

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/subscribe` | Register push subscription |
| POST | `/api/unsubscribe` | Remove push subscription |
| POST | `/api/notify` | Send push notification |
| GET | `/api/health` | Health check |

## How It Works

Agent Connect runs two local servers behind Tailscale Serve:

- **Frontend** (port 3110) — Next.js PWA for push subscription management
- **API** (port 3109) — Notification server with Web Push (VAPID auth)

Tailscale Serve provides real HTTPS certificates automatically — no cert setup needed.

## License

MIT
