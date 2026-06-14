# AI Accountant — Project Architecture Plan

> A ChatGPT-style web app for conversational AI accounting, specialised for the Indian tax system.

---

## Tech Stack Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript |
| Auth | NextAuth.js (email/password credentials only) |
| AI SDK | Vercel AI SDK |
| LLM routing | OpenRouter — primary: `deepseek/deepseek-chat-v3-0324:free` |
| AI framework | LangChain.js |
| Database | PostgreSQL + pgvector (Neon / Aiven / Railway) |
| ORM | Prisma |
| Knowledge graph | Neo4j AuraDB |
| Reranker | Cohere Rerank |
| Deployment | Railway / Fly.io / Render (not Vercel) |
| Observability | LangSmith (tracing) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│               CLIENT LAYER (Next.js 14)                 │
│  Chat UI (RSC + streaming) │ Auth │ Session sidebar     │
└────────────────────┬────────────────────────────────────┘
                     │ API Routes / tRPC
┌────────────────────▼────────────────────────────────────┐
│                   API GATEWAY LAYER                     │
│  Auth middleware │ Rate limiting │ Session management   │
└────────────────────┬────────────────────────────────────┘
                     │ Vercel AI SDK
┌────────────────────▼────────────────────────────────────┐
│              AI CORE (LangChain.js)                     │
│  RAG pipeline │ Agent + tools │ Memory │ System prompt  │
│                     │                                   │
│          OpenRouter → LLM (switchable)                  │
└────┬───────────────────────────────────┬────────────────┘
     │                                   │
