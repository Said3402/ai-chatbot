const path = require("path");
const { extractPdfText } = require("./pdfLoader");

async function test() {
  const file = path.join(
    __dirname,
    "documents",
    "Course Form - SECOND SEMESTER, 2025_2026.pdf"
  );

  try {
    const text = await extractPdfText(file);

    console.log("===== PDF TEXT =====");
    console.log(text.substring(0, 1000));
  } catch (err) {
    console.error(err);
  }
}

test();
