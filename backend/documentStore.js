const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { extractPdfText } = require("./pdfLoader");
const { embedText } = require("./embeddingService");
const { cosineSimilarity } = require("./vectorSearch");
const EMBEDDINGS_FILE = path.join(__dirname, "embeddings.json");

let documents = [];

async function loadDocuments() {
  const dir = path.join(__dirname, "documents");

  if (!fs.existsSync(dir)) {
    documents = [];
    return;
  }

  const files = fs
    .readdirSync(dir)
    .filter(file => file.toLowerCase().endsWith(".pdf"));

  documents = [];

if (fs.existsSync(EMBEDDINGS_FILE)) {
  try {
    documents = JSON.parse(
      fs.readFileSync(EMBEDDINGS_FILE, "utf8")
    );

    console.log(`Loaded ${documents.length} cached document chunks.`);

    return;
  } catch (err) {
    console.log("Embedding cache is invalid. Rebuilding...");
    documents = [];
  }
}
  for (const file of files) {
  try {
    const text = await extractPdfText(path.join(dir, file));

    const chunks = text.match(/[\s\S]{1,1000}/g) || [];

    let chunkNumber = 1;

    for (const chunk of chunks) {
  console.log(`Embedding chunk ${chunkNumber} of ${file}...`);

  const embedding = await embedText(chunk);

  console.log(`✓ Finished chunk ${chunkNumber}`);

  documents.push({
    name: file,
    chunk: chunkNumber,
    text: chunk,
    embedding
  });

  chunkNumber++;
}

    console.log(`Loaded PDF: ${file}`);

  } catch (err) {
    console.error(`Failed to load ${file}:`, err.message);
  }
}
fs.writeFileSync(
  EMBEDDINGS_FILE,
  JSON.stringify(documents, null, 2),
  "utf8"
);

console.log("Embedding cache saved.");
console.log(`Total document chunks loaded: ${documents.length}`);
} 
function getDocuments() {
  return documents;
}
function listDocuments() {
  return documents.map(doc => doc.name)
    .filter((value, index, self) => self.indexOf(value) === index);
}
function searchDocuments(query) {
  const words = query
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 2);

  let results = [];

  for (const doc of documents) {
    const text = doc.text.toLowerCase();

    let score = 0;

    for (const word of words) {
      if (text.includes(word)) {
        score++;
      }
    }

    if (score > 0) {
      results.push({
  score,
  name: doc.name,
  chunk: doc.chunk,
  text: doc.text
});
    }
  }

  results.sort((a, b) => b.score - a.score);

  const bestResults = results
  .slice(0, 2)
  .map(item =>
    `Source: ${item.name} (Chunk ${item.chunk})\n${item.text}`
  )
  .join("\n\n");

  return bestResults || null;
}

async function refreshDocuments() {
  documents = [];
  await loadDocuments();
}

let watcherStarted = false;

function watchDocuments() {
  if (watcherStarted) return;
  watcherStarted = true;

  const dir = path.join(__dirname, "documents");

  chokidar
    .watch(dir, {
      ignoreInitial: true
    })
    .on("add", async file => {
      console.log(`New document detected: ${path.basename(file)}`);
      await refreshDocuments();
    })
    .on("change", async file => {
      console.log(`Document updated: ${path.basename(file)}`);
      await refreshDocuments();
    })
    .on("unlink", async file => {
      console.log(`Document removed: ${path.basename(file)}`);
      await refreshDocuments();
    });
}
async function semanticSearch(query) {
  const queryEmbedding = await embedText(query);

  const ranked = documents
    .map(doc => ({
      ...doc,
      score: cosineSimilarity(queryEmbedding, doc.embedding)
    }))
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 3);
}

module.exports = {
  loadDocuments,
  getDocuments,
  searchDocuments,
  semanticSearch,
  listDocuments,
  refreshDocuments,
  watchDocuments
};