┌────▼──────────────┐        ┌───────────▼────────────────┐
│   DATA LAYER      │        │      KNOWLEDGE LAYER       │
│  PostgreSQL       │        │  pgvector │ Neo4j          │
│  pgvector         │        │  Document store │ Reranker │
│  Prisma ORM       │        │                            │
└───────────────────┘        └────────────────────────────┘
```

---

## Layer-by-layer Breakdown

### 1. Frontend — Next.js 14 (App Router, TypeScript)

- **Chat UI** built with React Server Components for fast initial load; client component only for the interactive message input
- **Streaming** via Vercel AI SDK's `useChat` hook — handles SSE from OpenRouter transparently
- **Session history sidebar** — RSC, fetches from Postgres, no client JS overhead
- **File upload** — Form-16, 26AS, ITR PDFs via a multipart API route that feeds the ingestion pipeline
- **Auth pages** — NextAuth.js with credentials provider (email + password only); bcrypt for password hashing

### 2. API Gateway Layer

All handled via Next.js route handlers and middleware:

- `middleware.ts` — JWT validation on all `/api/*` and `/chat` routes
- `/api/chat` — main streaming endpoint, proxies to AI core
- `/api/sessions` — CRUD for chat sessions (tRPC recommended for type safety)
- `/api/upload` — file ingestion trigger
- `/api/auth/[...nextauth]` — NextAuth credentials handler (register + login)
- Rate limiting: Upstash Redis (or simple in-memory for MVP)

### 3. AI Core

#### Vercel AI SDK
Handles the streaming pipe from OpenRouter to the browser. Core call:
```ts
const result = await streamText({
  model: openrouter('deepseek/deepseek-chat-v3-0324:free'),
  system: CA_SYSTEM_PROMPT,
  messages,
  tools: { tax_slab_calculator, itr_form_selector, deduction_lookup, tds_lookup, cite_section },
});
return result.toDataStreamResponse();
```

#### LangChain.js — RAG Pipeline
```
User query
  → Embed query (OpenAI text-embedding-3-small / nomic-embed-text)
  → pgvector similarity search (top 20)
  → Neo4j graph traversal (related sections)
  → Cohere Rerank (top 5)
  → Inject context into prompt
  → LLM response (streamed)
```

#### LangChain Agent Tools
| Tool | Description |
|---|---|
| `tax_slab_calculator` | Compute tax liability for AY2024–25 / AY2025–26 under old and new regime |
| `itr_form_selector` | Determine correct ITR form based on income type |
| `deduction_lookup` | List applicable deductions (80C, 80D, HRA, etc.) for a given profile |
| `tds_lookup` | TDS rates by section and payee type |
| `cite_section` | Query Neo4j for the authoritative section text |

#### System Prompt (CA persona)
The system prompt establishes the model as a knowledgeable Indian CA, instructs it to:
- Always cite specific sections (e.g. Section 80C, Section 44AD)
- Distinguish between old and new tax regimes
- Recommend consulting a licensed CA for filings
- Respond in clear, plain English (or Hinglish if user preference detected)

#### OpenRouter — LLM Routing
All free tier. Switchable via a single env var:

- **Primary:** `deepseek/deepseek-chat-v3-0324:free` — best-in-class free model for tool calling and multi-step reasoning; consistently reliable on OpenRouter's free tier
- **Fallback 1:** `meta-llama/llama-4-maverick:free` — strong tool-calling, good instruction following, Meta-backed so endpoint is stable
- **Fallback 2:** `qwen/qwen3-235b-a22b:free` — very large MoE model, excellent reasoning, good when DeepSeek is rate-limited

All three pass reliable tool-calling tests on OpenRouter's free tier. Build a simple fallback chain: if primary returns a 429/5xx, retry with fallback 1, then fallback 2.

### 4. Data Layer — PostgreSQL + pgvector

Hosted on **Neon** (recommended for serverless Next.js) or Railway Postgres.

#### Prisma Schema

```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  name      String?
  image     String?
  createdAt DateTime  @default(now())
  sessions  Session[]
}

model Session {
  id        String    @id @default(cuid())
  userId    String
  title     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id])
  messages  Message[]
}

model Message {
  id        String   @id @default(cuid())
  sessionId String
  role      String   // 'user' | 'assistant' | 'system'
  content   String
  createdAt DateTime @default(now())
  session   Session  @relation(fields: [sessionId], references: [id])
}

model Document {
  id        String   @id @default(cuid())
  title     String
  source    String   // 'income_tax_act' | 'gst_act' | 'cbdt_circular' | 'user_upload'
  chunks    Chunk[]
}

model Chunk {
  id         String   @id @default(cuid())
  documentId String
  content    String
  embedding  Unsupported("vector(1536)")
  document   Document @relation(fields: [documentId], references: [id])
}
```

#### pgvector Similarity Search
```sql
SELECT content, 1 - (embedding <=> $1::vector) AS similarity
FROM "Chunk"
ORDER BY embedding <=> $1::vector
LIMIT 20;
```

### 5. Knowledge Layer — Indian Tax Corpus

#### Source Documents to Ingest
- Income Tax Act, 1961 (all chapters)
- Finance Act 2024 — AY2025–26 amendments
- GST Act + IGST Act
- TDS provisions (Chapter XVII)
- CBDT circulars and notifications
- ITR filing guidelines (AY2024–25, AY2025–26)
- Capital gains computation rules (Section 45–55A)

#### Ingestion Pipeline (LangChain.js)
```
PDF / HTML source
  → LangChain document loader
  → RecursiveCharacterTextSplitter (chunk: 800 tokens, overlap: 100)
  → Embed each chunk (text-embedding-3-small)
  → Upsert into pgvector (Chunk table)
  → Index section metadata into Neo4j
```

#### Knowledge Graph — Neo4j AuraDB

Models relationships between tax concepts so the agent can traverse "what applies to me":

```cypher
// Example nodes and relationships
(Section80C)-[:INCLUDES]->(ELSS)
(Section80C)-[:INCLUDES]->(PPF)
(Section80C)-[:MAX_DEDUCTION]->(amount: 150000)
(Section44AD)-[:APPLIES_TO]->(PresumptiveBusinessIncome)
(Section44AD)-[:TURNOVER_LIMIT]->(amount: 30000000)
(GST_18)-[:APPLIES_TO]->(ITServices)
(HRA)-[:REQUIRES]->(RentReceipt)
(OldRegime)-[:ALLOWS]->(Section80C)
(NewRegime)-[:DOES_NOT_ALLOW]->(Section80C)
```

Graph traversal query example:
```cypher
MATCH (regime:Regime {name: "Old"})-[:ALLOWS]->(deduction:Deduction)
WHERE deduction.applicableTo CONTAINS "salaried"
RETURN deduction.name, deduction.maxAmount, deduction.section
```

#### Hybrid Retrieval Flow
1. Embed the user query
2. pgvector top-20 semantic matches
3. Extract section numbers from matches → Neo4j traversal for related sections
4. Merge and deduplicate results
5. Cohere Rerank → top 5 most relevant chunks
6. Inject into LLM context window

---

## Database Schema — Entity Relationships

```
User (1) ──────── (many) Session
Session (1) ───── (many) Message
Document (1) ──── (many) Chunk
Chunk (1) ──────── vector embedding (pgvector)
```

---

## Deployment

### Recommended: Railway

- Next.js app as a Railway service (GitHub auto-deploy)
- PostgreSQL as a Railway plugin (same project)
- Neo4j on AuraDB free tier (external, managed)
- Environment variables managed in Railway dashboard
- Docker build via Railway's Nixpacks (zero config for Next.js)

### Alternative: Fly.io

- `fly.toml` config, Dockerfile for Next.js
- Fly Postgres for the database
- Better for custom resource control

### CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to Railway
        run: railway up
```

---

## Observability

LangSmith is sufficient at this stage — it covers the most important surface (the AI pipeline) without added infra overhead.

| Tool | Purpose |
|---|---|
| LangSmith | Trace every LangChain call — retrieval quality, latency, token usage, tool invocations |
| Railway built-in logs | App logs, crash reports, deploy history — no setup needed |
| `console.error` + structured logging | Server-side errors piped to Railway logs; add a proper logger (pino) later if needed |

> Sentry and Prometheus are worth adding in a later phase when you have real users. For now they add setup cost without return.


---

## Build Phases

### Phase 1 — Working Chat with Auth
- Next.js setup, NextAuth, Postgres, Prisma
- OpenRouter integration via Vercel AI SDK
- CA system prompt (no RAG yet)
- Session creation + history sidebar
- Streaming responses in UI

**Goal:** A working, deployed chatbot that answers tax questions from model knowledge alone.

### Phase 2 — RAG (Vector Knowledge)
- Ingest Income Tax Act + AY2025–26 slabs into pgvector
- Wire LangChain retrieval chain into the chat API route
- Test citation accuracy and hallucination reduction

**Goal:** Bot cites specific sections and retrieves accurate slab data.

### Phase 3 — Knowledge Graph
- Set up Neo4j AuraDB
- Build section relationship graph (manually + scripted from act text)
- Implement hybrid retrieval (vector + graph + rerank)

**Goal:** Accurate answers for multi-hop queries (e.g. "I have business income + salary + STCG — what ITR form and what deductions?")

### Phase 4 — Agent Tools
- Tax slab calculator tool
- ITR form selector tool
- Deduction optimizer tool
- TDS lookup tool

**Goal:** Bot can compute, not just retrieve.

### Phase 5 — File Upload
- Parse Form-16, 26AS, ITR-V PDFs (pdf-parse / LangChain PDF loader)
- Extract structured fields (TDS deducted, salary breakup, employer PAN)
- Feed extracted data into context for personalised advice

**Goal:** User uploads Form-16, bot gives a complete tax filing summary.

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://yourdomain.com

# AI
OPENROUTER_API_KEY=...
PRIMARY_MODEL=deepseek/deepseek-chat-v3-0324:free
FALLBACK_MODEL_1=meta-llama/llama-4-maverick:free
FALLBACK_MODEL_2=qwen/qwen3-235b-a22b:free
OPENAI_API_KEY=...        # for embeddings (text-embedding-3-small)
COHERE_API_KEY=...        # for reranking

# Knowledge graph
NEO4J_URI=neo4j+s://...
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...

# Observability
LANGCHAIN_API_KEY=...     # LangSmith
LANGCHAIN_TRACING_V2=true
```

---

## Key Architectural Decisions

| Decision | Choice | Reason |
|---|---|---|
| No Supabase | Neon / Railway Postgres + Prisma | Full control, no vendor lock-in |
| No Google OAuth | Email + password (NextAuth credentials) | Simpler auth, no OAuth app setup needed |
| No Sentry / Prometheus | LangSmith + Railway logs | Sufficient observability for this stage; add later with real users |
| No Vercel deployment | Railway / Fly.io | Long-running processes for ingestion, persistent DB plugins |
| pgvector over Pinecone | pgvector (same Postgres) | Simpler infra for MVP; swap later if needed |
| OpenRouter free tier | DeepSeek Chat v3 (primary) + Llama 4 Maverick + Qwen3-235B (fallbacks) | All free, all pass tool-calling tests; fallback chain handles rate limits |
| Neo4j for knowledge graph | Neo4j AuraDB | Native graph traversal for tax section relationships |
| LangChain.js | LangChain | Retrieval chains, tool calling, document loaders — all in one |
| Cohere Rerank | Reranker API | Improves retrieval precision significantly for domain-specific content |
