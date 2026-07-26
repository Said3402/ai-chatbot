/**
 * integrations/whatsapp-webhook.js  (Meta WhatsApp Cloud API)
 * ------------------------------------------------------------------
 * SETUP:
 *   1. Create a Meta App at developers.facebook.com, add the
 *      "WhatsApp" product, and get a temporary (then permanent)
 *      WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID.
 *   2. In the app dashboard, set the webhook URL to:
 *        https://yourdomain.com/webhooks/whatsapp
 *      and the verify token to match WHATSAPP_VERIFY_TOKEN in .env.
 *   3. Subscribe the webhook to the "messages" field.
 *   4. Send a WhatsApp message to your test number — it now flows
 *      through generateReply() like every other channel.
 * ------------------------------------------------------------------
 */

const fetch = require("node-fetch");

const GRAPH_API = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

/** Meta's webhook handshake (GET request with a challenge to echo back). */
function verify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function sendMessage(to, text) {
  await fetch(GRAPH_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: text }
    })
  });
}

async function handleUpdate(body, generateReply) {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const message = change?.value?.messages?.[0];
  if (!message || message.type !== "text") return;

  const from = message.from; // WhatsApp user's phone number
  const sessionId = `whatsapp:${from}`;

  const { text } = await generateReply(sessionId, message.text.body);
  await sendMessage(from, text);
}

module.exports = { verify, handleUpdate, sendMessage };
