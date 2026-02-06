#!/bin/bash
# Generate self-signed SSL certificates for local HTTPS development
# Required for push notifications (secure context)
#
# Usage: ./generate-ssl-certs.sh [hostname]
#   hostname: Tailscale hostname (e.g., your-machine.tailnet-name.ts.net) or IP address
#   Defaults to localhost if not provided

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CERTS_DIR="$PROJECT_DIR/certs"

# Get hostname from argument or default to localhost
HOSTNAME="${1:-localhost}"

mkdir -p "$CERTS_DIR"

# Build SAN (Subject Alternative Name) based on hostname type
# Check if hostname looks like an IP address
if [[ "$HOSTNAME" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # It's an IP address
  SAN="IP:$HOSTNAME,DNS:localhost,IP:127.0.0.1"
else
  # It's a hostname (like Tailscale hostname)
  SAN="DNS:$HOSTNAME,DNS:localhost,IP:127.0.0.1"
fi

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$CERTS_DIR/server.key" \
  -out "$CERTS_DIR/server.crt" \
  -subj "/CN=$HOSTNAME" \
  -addext "subjectAltName=$SAN"

echo "SSL certificates generated in $CERTS_DIR"
echo "  - server.key (private key)"
echo "  - server.crt (certificate)"
echo "  - Hostname: $HOSTNAME"
echo ""
echo "Note: Browsers will show a warning for self-signed certificates."
echo "You'll need to accept the certificate once per browser."
