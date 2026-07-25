/**
 * knowledgeBase.js
 * ------------------------------------------------------------------
 * Minimal retrieval layer. Ships with in-memory keyword matching so
 * the project runs with zero external dependencies out of the box.
 *
 * PRODUCTION UPGRADE PATH:
 *   Replace `retrieve()` with a real vector search:
 *     - Pinecone / Weaviate / Qdrant / pgvector for the index
 *     - Anthropic or OpenAI embeddings (or a local model) to embed
 *       both the KB entries (offline, once) and the user query (live)
 *     - Cosine similarity top-k, then feed the passages into
 *       buildContextBlock() exactly as done here.
 * ------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");
const knowledgeDir = path.join(__dirname, "knowledge");

const KB = fs
  .readdirSync(knowledgeDir)
  .filter(file => file.endsWith(".json"))
  .flatMap(file =>
    JSON.parse(
      fs.readFileSync(
        path.join(knowledgeDir, file),
        "utf8"
      )
    )
  );
  

/**
 * Naive keyword retrieval. Returns the best-matching entries (or none).
 * @param {string} query
 * @param {number} topK
 */
function retrieve(query, topK = 2) {
  const q = query.toLowerCase();
  const scored = KB.map((entry) => {
    const score = entry.keywords.reduce(
      (acc, kw) => acc + (q.includes(kw.toLowerCase()) ? 1 : 0),
      0
    );
    return { entry, score };
  }).filter((s) => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map((s) => s.entry);
}

/**
 * Builds a <context> block to inject into the prompt. Includes both
 * languages so the model can pick whichever matches the user.
 */
function buildContextBlock(query) {
  const hits = retrieve(query);
  if (hits.length === 0) return null;

  const lines = hits.map(
    (h) => `- (EN) ${h.en}\n  (HA) ${h.ha}`
  );
  return `<context>\n${lines.join("\n")}\n</context>`;
}

module.exports = { retrieve, buildContextBlock, KB };
