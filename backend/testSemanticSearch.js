require("dotenv").config();

const documentStore = require("./documentStore");

async function main() {
  await documentStore.loadDocuments();

  const results = await documentStore.semanticSearch(
    "What is my registration number?"
  );

  console.log("\nTop Results:\n");

  for (const result of results) {
    console.log("--------------------------------");
    console.log("Score:", result.score);
    console.log("Document:", result.name);
    console.log("Chunk:", result.chunk);
    console.log(result.text.substring(0, 250));
    console.log();
  }
}

main().catch(console.error);
