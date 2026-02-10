#!/bin/bash
# Hook: SessionEnd (clear) — saves the conversation transcript before /clear wipes it
# Only runs inside agent-connect PTY sessions (where env vars are set)

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
SESSION_ID="${AGENT_CONNECT_SESSION_ID:-}"
API_URL="${AGENT_CONNECT_URL:-http://localhost:3109}"
API_TOKEN="${AGENT_CONNECT_TOKEN:-}"
LOG_FILE="$HOME/.agent-connect/data/hook-debug.log"

# Guard: only run inside agent-connect PTY sessions
if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Guard: need a transcript file to save
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  echo "$(date -Iseconds) on-clear: no transcript at '$TRANSCRIPT_PATH'" >> "$LOG_FILE" 2>/dev/null
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

# Build the JSON body using --rawfile to avoid ARG_MAX limits on large transcripts
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

jq -n --rawfile transcript "$TRANSCRIPT_PATH" --arg path "$CWD" \
  '{projectPath: $path, transcript: $transcript}' > "$TMPFILE"

if [ $? -ne 0 ]; then
  echo "$(date -Iseconds) on-clear: jq failed building body" >> "$LOG_FILE" 2>/dev/null
  exit 0
fi

# POST using -d @file to avoid shell expansion limits
if [ -n "$AUTH_HEADER" ]; then
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/conversations" \
    -H "Content-Type: application/json" \
    -H "$AUTH_HEADER" \
    -d @"$TMPFILE")
else
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/conversations" \
    -H "Content-Type: application/json" \
    -d @"$TMPFILE")
fi

if [ "$HTTP_CODE" -ge 400 ] 2>/dev/null; then
  echo "$(date -Iseconds) on-clear: POST /api/conversations failed with HTTP $HTTP_CODE" >> "$LOG_FILE" 2>/dev/null
fi

exit 0
