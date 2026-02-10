#!/bin/bash
# Hook: Save Claude Code conversation transcript to agent-connect on /clear
# Triggered by SessionEnd hook with "clear" matcher

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

TRANSCRIPT=$(cat "$TRANSCRIPT_PATH")
API_URL="${AGENT_CONNECT_URL:-http://localhost:3109}"
API_TOKEN="${AGENT_CONNECT_TOKEN:-}"

AUTH_HEADER=""
if [ -n "$API_TOKEN" ]; then
  AUTH_HEADER="Authorization: Bearer $API_TOKEN"
fi

# Load token from config if not set via env
if [ -z "$API_TOKEN" ]; then
  CONFIG_FILE="$HOME/.agent-connect/config.json"
  if [ -f "$CONFIG_FILE" ]; then
    API_TOKEN=$(jq -r '.apiToken // empty' "$CONFIG_FILE" 2>/dev/null)
    if [ -n "$API_TOKEN" ]; then
      AUTH_HEADER="Authorization: Bearer $API_TOKEN"
    fi
  fi
fi

if [ -n "$AUTH_HEADER" ]; then
  curl -s -X POST "$API_URL/api/conversations" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d "$(jq -n --arg path "$CWD" --arg transcript "$TRANSCRIPT" \
      '{projectPath: $path, transcript: $transcript}')" \
    > /dev/null 2>&1
else
  curl -s -X POST "$API_URL/api/conversations" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg path "$CWD" --arg transcript "$TRANSCRIPT" \
      '{projectPath: $path, transcript: $transcript}')" \
    > /dev/null 2>&1
fi

exit 0
