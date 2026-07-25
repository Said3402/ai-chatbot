/**
 * memory.js
 * ------------------------------------------------------------------
 * Conversation memory strategy:
 *   1. SHORT-TERM (this file): last N turns per session_id, kept
 *      in-memory (Map) for dev, or Redis for production (drop-in
 *      swap — see comments below). This is what preserves context
 *      turn-to-turn.
 *   2. LONG-TERM (optional): summarize sessions older than
 *      MAX_TURNS into a 2-3 sentence summary and prepend it, so
 *      context survives beyond the rolling window without unbounded
 *      token growth. Stubbed via summarizeIfNeeded().
 *
 * Each session expires after SESSION_TTL_MS of inactivity to bound
 * memory usage and avoid leaking one user's context into another's.
 * ------------------------------------------------------------------
 */

const MAX_TURNS = 12; // rolling window of user+assistant turns kept verbatim
const SESSION_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

const sessions = new Map(); // session_id -> { messages: [], summary: string, updatedAt }

function getSession(sessionId) {
  const existing = sessions.get(sessionId);
  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const fresh = { messages: [], summary: "", updatedAt: Date.now() };
  sessions.set(sessionId, fresh);
  return fresh;
}

function addTurn(sessionId, role, content) {
  const session = getSession(sessionId);
  session.messages.push({ role, content });

  // Keep only the most recent MAX_TURNS messages verbatim.
  if (session.messages.length > MAX_TURNS) {
    const overflow = session.messages.splice(0, session.messages.length - MAX_TURNS);
    session.summary = summarizeIfNeeded(session.summary, overflow);
  }
  return session;
}

/**
 * Cheap rolling summary placeholder. In production, call the LLM
 * once with the overflowed turns and ask for a 2-3 sentence summary,
 * then merge it with the existing summary. Kept deterministic here
 * to avoid an extra API call in the reference implementation.
 */
function summarizeIfNeeded(existingSummary, overflowMessages) {
  const topics = overflowMessages
    .filter((m) => m.role === "user")
    .map((m) => m.content.slice(0, 60))
    .join("; ");
  const addition = topics ? `Earlier topics discussed: ${topics}.` : "";
  return [existingSummary, addition].filter(Boolean).join(" ");
}

function getMessagesForModel(sessionId) {
  const session = getSession(sessionId);
  return session.messages;
}

function getSummary(sessionId) {
  return getSession(sessionId).summary;
}

/** Periodic cleanup of stale sessions. Call via setInterval in server.js */
function purgeExpired() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
  }
}

module.exports = { addTurn, getMessagesForModel, getSummary, purgeExpired, getSession };

/**
 * REDIS SWAP-IN (production):
 * Replace the Map above with Redis calls, e.g.:
 *   const redis = require('redis').createClient({ url: process.env.REDIS_URL });
 *   await redis.set(`session:${id}`, JSON.stringify(session), { EX: 7200 });
 *   const raw = await redis.get(`session:${id}`);
 * This lets memory survive server restarts and scales across
 * multiple backend instances (important once you're behind a load
 * balancer for WhatsApp/Telegram/Messenger traffic).
 */
