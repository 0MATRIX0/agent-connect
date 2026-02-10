#!/bin/bash
# Hook: Notification (permission_prompt) — fires when Claude needs tool permission
# Sends "needs permission" push notification

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

# Send notification
NOTIFY_BODY=$(jq -n \
  --arg title "Claude Code" \
  --arg body "Claude needs permission to proceed" \
  --arg type "approval_needed" \
  '{title: $title, body: $body, type: $type}')

if [ -n "$AUTH_HEADER" ]; then
  curl -s -X POST "$API_URL/api/notify" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d "$NOTIFY_BODY" > /dev/null 2>&1
else
  curl -s -X POST "$API_URL/api/notify" \
    -H "Content-Type: application/json" \
    -d "$NOTIFY_BODY" > /dev/null 2>&1
fi

# Update session status
if [ -n "$SESSION_ID" ]; then
  STATUS_BODY=$(jq -n --arg s "Needs permission" '{activityStatus: $s}')
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
