#!/bin/bash
set -euo pipefail

API_URL="https://api.uptimerobot.com/v2"
API_KEY="${UPTIMEROBOT_API_KEY:-}"
SPACE_HOST_INPUT="${1:-${SPACE_HOST:-}}"
STATUS_FILE="/tmp/hugging8n-uptimerobot-status.json"

if [ -z "$API_KEY" ]; then
  echo "Missing UPTIMEROBOT_API_KEY."
  exit 1
fi

if [ -z "$SPACE_HOST_INPUT" ]; then
  echo "Missing Space host."
  echo "Usage: UPTIMEROBOT_API_KEY=... ./setup-uptimerobot.sh your-space.hf.space"
  exit 1
fi

SPACE_HOST_CLEAN="${SPACE_HOST_INPUT#https://}"
SPACE_HOST_CLEAN="${SPACE_HOST_CLEAN#http://}"
SPACE_HOST_CLEAN="${SPACE_HOST_CLEAN%%/*}"

MONITOR_URL="https://${SPACE_HOST_CLEAN}/health"
MONITOR_NAME="${UPTIMEROBOT_MONITOR_NAME:-Hugging8n ${SPACE_HOST_CLEAN}}"
INTERVAL="${UPTIMEROBOT_INTERVAL:-300}"

MONITORS_RESPONSE=$(curl -sS -X POST "${API_URL}/getMonitors" \
  -d "api_key=${API_KEY}" \
  -d "format=json" \
  -d "logs=0" \
  -d "response_times=0" \
  -d "response_times_limit=1")

MONITOR_ID=$(printf '%s' "$MONITORS_RESPONSE" | jq -r --arg url "$MONITOR_URL" '
  (.monitors // []) | map(select(.url == $url)) | first | .id // empty
')

if [ -n "$MONITOR_ID" ]; then
  printf '{"configured":true,"monitorId":"%s","url":"%s","alreadyExisted":true,"timestamp":"%s"}\n' \
    "$MONITOR_ID" "$MONITOR_URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
  echo "Monitor already exists (id=${MONITOR_ID}) for ${MONITOR_URL}"
  exit 0
fi

CURL_ARGS=(
  -sS
  -X POST "${API_URL}/newMonitor"
  -d "api_key=${API_KEY}"
  -d "format=json"
  -d "type=1"
  -d "friendly_name=${MONITOR_NAME}"
  -d "url=${MONITOR_URL}"
  -d "interval=${INTERVAL}"
)

if [ -n "${UPTIMEROBOT_ALERT_CONTACTS:-}" ]; then
  CURL_ARGS+=(-d "alert_contacts=${UPTIMEROBOT_ALERT_CONTACTS}")
fi

CREATE_RESPONSE=$(curl "${CURL_ARGS[@]}")
CREATE_STATUS=$(printf '%s' "$CREATE_RESPONSE" | jq -r '.stat // "fail"')

if [ "$CREATE_STATUS" != "ok" ]; then
  printf '{"configured":false,"error":"creation failed","timestamp":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
  printf '%s\n' "$CREATE_RESPONSE"
  exit 1
fi

NEW_ID=$(printf '%s' "$CREATE_RESPONSE" | jq -r '.monitor.id // empty')
printf '{"configured":true,"monitorId":"%s","url":"%s","timestamp":"%s"}\n' \
  "${NEW_ID:-}" "$MONITOR_URL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATUS_FILE"
echo "Created UptimeRobot monitor ${NEW_ID:-"(id unavailable)"} for ${MONITOR_URL}"
