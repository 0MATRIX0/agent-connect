# Agent Notifier

Push notifications for AI coding agents. Get notified on your phone or desktop when Claude Code (or any agent) finishes a task, hits an error, or needs your input.

## Overview

Agent Notifier is a self-hosted PWA that receives push notifications triggered by a simple API call. Run it on your home server, point your AI agent at the `/api/notify` endpoint, and get native notifications on any device.

**Architecture**: Next.js 14 frontend (subscription UI) + standalone Node.js API server (push delivery) + Web Push API with VAPID authentication.

```
                          +-----------------+
                          |   Your Phone/   |
                          |    Desktop      |
                          |  (PWA installed)|
                          +--------^--------+
                                   |
                              Native Push
                            (Web Push API)
                                   |
+-------------+    HTTP POST    +--+-------------+    web-push    +----------+
|  AI Agent   | -------------> |  API Server    | ------------> | Push     |
| (Claude     |  /api/notify   |  (server.js)   |   VAPID auth  | Service  |
|  Code, etc) |                |  :3109         |               | (FCM/    |
+-------------+                +----------------+               | Mozilla) |
                                                                +----------+
```

## Features

- **Push notifications** with 3 types: `completed`, `input_needed`, `error`
- **PWA** -- installable on Android, iOS, and desktop
- **Type-specific behavior** -- vibration patterns, persistent notifications for `input_needed`
- **Simple REST API** -- one `curl` command to send a notification
- **Auto-cleanup** of stale/expired push subscriptions
- **Dark theme UI** with copy-to-clipboard helpers for API URLs and VAPID keys
- **Tailscale integration** for secure private access with real HTTPS certificates
- **Multiple deployment options** -- Tailscale, self-signed certs, or Cloudflare Tunnel

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Generate VAPID keys

```bash
npm run generate-vapid-keys
```

Copy the output into a new `.env.local` file:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
VAPID_SUBJECT=mailto:you@example.com

APP_HOSTNAME=localhost
NEXT_PUBLIC_API_URL=https://localhost:3109
API_PORT=3109
API_HOST=127.0.0.1
```

### 3. Build and run

```bash
npm run build
npm run start:tailscale   # recommended (see Deployment below)
```

### 4. Subscribe

Open the app in your browser, click **Enable Notifications**, and allow the permission prompt. You're now receiving push notifications.

### 5. Send a notification

```bash
curl -X POST https://your-hostname:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Task completed!", "type": "completed"}'
```

## Deployment

### Option 1: Tailscale (Recommended)

Tailscale gives you real HTTPS certificates, a stable hostname, and private network access with zero port forwarding. See [TAILSCALE_SETUP.md](TAILSCALE_SETUP.md) for a full walkthrough.

Quick version:

```bash
# Install Tailscale and get your hostname
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale set --operator=$USER

# Set up HTTPS proxying
tailscale serve --bg --https 443 http://localhost:3110    # Frontend
tailscale serve --bg --https 3109 http://localhost:3109   # API

# Configure .env.local with your Tailscale hostname, then:
npm run build
npm run start:tailscale
```

### Option 2: Self-Signed Certificates

For local development or when Tailscale isn't available:

```bash
npm run generate-ssl-certs -- your-hostname

# Start with self-signed HTTPS
npm run start
```

Browsers will show a certificate warning. Push notifications may not work on all devices with self-signed certs.

### Option 3: Cloudflare Tunnel

Exposes your local server through Cloudflare's network. Requires `cloudflared` installed.

```bash
# Development
npm run dev:tunnel

# Production
npm run start:tunnel
```

## API Reference

All endpoints are served by the standalone API server (`server.js`) on port 3109.

### POST /api/subscribe

Register a push subscription.

**Body** (PushSubscription object from the browser):
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

**Response**: `200 { "success": true, "message": "Subscribed successfully" }`

### POST /api/unsubscribe

Remove a push subscription.

**Body**:
```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Response**: `200 { "success": true }` or `404` if not found.

### POST /api/notify

Send a push notification to all subscribers.

