#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-telegram-webhook.sh
#
# Quick diagnostic: verifies bot token + shows current webhook status.
#
# Usage:
#   ./scripts/check-telegram-webhook.sh <BOT_TOKEN>
# ---------------------------------------------------------------------------
set -euo pipefail

BOT_TOKEN="${1:?Usage: $0 <BOT_TOKEN>}"

echo "=== Bot Info ==="
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | python3 -m json.tool 2>/dev/null || \
  curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe"

echo ""
echo "=== Webhook Info ==="
curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool 2>/dev/null || \
  curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"