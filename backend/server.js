/**
 * server.js — AI Chatbot Backend
 * ------------------------------------------------------------------
 * Endpoints:
 *   POST /api/chat                 Website/app frontend
 *   POST /webhooks/telegram        Telegram bot updates
 *   GET|POST /webhooks/whatsapp    Meta WhatsApp Cloud API
 *   GET|POST /webhooks/messenger   Facebook Messenger
 *   GET  /health                   Liveness probe
 *
 * Run: npm install && cp .env.example .env  (fill in keys) && npm start
 * ------------------------------------------------------------------
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");
const documentStore = require("./documentStore");
const memory = require("./memory");
const kb = require("./knowledgeBase")
const userMemory = require("./userMemory");
const telegram = require("./integrations/telegram-bot");
const whatsapp = require("./integrations/whatsapp-webhook");
const messenger = require("./integrations/messenger-webhook");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ verify: (req, res, buf) => (req.rawBody = buf) }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
console.log("Using Gemini model:", MODEL);

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "systemPrompt.txt"),
  "utf-8"
);

// --- Rate limiting: protects the API key and controls cost ---
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 messages/minute/IP
  message: { error: "Too many requests. Please slow down." }
});

// --- Basic input safety net (defense in depth; the model does the real work) ---
const BLOCKED_PATTERNS = [
  /how (do|can) i (make|build) a bomb/i,
  /child sexual/i
];
function looksUnsafe(text) {
  return BLOCKED_PATTERNS.some((re) => re.test(text));
}

/**
 * Core reasoning function shared by every channel (web, Telegram,
 * WhatsApp, Messenger). Keeping ONE function here means the system
 * prompt, memory, and KB logic never drift between channels.
 */
async function generateReply(sessionId, userText) {
  if (!userText || !userText.trim()) {
    return { text: "Could you share a bit more detail so I can help? / Don ka bayyana dan kadan don in taimaka?", blocked: false };
  }

  if (looksUnsafe(userText)) {
    return {
      text: "I can't help with that request. If you need something else, I'm happy to assist. / Ba zan iya taimakawa da wannan ba. Idan kana bukatar wani abu daban, ina nan a shirye.",
      blocked: true
    };
  }

  memory.addTurn(sessionId, "user", userText);
const lower = userText.toLowerCase();

if (
  (lower.includes("refresh") && lower.includes("document")) ||
  (lower.includes("reload") && lower.includes("document"))
) {
  await documentStore.refreshDocuments();

  return {
    text: "Documents refreshed successfully. I can now use the updated files.",
    blocked: false
  };
}
if (
  userText.toLowerCase().includes("what documents") ||
  userText.toLowerCase().includes("documents do you have") ||
  userText.toLowerCase().includes("available files")
) {
  const docs = documentStore.listDocuments();

  return {
    text: docs.length
      ? `I currently have these documents:\n\n${docs.map(d => "- " + d).join("\n")}`
      : "I don't have any documents uploaded yet.",
    blocked: false
  };
}  
  const contextBlock = kb.buildContextBlock(userText);
  const searchResults = await documentStore.semanticSearch(userText);

const pdfContext = searchResults
  .map(item => `Source: ${item.name} (Chunk ${item.chunk})\n${item.text}`)
  .join("\n\n");
  const messages = memory.getMessagesForModel(sessionId).map((m) => ({
    role: m.role,
    content: m.content
  }));

  // Inject retrieved KB context into the latest user turn only.
  let combinedContext = "";

if (contextBlock) {
  combinedContext += contextBlock + "\n\n";
}

if (pdfContext) {
  combinedContext += `<document>\n${pdfContext}\n</document>\n\n`;
}

if (combinedContext) {
  const last = messages[messages.length - 1];
  last.content = `${combinedContext}User question: ${userText}`;
}

  const summary = memory.getSummary(sessionId);
  const systemWithSummary = summary
    ? `${SYSTEM_PROMPT}\n\n<conversation_summary>\n${summary}\n</conversation_summary>`
    : SYSTEM_PROMPT;

  try {
    const prompt = messages
  .map((m) => `${m.role}: ${m.content}`)
  .join("\n");

const response = await ai.models.generateContent({
 model: MODEL,
  contents: prompt,
  config: {
    systemInstruction: systemWithSummary,
    maxOutputTokens: 1000,
  },
});

const text = response.text;

memory.addTurn(sessionId, "assistant", text);
return { text, blocked: false };

}
 catch (err) {
  console.error("Gemini API error:", err);

  let message =
    "Waleed AI is temporarily unavailable. Please try again in a few moments.";

  if (err.message && err.message.includes("429")) {
    message =
      "Waleed AI has reached its daily AI usage limit. Please try again later.";
  }

  return {
    text: message,
    blocked: false,
    error: true,
  };
}
} 

// ---------------------------------------------------------------
// Website / app chat endpoint
// ---------------------------------------------------------------
app.post("/api/chat", chatLimiter, async (req, res) => {
  const { message, sessionId } = req.body;
  const sid = sessionId || uuidv4();
  const profile = userMemory.getProfile(sid);
  const match = message.match(/^my name is (.+)$/i);
if (match) {
  userMemory.setName(sid, match[1].trim());
}
if (/[ƙƙ]|ina|sannu|taimaka|yaya/i.test(message)) {
  userMemory.setLanguage(sid, "ha");
} else {
  userMemory.setLanguage(sid, "en");
}
  const { text, error } = await generateReply(sid, message);
  res.json({ sessionId: sid, reply: text, error: !!error });
});

// ---------------------------------------------------------------
// Telegram webhook
// ---------------------------------------------------------------
app.post("/webhooks/telegram", async (req, res) => {
  res.sendStatus(200); // ack immediately; Telegram retries on timeout
  try {
    await telegram.handleUpdate(req.body, generateReply);
  } catch (err) {
    console.error("Telegram handler error:", err);
  }
});

// ---------------------------------------------------------------
// WhatsApp (Meta Cloud API) webhook
// ---------------------------------------------------------------
app.get("/webhooks/whatsapp", (req, res) => whatsapp.verify(req, res));
app.post("/webhooks/whatsapp", async (req, res) => {
  res.sendStatus(200);
  try {
    await whatsapp.handleUpdate(req.body, generateReply);
  } catch (err) {
    console.error("WhatsApp handler error:", err);
  }
});

// ---------------------------------------------------------------
// Facebook Messenger webhook
// ---------------------------------------------------------------
app.get("/webhooks/messenger", (req, res) => messenger.verify(req, res));
app.post("/webhooks/messenger", async (req, res) => {
  res.sendStatus(200);
  try {
    await messenger.handleUpdate(req.body, generateReply);
  } catch (err) {
    console.error("Messenger handler error:", err);
  }
});

app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

setInterval(() => memory.purgeExpired(), 1000 * 60 * 15);

const PORT = process.env.PORT || 3000;

(async () => {
  await documentStore.loadDocuments();
        documentStore.watchDocuments();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Chatbot backend running on port ${PORT}`);
  });
})();

