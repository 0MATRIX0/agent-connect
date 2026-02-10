#!/bin/bash
# Hook: SessionEnd — fires when session terminates (exit, clear, logout)
# Updates dashboard status

INPUT=$(cat)
SESSION_ID="${AGENT_CONNECT_SESSION_ID:-}"
API_URL="${AGENT_CONNECT_URL:-http://localhost:3109}"
API_TOKEN="${AGENT_CONNECT_TOKEN:-}"

# Load token from config if not set via env
if [ -z "$API_TOKEN" ]; then
  CONFIG_FILE="$HOME/.agent-connect/config.json"
  if [ -f "$CONFIG_FILE" ]; then
    API_TOKEN=$(jq -r '.apiToken // empty' "$CONFIG_FILE" 2>/dev/null)
  fi
fi

AUTH_HEADER=""
if [ -n "$API_TOKEN" ]; then
  AUTH_HEADER="Authorization: Bearer $API_TOKEN"
fi

# Update session activity status
if [ -n "$SESSION_ID" ]; then
  STATUS_BODY=$(jq -n --arg s "Session ended" '{activityStatus: $s}')
  if [ -n "$AUTH_HEADER" ]; then
    curl -s -X PUT "$API_URL/api/sessions/$SESSION_ID/status" \
      -H "Content-Type: application/json" \
      -H "$AUTH_HEADER" \
      -d "$STATUS_BODY" > /dev/null 2>&1
  else
    curl -s -X PUT "$API_URL/api/sessions/$SESSION_ID/status" \
      -H "Content-Type: application/json" \
      -d "$STATUS_BODY" > /dev/null 2>&1
  fi
fi

exit 0
