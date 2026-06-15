import { searchSimilarity } from "../src/lib/vectorStore";

const TEST_QUERIES = [
  "what are the slabs for the new tax regime?",
  "how much can I deduct under Section 80C and what are the rules?",
  "what is the tax rate for short term capital gains on equity?",
  "what is Section 44ADA presumptive taxation?",
  "TDS on professional services and contractor payments"
];

async function runTests() {
  console.log("=== Running Retrieval Verification Tests ===\n");

  for (const query of TEST_QUERIES) {
    console.log(`Query: "${query}"`);
    const results = await searchSimilarity(query, 3);
    
    if (results.length === 0) {
      console.log("  No matches found.\n");
      continue;
    }

    results.forEach((res, index) => {
      console.log(`  [Match #${index + 1}] Score: ${res.similarity.toFixed(4)} | Document: "${res.title}" | Source: ${res.source}`);
      // Print first 150 chars of the content
      const snippet = res.content.substring(0, 150).replace(/\n/g, " ");
      console.log(`  Snippet: "${snippet}..."\n`);
    });
    console.log("---------------------------------------------------\n");
  }
}

runTests().catch(console.error);
