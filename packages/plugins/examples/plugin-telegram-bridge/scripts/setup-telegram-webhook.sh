#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-telegram-webhook.sh
#
# Registers the Telegram Bot webhook so incoming messages are forwarded to
# the Paperclip plugin webhook endpoint.
#
# Usage:
#   ./scripts/setup-telegram-webhook.sh <BOT_TOKEN> <PAPERCLIP_BASE_URL> [PLUGIN_ID]
#
# Example:
#   ./scripts/setup-telegram-webhook.sh "123456:ABC-DEF..." "https://app.paperclip.dev" "paperclip-telegram-bridge"
# ---------------------------------------------------------------------------
set -euo pipefail

BOT_TOKEN="${1:?Usage: $0 <BOT_TOKEN> <PAPERCLIP_BASE_URL> [PLUGIN_ID]}"
BASE_URL="${2:?Usage: $0 <BOT_TOKEN> <PAPERCLIP_BASE_URL> [PLUGIN_ID]}"
PLUGIN_ID="${3:-paperclip-telegram-bridge}"
ENDPOINT_KEY="telegram-update"

WEBHOOK_URL="${BASE_URL}/api/plugins/${PLUGIN_ID}/webhooks/${ENDPOINT_KEY}"

echo "=========================================="
echo " Telegram Webhook Setup"
echo "=========================================="
echo "Plugin ID  : ${PLUGIN_ID}"
echo "Webhook URL: ${WEBHOOK_URL}"
echo ""

# Step 1: Verify bot token
echo "[1/3] Verifying bot token..."
ME_RESPONSE=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getMe")
ME_OK=$(echo "$ME_RESPONSE" | grep -o '"ok":true' || true)

if [ -z "$ME_OK" ]; then
  echo "ERROR: Bot token verification failed."
  echo "Response: ${ME_RESPONSE}"
  exit 1
fi

BOT_USERNAME=$(echo "$ME_RESPONSE" | grep -oP '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "  Bot verified: @${BOT_USERNAME}"

# Step 2: Set webhook
echo "[2/3] Setting webhook..."
SET_RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"allowed_updates\":[\"message\",\"callback_query\"]}")

SET_OK=$(echo "$SET_RESPONSE" | grep -o '"ok":true' || true)
if [ -z "$SET_OK" ]; then
  echo "ERROR: Failed to set webhook."
  echo "Response: ${SET_RESPONSE}"
  exit 1
fi
echo "  Webhook set successfully."

# Step 3: Confirm
echo "[3/3] Confirming webhook info..."
INFO_RESPONSE=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")
echo "  ${INFO_RESPONSE}"

echo ""
echo "=========================================="
echo " Done! Webhook is active."
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Install the plugin in Paperclip (if not already):"
echo "     paperclipai plugin install ./packages/plugins/examples/plugin-telegram-bridge"
echo "  2. Configure plugin settings in the Paperclip UI"
echo "  3. Send /start to @${BOT_USERNAME} on Telegram to verify"