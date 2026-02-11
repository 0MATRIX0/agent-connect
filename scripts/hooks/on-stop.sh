#!/bin/bash
# Hook: Stop — fires when Claude finishes responding
# Primary source of "task completed" notifications
# Reads transcript to create intelligent notification summaries

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // empty')
SESSION_ID="${AGENT_CONNECT_SESSION_ID:-}"
API_URL="${AGENT_CONNECT_URL:-http://localhost:3109}"
API_TOKEN="${AGENT_CONNECT_TOKEN:-}"

# Prevent infinite loops (stop hook calling notify which triggers stop hook)
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

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

# Portable reverse-file reader (tac on Linux, tail -r on macOS/BSD)
reverse_file() {
  if command -v tac >/dev/null 2>&1; then
    tac "$1"
  else
    tail -r "$1"
  fi
}

# Read last assistant message from transcript for a meaningful summary
SUMMARY="Task completed"
if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # Extract last assistant text content from JSONL transcript
  LAST_MSG=$(reverse_file "$TRANSCRIPT_PATH" 2>/dev/null | while IFS= read -r line; do
    ROLE=$(echo "$line" | jq -r '.type // empty' 2>/dev/null)
    if [ "$ROLE" = "assistant" ]; then
      # Get the last text content block
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
    # Truncate to first meaningful sentence/line
    SUMMARY=$(echo "$LAST_MSG" | head -5 | sed 's/^[[:space:]]*//' | head -c 200)
  fi
fi

# Send notification
NOTIFY_BODY=$(jq -n \
  --arg title "Claude Code" \
  --arg body "$SUMMARY" \
  --arg type "completed" \
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

# Update session activity status with task summary
if [ -n "$SESSION_ID" ]; then
  # Truncate summary for status display (keep it concise)
  STATUS_SUMMARY=$(echo "$SUMMARY" | head -1 | sed 's/^[[:space:]]*//' | head -c 120)
  STATUS_BODY=$(jq -n --arg s "Done — $STATUS_SUMMARY" '{activityStatus: $s}')
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
