#!/bin/bash
# Hook: PreToolUse — fires before any tool executes
# Updates dashboard with live status — NO push notification (too noisy)

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SESSION_ID="${AGENT_CONNECT_SESSION_ID:-}"
API_URL="${AGENT_CONNECT_URL:-http://localhost:3109}"
API_TOKEN="${AGENT_CONNECT_TOKEN:-}"

# Skip if no session ID or tool name
if [ -z "$SESSION_ID" ] || [ -z "$TOOL_NAME" ]; then
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

# Map tool name to human-readable status
case "$TOOL_NAME" in
  Bash)             STATUS="Running command..." ;;
  Write)            STATUS="Writing file..." ;;
  Edit)             STATUS="Editing file..." ;;
  Read)             STATUS="Reading file..." ;;
  Grep)             STATUS="Searching code..." ;;
  Glob)             STATUS="Finding files..." ;;
  Task)             STATUS="Running subagent..." ;;
  WebFetch)         STATUS="Fetching URL..." ;;
  WebSearch)        STATUS="Searching web..." ;;
  NotebookEdit)     STATUS="Editing notebook..." ;;
  AskUserQuestion)  STATUS="Asking question..." ;;
  *)                STATUS="Working ($TOOL_NAME)..." ;;
esac

# Update dashboard status only
STATUS_BODY=$(jq -n --arg s "$STATUS" '{activityStatus: $s}')
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

exit 0
