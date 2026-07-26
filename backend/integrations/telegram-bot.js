/**
 * integrations/telegram-bot.js
 * ------------------------------------------------------------------
 * SETUP:
 *   1. Create a bot via @BotFather on Telegram, get TELEGRAM_BOT_TOKEN.
 *   2. Deploy your backend so it's reachable over HTTPS (e.g. Render,
 *      Fly.io, a VPS behind Nginx + Let's Encrypt).
 *   3. Register the webhook (one-time call):
 *
 *      curl -F "url=https://yourdomain.com/webhooks/telegram" \
 *           "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook"
 *
 *   4. Message your bot on Telegram — updates now hit
 *      POST /webhooks/telegram on your server.
 * ------------------------------------------------------------------
 */

const fetch = require("node-fetch");

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" })
  });
}

/**
 * @param {object} update - Telegram update payload
 * @param {function} generateReply - shared (sessionId, text) => {text} core function
 */
async function handleUpdate(update, generateReply) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const sessionId = `telegram:${chatId}`; // stable per-user session key

  const { text } = await generateReply(sessionId, message.text);
  await sendMessage(chatId, text);
}

module.exports = { handleUpdate, sendMessage };
