# Corpus Tax AI — Conversational AI Tax Accountant

Corpus is an AI-powered conversational tax accountant tailored specifically for the Indian taxation ecosystem (Income Tax Act, 1961, GST rules, and CBDT circulars). 

Rather than acting as a generic chatbot, Corpus is structured to function like a professional Chartered Accountant (CA) combined with a premium SaaS dashboard. It delivers citation-backed responses, interactive calculation grids, and programmatic verification to guarantee 100% mathematical accuracy.

---

##  System Architecture

Corpus uses a multi-layered architecture that guarantees mathematical accuracy, handles offline fallbacks gracefully, and merges unstructured tax documents with structured relational tax rules:

```mermaid
graph TD
    Client[Web Client] -->|User Message| Route[Next.js API Chat Route]
    
    subgraph "Online AI Flow"
        Route -->|1. Search Query| HybridSearch[Hybrid Graph-RAG Search]
        HybridSearch -->|Vector Query| SQLite[SQLite + Local BGE Embeddings]
        HybridSearch -->|Graph Entity Match| Neo4j[Neo4j Tax Knowledge Graph]
        SQLite -->|Vector Chunks| Merge[Merge & Deduplicate]
        Neo4j -->|Tax Relationships| Merge
        Merge -->|All Chunks| Cohere[Cohere Rerank API]
        Cohere -->|Top Reranked Context| CA_Prompt[Chartered Accountant System Prompt]
        CA_Prompt -->|Combined Context| LLM[LLM Generator]
        LLM -->|Raw MD Text| QualityGate[Mathematical Quality Gate]
        QualityGate -->|Verified & Corrected MD| ResponseStream[Response Stream]
    end

    subgraph "Offline Fallback Flow"
        Route -->|If LLM Offline| IntentEngine[Regex Intent Rule Engine]
        IntentEngine -->|Matches Intent| LocalTools[Local Tax Tools / Calculator]
        LocalTools -->|Raw Computation| ProgrammaticRep[Programmatic Report Generator]
        ProgrammaticRep -->|Deterministic Report| ResponseStream
    end

    ResponseStream --> Client
```

---

## Key Capabilities & Features

### 1. Multi-Regime Slab Calculator & Rules
All tax calculations are programmatically defined in [taxCalculator.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/taxCalculator.ts) and exposed via [taxTools.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/taxTools.ts). Features include:
* **Progressive Slabs**: Compares tax liabilities under both the Old Regime and New Regime for Assessment Years (AY) **2024-25** and **2025-26**.
* **House Property Calculations**: Detailed computation of Income from House Property, including Net Annual Value (NAV) deductions, Section 24(a) Standard Deduction (30%), Section 24(b) Home Loan Interest capping, and house property loss set-off rules (capped at ₹2 Lakhs in the Old Regime; disallowed entirely in the New Regime).
* **Chapter VI-A Deductions**: Section 80C (PPF, ELSS, EPF, principal repayments, etc. up to ₹1.5L) and Section 80D (health insurance for self/parents).
* **Capital Gains**: Computes listed equity Short-Term Capital Gains (STCG Section 111A) at 20% and Long-Term Capital Gains (LTCG Section 112A) at 12.5% above the ₹1.25L exemption threshold (post-July 2024 budget rules).
* **Section 87A Rebate**: Applies slab-based tax rebates (up to ₹12,500 for income $\le$ 5L in Old Regime; up to ₹25,000 for AY 2024-25 and ₹20,000 for AY 2025-26 in New Regime) including marginal relief.

### 2. Graph-RAG Pipeline
To ensure authoritative citation-backed answers, the system uses a hybrid retrieval pipeline in [vectorStore.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/vectorStore.ts):
* **Local Embeddings**: Generates query embeddings using a local Hugging Face model (`Xenova/bge-small-en-v1.5`) via `@huggingface/transformers` in [vectorStore.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/vectorStore.ts).
* **Tax Knowledge Graph**: Neo4j database linked in [neo4j.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/neo4j.ts) records inter-section relationships (e.g., `Section 80C` is allowed in `Old Regime` but disallowed in `New Regime`). If a database is not configured, it uses a local static fallback graph.
* **Graph-Expanded Retrieval**: Performs an initial vector search on chunks, extracts referenced tax sections, queries the knowledge graph to fetch related sections, retrieves those documents from the database, and merges the sets.
* **Cohere Rerank**: Reranks the merged list using Cohere's `rerank-english-v3.0` API before providing the context to the LLM.

### 3. Hallucination Quality Gate
Large Language Models (LLMs) often struggle with exact math. Corpus implements a quality control layer in [qualityGate.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/qualityGate.ts) that:
* Parses numbers inside generated LLM responses (markdown tables or text paragraphs).
* Cross-references them with the outputs of the deterministic `tax_slab_calculator` tool.
* Automatically corrects any numerical or logic discrepancies in the text before returning it to the user.

### 4. Deterministic Offline Fallback Mode
When LLM endpoints are unreachable, Corpus activates its offline parser in [ruleEngine.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/lib/ruleEngine.ts):
* Evaluates incoming queries against a local rule-engine to identify the taxpayer's intent (`TAX_CALCULATION`, `ITR_SELECTION`, `TDS_LOOKUP`, `DEDUCTION_LOOKUP`).
* Directly runs programmatic calculators.
* Outputs a compiled, professional **Offline Financial Report** in markdown format.

