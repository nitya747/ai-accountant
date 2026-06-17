import { prisma } from "./db";
import { embed } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { getRelatedTaxRelationships, extractTaxSections } from "./neo4j";

const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
  "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
  "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
  "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
  "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
  "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
  "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
  "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
  "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
  "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
  "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
  "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself",
  "yourselves"
]);

function getWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
  content: string;
  similarity: number;
}

const globalForExtractor = globalThis as unknown as { extractorInstance: any };

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    if (!globalForExtractor.extractorInstance) {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = "./.cache";
      globalForExtractor.extractorInstance = await pipeline(
        "feature-extraction",
        "Xenova/bge-small-en-v1.5",
        {
          progress_callback: (info: any) => {
            if (info.status === "progress") {
              console.log(`[Download Progress] ${info.file}: ${info.progress.toFixed(1)}% (${(info.loaded / 1024 / 1024).toFixed(1)}MB / ${(info.total / 1024 / 1024).toFixed(1)}MB)`);
            } else if (info.status === "initiate") {
              console.log(`[Download Start] ${info.file}`);
            } else if (info.status === "done") {
              console.log(`[Download Done] ${info.file}`);
            } else if (info.status === "ready") {
              console.log(`[Pipeline Ready]`);
            }
          }
        }
      );
    }
    const output = await globalForExtractor.extractorInstance(text, {
      pooling: "cls",
      normalize: true,
    });
    return Array.from(output.data) as number[];
  } catch (error) {
    console.error("Local BGE-M3 embedding generation failed:", error);
    return [];
  }
}

export async function searchSimilarity(query: string, limit: number = 5, sessionId?: string): Promise<SearchResult[]> {
  const dbChunks = await prisma.chunk.findMany({
    where: {
      OR: [
        { document: { sessionId: null } },
        { document: { sessionId } }
      ]
    },
    include: {
      document: true,
    },
  });

  if (dbChunks.length === 0) {
    return [];
  }

  // Real vector search mode
  try {
    const queryVector = await getEmbedding(query);
    if (queryVector.length === 0) {
      throw new Error("Failed to generate embedding vector");
    }

    const scored = dbChunks.map((chunk) => {
      let chunkVector: number[] = [];
      try {
        chunkVector = JSON.parse(chunk.embedding);
      } catch (e) {
        console.error("Error parsing embedding for chunk", chunk.id, e);
      }

      const similarity = cosineSimilarity(queryVector, chunkVector);
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: chunk.document.title,
        source: chunk.document.source,
        content: chunk.content,
        similarity,
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  } catch (error) {
    console.warn("Vector search failed or bypassed, falling back to keyword search:", error);
    
    // Perform keyword-based search rank
    const queryWords = getWords(query);
    if (queryWords.length === 0) {
      // Fallback if no contentful words: return first N
      return dbChunks.slice(0, limit).map((c) => ({
        chunkId: c.id,
        documentId: c.documentId,
        title: c.document.title,
        source: c.document.source,
        content: c.content,
        similarity: 1.0,
      }));
    }

    const scored = dbChunks.map((chunk) => {
      const contentWords = getWords(chunk.content);
      
      let score = 0;
      for (const qw of queryWords) {
        // Exact match or substring match
        if (chunk.content.toLowerCase().includes(qw)) {
          score += 1;
        }
        if (chunk.document.title.toLowerCase().includes(qw)) {
          score += 3; // Boost for matching title/sections
        }
      }

      // Basic length normalization
      const normalizedScore = score / (1 + Math.log(1 + contentWords.length));

      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: chunk.document.title,
        source: chunk.document.source,
        content: chunk.content,
        similarity: normalizedScore,
      };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }
}

export async function rerankChunks(
  query: string,
  chunks: SearchResult[],
  limit: number = 5
): Promise<SearchResult[]> {
  const cohereKey = process.env.COHERE_API_KEY;
  if (!cohereKey || cohereKey === "mock-cohere-key" || chunks.length === 0) {
    // Return top N without reranking
    return chunks.slice(0, limit);
  }

  try {
    const response = await fetch("https://api.cohere.com/v1/rerank", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cohereKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-english-v3.0",
        query,
        documents: chunks.map((c) => c.content),
        top_n: limit,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.statusText}`);
    }

    const data = await response.json();
    const reranked: SearchResult[] = data.results.map((result: any) => {
      const originalChunk = chunks[result.index];
      return {
        ...originalChunk,
        similarity: result.relevance_score, // Update similarity to Cohere relevance score
      };
    });

    return reranked;
  } catch (error) {
    console.error("Cohere Rerank failed, falling back to vector similarity ranking:", error);
    return chunks.slice(0, limit);
  }
}

export interface HybridSearchResult {
  chunks: SearchResult[];
  relationships: any[];
}

export async function searchHybrid(
  query: string,
  chunkLimit: number = 5,
  rerankLimit: number = 3,
  sessionId?: string
): Promise<HybridSearchResult> {
  // 1. Get initial semantic chunks (retrieve a bit more than limit to allow graph additions/reranking)
  const initialChunks = await searchSimilarity(query, 10, sessionId);

  // 2. Extract sections from query and initial chunks
  const detectedSections = new Set<string>();
  
  // Extract from query
  extractTaxSections(query).forEach((sec) => detectedSections.add(sec));
  
  // Extract from retrieved chunks
  initialChunks.forEach((chunk) => {
    extractTaxSections(chunk.content).forEach((sec) => detectedSections.add(sec));
    extractTaxSections(chunk.title).forEach((sec) => detectedSections.add(sec));
  });

  // 3. Query Knowledge Graph for relationships
  const relationships = await getRelatedTaxRelationships(Array.from(detectedSections).join(" "));

  // 4. Graph-expanded retrieval: find any sections mentioned as targets/sources in the relationships
  const expandedSections = new Set<string>();
  relationships.forEach((rel) => {
    if (rel.source.startsWith("Section")) expandedSections.add(rel.source);
    if (rel.target.startsWith("Section")) expandedSections.add(rel.target);
  });

  // Filter out already detected sections to find new ones
  const sectionsToFetch = Array.from(expandedSections).filter(
    (sec) => !detectedSections.has(sec)
  );

  let graphChunks: SearchResult[] = [];
  if (sectionsToFetch.length > 0) {
    // Retrieve chunks matching these new sections from the database
    const matchingDocs = await prisma.document.findMany({
      where: {
        AND: [
          {
            OR: sectionsToFetch.map((sec) => ({
              title: { contains: sec }
            }))
          },
          {
            OR: [
              { sessionId: null },
              { sessionId }
            ]
          }
        ]
      },
      include: {
        chunks: true
      }
    });

    matchingDocs.forEach((doc) => {
      doc.chunks.forEach((chunk) => {
        graphChunks.push({
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: doc.title,
          source: doc.source,
          content: chunk.content,
          similarity: 0.85 // Give graph-expanded chunks a high baseline score
        });
      });
    });
  }

  // 5. Merge, deduplicate, and rerank
  const allChunksMap = new Map<string, SearchResult>();
  
  // Add initial chunks
  initialChunks.forEach((c) => allChunksMap.set(c.chunkId, c));
  
  // Add graph expanded chunks if they don't already exist
  graphChunks.forEach((c) => {
    if (!allChunksMap.has(c.chunkId)) {
      allChunksMap.set(c.chunkId, c);
    }
  });

  const mergedChunks = Array.from(allChunksMap.values());
  
  // Rerank the merged set
  const rerankedChunks = await rerankChunks(query, mergedChunks, rerankLimit);

  return {
    chunks: rerankedChunks,
    relationships
  };
}
