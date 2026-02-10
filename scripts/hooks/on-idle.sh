#!/bin/bash
# Hook: Notification (idle_prompt) — fires when Claude has been idle 60+ seconds
# Sends "task done" push notification with context about what was completed

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
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

# Read last assistant message from transcript for a meaningful summary
SUMMARY=""
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  LAST_MSG=$(tac "$TRANSCRIPT_PATH" 2>/dev/null | while IFS= read -r line; do
    ROLE=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    if [ "$ROLE" = "assistant" ]; then
      TEXT=$(echo "$line" | jq -r '
        .message.content
        | if type == "array" then
            [.[] | select(.type == "text")] | last | .text // empty
          elif type == "string" then .
          else empty
          end
      ' 2>/dev/null)
      if [ -n "$TEXT" ]; then
        echo "$TEXT"
        break
      fi
    fi
  done | head -c 300)

  if [ -n "$LAST_MSG" ]; then
    SUMMARY=$(echo "$LAST_MSG" | head -5 | sed 's/^[[:space:]]*//' | head -c 200)
  fi
fi

# Build notification body with task context
if [ -n "$SUMMARY" ]; then
  NOTIFY_MSG="$SUMMARY"
else
  NOTIFY_MSG="Claude is waiting for your input"
fi

# Send notification
NOTIFY_BODY=$(jq -n \
  --arg title "Claude Code" \
  --arg body "$NOTIFY_MSG" \
  --arg type "input_needed" \
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

# Update session status with task context
if [ -n "$SESSION_ID" ]; then
  if [ -n "$SUMMARY" ]; then
    STATUS_SUMMARY=$(echo "$SUMMARY" | head -1 | sed 's/^[[:space:]]*//' | head -c 120)
    STATUS_TEXT="Idle — $STATUS_SUMMARY"
  else
    STATUS_TEXT="Idle — waiting for input"
  fi
  STATUS_BODY=$(jq -n --arg s "$STATUS_TEXT" '{activityStatus: $s}')
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
