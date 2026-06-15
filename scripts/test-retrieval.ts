import { searchHybrid } from "../src/lib/vectorStore";
import { formatGraphRelationships } from "../src/lib/neo4j";

const TEST_QUERIES = [
  "what are the slabs for the new tax regime?",
  "how much can I deduct under Section 80C and what are the rules?",
  "what is the tax rate for short term capital gains on equity?",
  "what is Section 44ADA presumptive taxation?",
  "TDS on professional services and contractor payments"
];

async function runTests() {
  console.log("=== Running Hybrid RAG Retrieval (Vector + Graph) Verification Tests ===\n");

  for (const query of TEST_QUERIES) {
    console.log(`Query: "${query}"`);
    const { chunks, relationships } = await searchHybrid(query, 5, 3);
    
    // Print retrieved relationships
    if (relationships.length > 0) {
      console.log("  [Graph Relationships]");
      console.log(formatGraphRelationships(relationships).replace("### Tax Knowledge Graph Relationships:\n", "    "));
    } else {
      console.log("  [Graph Relationships] No related tax graph connections found.");
    }
    console.log("");

    // Print chunks
    if (chunks.length === 0) {
      console.log("  [Document Chunks] No matching documents found.\n");
    } else {
      console.log("  [Document Chunks]");
      chunks.forEach((res, index) => {
        console.log(`    #${index + 1} Score: ${res.similarity.toFixed(4)} | Document: "${res.title}" | Source: ${res.source}`);
        const snippet = res.content.substring(0, 150).replace(/\n/g, " ");
        console.log(`      Snippet: "${snippet}..."\n`);
      });
    }
    console.log("---------------------------------------------------\n");
  }
}

runTests().catch(console.error);