### 5. Form-16 & Document Parsing
Users can upload tax documents (Form-16, 26AS, or ITR acknowledgment PDFs) in the chat interface. The server handler at [src/app/api/upload/route.ts](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/src/app/api/upload/route.ts):
* Extracts PDF text using `pdf-parse`.
* Employs an LLM extraction routine (or a regex fallback parser) to pull salary, TDS, 80C, 80D, and interest figures.
* Chunks and saves the document contents as vectors linked to the current chat session for ongoing contextual reference.

---

## 🛠️ Technology Stack

* **Frontend & Backend**: [Next.js 16](https://nextjs.org) (App Router, Tailwind CSS, TypeScript, React 19).
* **Database & ORM**: SQLite via [Prisma](https://www.prisma.io) (defined in [schema.prisma](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/prisma/schema.prisma)).
* **Knowledge Graph**: [Neo4j](https://neo4j.com) database (with a static in-memory fallback helper).
* **AI & Embeddings**: Vercel AI SDK, local `@huggingface/transformers` (`bge-small-en-v1.5`), and Cohere Rerank API.
* **Authentication**: [NextAuth.js](https://next-auth.js.org) using custom Credentials Provider credentials.
* **Styling & UI Guidelines**: Set in [DESIGN.md](file:///c:/Users/Nitya/OneDrive/Desktop/AI%20accountant/DESIGN.md) for custom Teal/Brass themed components.

---

##  Repository Structure

```text
├── prisma/
│   ├── dev.db                  # SQLite database file
│   └── schema.prisma           # Prisma database schema definition
├── scripts/
│   ├── ingest.ts               # Seeds vector database chunks from JSON corpus
│   ├── ingest-graph.ts         # Seeding Neo4j with tax relationships
│   ├── test-retrieval.ts       # Script to verify Graph-RAG queries
│   └── test-tools.ts           # Script to run programmatic calculators
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/           # NextAuth router handlers
│   │   │   ├── chat/           # Chat message generator & streaming endpoint
│   │   │   ├── upload/         # Form-16 PDF parser and ingestion handler
│   │   │   └── sessions/       # Chat session controllers
│   │   ├── chat/
│   │   │   └── [id]/page.tsx   # Core Chat interface and interaction view
│   │   ├── globals.css         # Teal-based styles and components
│   │   └── page.tsx            # Main product landing page
│   ├── components/
│   │   ├── Sidebar.tsx         # Sidebar chat selection layout
│   │   └── Providers.tsx       # Auth context provider wrapper
│   └── lib/
│       ├── db.ts               # Prisma client database instance
│       ├── auth.ts             # Credentials authentication configuration
│       ├── neo4j.ts            # Graph query connectors and fallback mapping
│       ├── ruleEngine.ts       # Offline fallback parser and report generator
│       ├── taxCalculator.ts    # Mathematical calculations for Old/New regimes
│       ├── taxTools.ts         # Slabs, ITR forms, TDS, and deductions lookup tools
│       ├── qualityGate.ts      # LLM calculation validation and corrections
│       └── vectorStore.ts      # Hybrid retrieval, local BGE vector search, Cohere Rerank
```

---

## ⚙️ Local Configuration & Setup

### 1. Environment Variables
Create a `.env` or `.env.local` file in the root directory. Configure the following variables:

```bash
# SQLite Connection
DATABASE_URL="file:../prisma/dev.db"

# NextAuth Config
NEXTAUTH_SECRET="your-nextauth-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# AI Model Configuration (e.g., OpenRouter or OpenAI)
OPENROUTER_API_KEY="your-openrouter-key" # or mock-openrouter-key for offline fallback testing

# Neo4j Graph DB Config
NEO4J_URI="bolt://localhost:7687"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="your-neo4j-password" # Omit or set to "mock-neo4j-password" to use in-memory mock graph

# Cohere Reranking Config (Optional)
COHERE_API_KEY="your-cohere-key" # Omit or set to "mock-cohere-key" to skip reranking
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Database Initialization
Generate the Prisma Client and sync models with the SQLite database:
```bash
npx prisma generate
npx prisma db push
```

### 4. Seed Reference Materials
The system has two main seed operations:
1. **Tax Text Ingestion**: Loads the standard Indian tax corpus into the SQLite database and generates vector chunks.
2. **Tax Graph Ingestion**: Populates the Neo4j relationships.

Run these scripts using `npx tsx` or `npx ts-node`:
```bash
# Seed vector store (loads src/lib/data/tax_corpus.json)
npx tsx scripts/ingest.ts

# Seed Neo4j knowledge graph relationships
npx tsx scripts/ingest-graph.ts
```

### 5. Running the Development Server
Launch the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to see the application.

---

## 🧪 Testing and Verification

To verify that the tax calculators and Graph-RAG pipelines function correctly, run the provided utility scripts:

```bash
# Test programmatic tax slab and ITR calculations
npx tsx scripts/test-tools.ts

# Test vector search and graph-expanded retrieval logic
npx tsx scripts/test-retrieval.ts
```
