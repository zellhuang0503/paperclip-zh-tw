#!/usr/bin/env node
/**
 * poll-bridge.mjs — Development-only polling bridge.
 *
 * Uses Telegram's getUpdates long-polling to receive messages, then forwards
 * each update to the local Paperclip plugin webhook endpoint.
 *
 * Usage:
 *   node scripts/poll-bridge.mjs <BOT_TOKEN> <PLUGIN_ID> [SERVER_URL]
 *
 * This replaces the need for a public URL / tunnel during local development.
 */

const BOT_TOKEN = process.argv[2];
const PLUGIN_ID = process.argv[3];
const SERVER_URL = process.argv[4] || "http://127.0.0.1:3100";

if (!BOT_TOKEN || !PLUGIN_ID) {
  console.error("Usage: node poll-bridge.mjs <BOT_TOKEN> <PLUGIN_ID> [SERVER_URL]");
  process.exit(1);
}

const WEBHOOK_URL = `${SERVER_URL}/api/plugins/${PLUGIN_ID}/webhooks/telegram-update`;
let offset = 0;

console.log(`Telegram Poll Bridge started`);
console.log(`  Bot token: ${BOT_TOKEN.slice(0, 10)}...`);
console.log(`  Webhook:   ${WEBHOOK_URL}`);
console.log(`  Press Ctrl+C to stop\n`);

// Make sure no webhook is set (so getUpdates works)
await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);

async function poll() {
  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`;
    const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
    const data = await res.json();

    if (!data.ok || !data.result?.length) return;

    for (const update of data.result) {
      offset = update.update_id + 1;

      const text = update.message?.text || "(non-text)";
      const from = update.message?.from?.first_name || "?";
      console.log(`[${new Date().toLocaleTimeString()}] ${from}: ${text}`);

      // Forward to local plugin webhook
      try {
        const fwdRes = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });
        const fwdData = await fwdRes.json();
        console.log(`  → ${fwdData.status || fwdData.error || "forwarded"}`);
      } catch (err) {
        console.error(`  → Forward failed: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.name !== "TimeoutError" && err.name !== "AbortError") {
      console.error(`Poll error: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Run forever
while (true) {
  await poll();
}