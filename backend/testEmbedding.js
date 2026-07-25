require("dotenv").config();

const { embedText } = require("./embeddingService");

async function test() {
  const embedding = await embedText("Hello Amina");

  console.log("Embedding length:", embedding.length);
  console.log("First 10 values:");
  console.log(embedding.slice(0, 10));
}

test().catch(console.error);
