# Tailscale Setup for Agent-Notifier

Access your agent-notifier app securely from any device (computer, phone) using Tailscale.

## Why Tailscale?

- **Stable URLs**: Unlike Cloudflare tunnels, your hostname never changes
- **Private**: Traffic stays within your private network (tailnet)
- **No port forwarding**: Works behind any firewall/NAT
- **Real HTTPS**: Tailscale Serve provides trusted Let's Encrypt certificates
- **Free**: Personal use up to 100 devices

## Quick Setup

### 1. Install Tailscale on your server

```bash
# Ubuntu/Debian
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

### 2. Enable Tailscale Serve

Enable HTTPS serving in the Tailscale admin console:
https://login.tailscale.com/admin/machines

Then set your user as the Tailscale operator (avoids needing sudo):
```bash
sudo tailscale set --operator=$USER
```

### 3. Get your Tailscale hostname

```bash
tailscale status --self --json | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))"
# Example output: ground-control.tail5dcc8e.ts.net
```

### 4. Configure agent-notifier

Update `.env.local`:

```env
APP_HOSTNAME=your-machine.tailnet-name.ts.net
NEXT_PUBLIC_API_URL=https://your-machine.tailnet-name.ts.net:3109
API_HOST=127.0.0.1
```

### 5. Set up Tailscale Serve (HTTPS proxy)

```bash
# Frontend on port 443 (proxied from local HTTP port 3110)
tailscale serve --bg --https 443 http://localhost:3110

# API on port 3109 (proxied from local HTTP port 3109)
tailscale serve --bg --https 3109 http://localhost:3109
```

### 6. Build and start the app

```bash
npm run build
npm run start:tailscale
```

### 7. Install Tailscale on your phone

1. Download Tailscale from App Store / Play Store
2. Sign in with the same account as your server
3. Open `https://your-machine.tailnet-name.ts.net`
4. Enable push notifications — no certificate warnings!

## Accessing the App

| Device | URL |
|--------|-----|
| Frontend | `https://your-machine.tailnet-name.ts.net` |
| API | `https://your-machine.tailnet-name.ts.net:3109` |

## Testing

```bash
# Health check (no -k needed, certs are trusted!)
curl https://your-machine.tailnet-name.ts.net:3109/api/health

# Send test notification
curl -X POST https://your-machine.tailnet-name.ts.net:3109/api/notify \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "Hello from Tailscale!"}'
```

## Managing Tailscale Serve

```bash
# View current serve config
tailscale serve status

# Stop serving
tailscale serve --https 443 off
tailscale serve --https 3109 off

# Reset all serve config
tailscale serve reset
```

## Alternative: Self-Signed Certificates

If you can't use Tailscale Serve, you can use self-signed certificates:

```bash
# Generate self-signed certs
./scripts/generate-ssl-certs.sh your-hostname

# Start with self-signed HTTPS
npm run start
```

Note: Self-signed certificates will show browser warnings and may not work with push notifications on all devices.

## Cloudflare Tunnel (Alternative)

```bash
# Development with tunnel
npm run dev:tunnel

# Production with tunnel
npm run start:tunnel
```

## Troubleshooting

### Push notifications not working
- Ensure you're accessing via `https://` (not `http://`)
- Check `tailscale serve status` to confirm serve is running
- Verify both servers are running: `ss -tlnp | grep -E '3109|3110'`
- Check browser console for errors

### Can't connect from phone
1. Make sure Tailscale is running on both devices
2. Check `tailscale status` shows both devices connected
3. Try `tailscale ping your-machine` from your phone

### Port conflict on startup
If you get `EADDRINUSE`, make sure `API_HOST=127.0.0.1` is set in `.env.local`,
since Tailscale Serve binds the Tailscale IP. The app servers should bind to localhost only.