**Body**:
```json
{
  "title": "Claude Code",
  "body": "Task completed!",
  "type": "completed",
  "icon": "/icon-192.png",
  "badge": "/icon-192.png",
  "data": {}
}
```

| Field   | Required | Default          | Description                              |
|---------|----------|------------------|------------------------------------------|
| `title` | Yes      | --               | Notification title                       |
| `body`  | Yes      | --               | Notification body text                   |
| `type`  | No       | `"completed"`    | One of `completed`, `input_needed`, `error` |
| `icon`  | No       | `"/icon-192.png"` | Notification icon URL                    |
| `badge` | No       | `"/icon-192.png"` | Notification badge URL                   |
| `data`  | No       | `{}`             | Arbitrary data passed to the service worker |

**Response**:
```json
{
  "success": true,
  "message": "Notification sent to 2 subscriber(s)",
  "sent": 2,
  "cleaned": 0
}
```

### GET /api/notify

Send a notification via query parameters (useful for quick testing).

```
GET /api/notify?title=Test&body=Hello&type=completed
```

### GET /api/health

Health check. Returns subscription count.

```json
{ "status": "ok", "subscriptions": 2 }
```

## Notification Types

| Type | Description | Vibration Pattern | Persists? |
|------|-------------|-------------------|-----------|
| `completed` | Task finished successfully | Short double pulse (100-50-100ms) | No |
| `input_needed` | Agent needs your attention | Long triple pulse (200-100-200-100-200ms) | Yes |
| `error` | Something went wrong | Two long pulses (500-200-500ms) | No |

`input_needed` notifications use `requireInteraction: true`, so they stay visible until you dismiss them.

## Integration with Claude Code

### Using Claude Code hooks

Add a post-task hook that fires a notification when work completes. In your project's `.claude/hooks.json`:

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "stop",
        "command": "curl -s -X POST https://your-hostname:3109/api/notify -H 'Content-Type: application/json' -d '{\"title\": \"Claude Code\", \"body\": \"Task finished\", \"type\": \"completed\"}'"
      }
    ]
  }
}
```

### curl examples

```bash
# Task completed
curl -X POST https://your-hostname:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Build succeeded!", "type": "completed"}'

# Input needed
curl -X POST https://your-hostname:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Need approval to proceed", "type": "input_needed"}'

# Error
curl -X POST https://your-hostname:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Claude Code", "body": "Tests failed: 3 errors", "type": "error"}'

# Quick test via GET
curl "https://your-hostname:3109/api/notify?title=Test&body=Hello"
```

## Project Structure

```
agent-notifier/
├── app/                        # Next.js App Router
│   ├── api/
│   │   ├── notify/route.ts     # Notify endpoint (Next.js route handler)
│   │   ├── subscribe/route.ts  # Subscribe endpoint
│   │   ├── unsubscribe/route.ts
│   │   └── proxy/[...path]/    # Proxy to standalone API server
│   │       └── route.ts
│   ├── globals.css             # Tailwind CSS imports
│   ├── layout.tsx              # Root layout with PWA metadata
│   └── page.tsx                # Main UI (subscription management)
├── lib/
│   ├── subscriptions.ts        # Subscription CRUD (file-based storage)
│   └── webpush.ts              # Web Push configuration and types
├── public/
│   ├── icon-192.png            # PWA icon (192x192)
│   ├── icon-512.png            # PWA icon (512x512)
│   └── manifest.json           # PWA manifest
├── scripts/
│   ├── generate-ssl-certs.sh   # Generate self-signed SSL certificates
│   └── generate-vapid-keys.js  # Generate VAPID key pair
├── worker/
│   └── index.js                # Custom service worker (push handler)
├── data/                       # Runtime data (gitignored)
│   └── subscriptions.json      # Push subscription storage
├── server.js                   # Standalone API server (port 3109)
├── server-nextjs.js            # Next.js HTTPS/HTTP server wrapper
├── next.config.js              # Next.js + next-pwa configuration
├── tailwind.config.js          # Tailwind CSS config
├── tsconfig.json               # TypeScript config
├── package.json
├── .env.local                  # Environment variables (gitignored)
├── .gitignore
├── TAILSCALE_SETUP.md          # Tailscale deployment guide
└── README.md                   # This file
```

## Configuration

### Environment Variables (`.env.local`)

| Variable | Build/Runtime | Required | Description |
|----------|---------------|----------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Build | Yes | VAPID public key for push subscriptions |
| `VAPID_PRIVATE_KEY` | Runtime | Yes | VAPID private key for signing push messages |
| `VAPID_SUBJECT` | Runtime | No | VAPID subject (default: `mailto:admin@example.com`) |
| `APP_HOSTNAME` | Runtime | No | Display hostname for server startup logs |
| `NEXT_PUBLIC_API_URL` | Build | No | API server URL (empty = same-origin via Next.js routes) |
| `API_PORT` | Runtime | No | API server port (default: `3109`) |
| `API_HOST` | Runtime | No | API server bind address (default: `0.0.0.0`) |
| `DISABLE_SSL` | Runtime | No | Set `true` to run in HTTP mode (for reverse proxies) |
| `LISTEN_HOST` | Runtime | No | Next.js server bind address (default: `0.0.0.0`) |

`NEXT_PUBLIC_*` variables are baked into the frontend at build time. You must run `npm run build` after changing them.

## Development

```bash
# Start both Next.js dev server and API server with hot reload
npm run dev

