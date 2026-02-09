# Agent Connect

Terminal session management and push notifications for AI coding agents. Monitor, control, and interact with agent sessions from any device — get notified when Claude Code, Copilot, or other agents need attention.

## Quick Start

```bash
npx agent-connect
```

The setup wizard checks prerequisites, configures Tailscale HTTPS, generates VAPID keys, and starts the servers. Open the displayed URL on your phone to enable push notifications and manage sessions.

## Features

- **Terminal sessions** — Launch, monitor, kill, and restore terminal sessions via web UI
- **Push notifications** — Get notified on your phone when agents complete tasks or need input
- **Project workspaces** — Organize sessions by project
- **Mobile-friendly PWA** — Virtual keypad, search, macros, responsive layout
- **Session persistence** — SQLite-backed scrollback and session history
- **Real-time monitoring** — Live CPU, memory, and activity stats for running sessions

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

## Web UI

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | Overview of projects and active sessions |
| Projects | `/projects` | Create and manage project workspaces |
| Sessions | `/sessions` | Browse all sessions with live activity indicators |
| Terminal | `/terminal/[id]` | Interactive terminal with search, macros, and virtual keypad |
| Settings | `/settings` | Notification config, terminal macros, API info |

## Notification Types

```bash
agent-connect notify "Task finished!"
agent-connect notify "Need input" --type input_needed
agent-connect notify "Build failed" --title "CI" --type error
```

| Type | Description |
|---|---|
| `completed` | Task/request finished successfully (default) |
| `planning_complete` | Finished planning, ready for review |
| `approval_needed` | Need approval before proceeding |
| `input_needed` | Need information or clarification |
| `command_execution` | A command finished executing |
| `error` | Something failed |

## Claude Code Integration

Setup automatically installs a notification hook in `~/.claude/CLAUDE.md` so Claude Code sends push notifications when it completes tasks or needs input.

To manually install the hook:

```bash
agent-connect install-hook
```

## API

All endpoints require a Bearer token via the `Authorization` header (except health check).

```bash
curl -X POST https://YOUR_TAILSCALE_HOST:3109/api/notify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'
```

### Push Notifications

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/subscribe` | Register push subscription |
| POST | `/api/unsubscribe` | Remove push subscription |
| POST | `/api/notify` | Send push notification |

### Projects

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| DELETE | `/api/projects/:id` | Delete a project |

### Sessions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/sessions` | List sessions (query: `projectId`, `status`, `limit`, `offset`) |
| POST | `/api/sessions` | Launch a new session |
| GET | `/api/sessions/:id` | Get session details |
| DELETE | `/api/sessions/:id` | Kill a session |
| GET | `/api/sessions/:id/stats` | Session stats (CPU, memory, uptime) |
| GET | `/api/sessions/:id/output` | Session scrollback (query: `full`, `lines`) |
| POST | `/api/sessions/:id/restore` | Restore a stopped session |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/notifications` | List notification history |
| DELETE | `/api/notifications` | Clear all notifications |
| DELETE | `/api/notifications/:id` | Delete a notification |

### WebSocket

| Endpoint | Description |
|---|---|
| `WS /ws/sessions/:id` | Terminal streaming (auth via `?token=` query param) |

### Other

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |

## Architecture

Agent Connect runs two local servers behind Tailscale Serve:

- **Frontend** (port 3110) — Next.js PWA with glass UI, terminal emulation (xterm.js), and push subscription management
- **API** (port 3109) — Session manager (node-pty), notification server (Web Push), and WebSocket relay

Session data persists to SQLite at `~/.agent-connect/data/sessions.db`. Tailscale Serve provides real HTTPS certificates automatically — no cert setup needed.

## License

MIT
