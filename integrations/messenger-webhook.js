/**
 * integrations/messenger-webhook.js  (Facebook Messenger Platform)
 * ------------------------------------------------------------------
 * SETUP:
 *   1. In the same Meta App used for WhatsApp (or a new one), add the
 *      "Messenger" product and connect it to a Facebook Page.
 *   2. Generate a Page Access Token -> MESSENGER_PAGE_ACCESS_TOKEN.
 *   3. Set webhook URL to https://yourdomain.com/webhooks/messenger,
 *      verify token = MESSENGER_VERIFY_TOKEN, subscribe to "messages".
 *   4. Message your Page on Facebook to test.
 * ------------------------------------------------------------------
 */

const fetch = require("node-fetch");

const GRAPH_API = `https://graph.facebook.com/v20.0/me/messages?access_token=${process.env.MESSENGER_PAGE_ACCESS_TOKEN}`;

function verify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.MESSENGER_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function sendMessage(psid, text) {
  await fetch(GRAPH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: psid },
      message: { text }
    })
  });
}

async function handleUpdate(body, generateReply) {
  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    const event = entry.messaging?.[0];
    if (!event || !event.message?.text) continue;

    const psid = event.sender.id; // page-scoped user id
    const sessionId = `messenger:${psid}`;

    const { text } = await generateReply(sessionId, event.message.text);
    await sendMessage(psid, text);
  }
}

module.exports = { verify, handleUpdate, sendMessage };