# Start with HTTPS (self-signed certs required)
npm run dev:https

# Start with Cloudflare tunnel
npm run dev:tunnel

# Generate new VAPID keys
npm run generate-vapid-keys

# Generate self-signed SSL certificates
npm run generate-ssl-certs -- your-hostname

# Lint
npm run lint
```

### npm scripts

| Script | Description |
|--------|-------------|
| `dev` | Start Next.js + API server in dev mode |
| `dev:https` | Start Next.js with self-signed HTTPS |
| `dev:api` | Start standalone API server only |
| `dev:tunnel` | Dev mode + Cloudflare tunnel |
| `build` | Production build |
| `start` | Start with self-signed HTTPS |
| `start:tailscale` | Start in HTTP mode for Tailscale Serve |
| `start:tunnel` | Start with Cloudflare tunnel |
| `lint` | Run ESLint |

## Tech Stack

- **Next.js 14** -- App Router, React Server Components
- **React 18** -- Client-side subscription UI
- **TypeScript** -- Type-safe API routes and lib code
- **Tailwind CSS 3** -- Styling
- **web-push** -- VAPID-authenticated push message delivery
- **next-pwa** (Workbox) -- Service worker generation and PWA support
- **concurrently** -- Run frontend + API server in parallel

## Troubleshooting

### Push notifications not working

- Ensure you're accessing via **HTTPS** (push requires a secure context)
- Check browser console for errors during subscription
- Verify VAPID keys match between `.env.local` and the built frontend
- After changing `NEXT_PUBLIC_*` vars, run `npm run build` again

### "No subscriptions to notify" response

- Open the app in your browser and click **Enable Notifications**
- Check `data/subscriptions.json` has entries (or `curl /api/health` shows `subscriptions > 0`)

### Port conflict on startup

- Set `API_HOST=127.0.0.1` in `.env.local` so the app server doesn't conflict with Tailscale Serve binding the Tailscale IP
- Check for other processes: `ss -tlnp | grep -E '3109|3110'`

### Notifications work on desktop but not mobile

- iOS requires the PWA to be **installed to the home screen** for push notifications
- Android should work from the browser, but installing the PWA improves reliability
- Self-signed certificates will block push on most mobile browsers; use Tailscale for real certs

### Service worker not updating

- Hard refresh (Ctrl+Shift+R) or clear site data in browser settings
- In Chrome DevTools > Application > Service Workers, click "Update" or "Unregister"

## Roadmap

- **npm package distribution**
  - `npx agent-notifier init` to scaffold config
  - Auto Tailscale login + serve permissions setup
  - Single install command for everything
  - CLI for sending notifications
- **Additional notification channels** (Slack, Discord webhooks)
- **Multi-agent support** with named subscriptions
- **Authentication / API keys** for public deployments
- **Dashboard** with notification history and delivery status

## License

MIT
