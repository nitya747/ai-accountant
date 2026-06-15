import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/db";
import { getEmbedding } from "../src/lib/vectorStore";

async function main() {
  console.log("Starting tax corpus ingestion...");

  const corpusPath = path.join(process.cwd(), "src", "lib", "data", "tax_corpus.json");
  if (!fs.existsSync(corpusPath)) {
    console.error(`Tax corpus file not found at: ${corpusPath}`);
    process.exit(1);
  }

  const rawCorpus = fs.readFileSync(corpusPath, "utf-8");
  const documents = JSON.parse(rawCorpus);

  console.log(`Loaded ${documents.length} source documents from corpus.`);

  // Clean existing documents & chunks to prevent duplicate ingestion
  console.log("Cleaning existing tax documents and chunks...");
  await prisma.chunk.deleteMany({});
  await prisma.document.deleteMany({});
  console.log("Existing documents cleared.");

  for (const doc of documents) {
    console.log(`Ingesting document: "${doc.title}" (Source: ${doc.source})`);
    
    // Create document
    const createdDoc = await prisma.document.create({
      data: {
        title: doc.title,
        source: doc.source,
      },
    });

    console.log(`Created document in database (ID: ${createdDoc.id}). Ingesting ${doc.chunks.length} chunks...`);

    for (const chunk of doc.chunks) {
      const chunkText = `[${doc.title} - ${chunk.heading}]\n${chunk.content}`;
      console.log(`- Generating embedding for: "${chunk.heading}"...`);
      
      let vector: number[] = [];
      try {
        vector = await getEmbedding(chunkText);
      } catch (err) {
        console.warn(`Failed to generate embedding for chunk "${chunk.heading}". Using mock empty array.`, err);
      }

      const stringifiedVector = JSON.stringify(vector);

      await prisma.chunk.create({
        data: {
          documentId: createdDoc.id,
          content: chunkText,
          embedding: stringifiedVector,
        },
      });
    }
    console.log(`Finished ingesting chunks for: "${doc.title}"`);
  }

  console.log("\nIngestion completed successfully!");
  
  // Verify counts
  const docsCount = await prisma.document.count();
  const chunksCount = await prisma.chunk.count();
  console.log(`Database summary: ${docsCount} Documents, ${chunksCount} Chunks.`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("An error occurred during ingestion:", e);
  await prisma.$disconnect();
  process.exit(1);
});
