import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { searchSimilarity, rerankChunks } from "@/lib/vectorStore";

const CA_SYSTEM_PROMPT = `You are a knowledgeable and professional Indian Chartered Accountant (CA).
Your expertise covers:
1. Income Tax Act, 1961 (especially Section 80C, 80D, Section 24(b) house property, HRA, standard deductions, capital gains, presumptive taxation Section 44AD/44ADA).
2. Financial Year (FY) and Assessment Year (AY) distinction. Always assume AY 2025-26 (FY 2024-25) as the default unless the user specifies otherwise.
3. Comparative analysis between the Old Tax Regime and the New Tax Regime.
4. GST (Goods and Services Tax) rules and rates.
5. CBDT circulars and guidelines.

Guidelines:
- Always cite specific sections of the Income Tax Act or GST rules when explaining provisions.
- Provide clear step-by-step calculations where applicable.
- Remind users that while you provide accurate tax guidance, they should consult a licensed CA for final filings.
- Respond in professional, clean English (or Hinglish if the user asks in Hinglish).`;

function getMessageContent(m: any): string {
  if (typeof m.content === "string" && m.content) return m.content;
  if (Array.isArray(m.parts)) {
    return m.parts
      .map((part: any) => (part.type === "text" ? part.text : ""))
      .join("");
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { messages, sessionId } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Verify session ownership
    const userId = (session.user as any).id;
    const dbSession = await prisma.session.findFirst({
      where: { id: sessionId, userId }
    });

    if (!dbSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Save the user's latest message to the database
    const lastUserMessage = messages[messages.length - 1];
    const userContent = getMessageContent(lastUserMessage);

    await prisma.message.create({
      data: {
        sessionId,
        role: "user",
        content: userContent,
      }
    });

    // Run RAG retrieval pipeline (vector search with keyword fallback)
    let retrievedContext = "";
    try {
      const rawChunks = await searchSimilarity(userContent, 5);
      const reranked = await rerankChunks(userContent, rawChunks, 3);
      if (reranked.length > 0) {
        retrievedContext = reranked
          .map((c) => `[Document: ${c.title} | Source: ${c.source}]\n${c.content}`)
          .join("\n\n---\n\n");
      }
    } catch (err) {
      console.error("Failed to retrieve tax context:", err);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const isMockMode = !apiKey || apiKey === "mock-openrouter-key";

    if (isMockMode) {
      // Mock streaming mode to support local prototyping without API keys
      let mockResponseText = `Hello! I am your AI Chartered Accountant. (RAG Active: Running in Mock Mode)\n\n`;
      
      if (retrievedContext) {
        mockResponseText += `Based on your query, I retrieved the following relevant tax provisions from the database:\n\n---\n\n${retrievedContext}\n\n---\n\n`;
        mockResponseText += `*(Note: Under a live OpenRouter/OpenAI API configuration, the model would synthesize these sections into a direct answer.)*`;
      } else {
        mockResponseText += `No matching tax provisions were found in the local database for your query: "${userContent}".\n\n`;
      }

      mockResponseText += `\n\n*Please replace \`mock-openrouter-key\` in your \`.env\` file with a valid credentials to enable real AI generation.*`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const words = mockResponseText.split(" ");
          for (const word of words) {
            const chunk = `0:${JSON.stringify(word + " ")}\n`;
            controller.enqueue(encoder.encode(chunk));
            await new Promise((resolve) => setTimeout(resolve, 20)); // typing effect
          }
          
          // Save assistant response to DB at the end of streaming
          await prisma.message.create({
            data: {
              sessionId,
              role: "assistant",
              content: mockResponseText,
            }
          });

          // Update session timestamp
          await prisma.session.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() }
          });

          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Experimental-Stream-Data": "true",
          "Connection": "keep-alive",
        }
      });
    }

    // Real API mode using OpenRouter + Vercel AI SDK
    const openrouterClient = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: apiKey,
      headers: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "AI Accountant",
      }
    });

    const modelName = process.env.PRIMARY_MODEL || "deepseek/deepseek-chat-v3-0324:free";

    // Format messages for Vercel AI SDK (it expects role and content fields)
    const formattedMessages = messages.map((m: any) => ({
      role: m.role,
      content: getMessageContent(m)
    }));

    // Inject RAG context into system prompt
    const finalSystemPrompt = retrievedContext
      ? `${CA_SYSTEM_PROMPT}\n\nHere is the most relevant tax database context retrieved for the user's query:\n${retrievedContext}\n\nGuidelines:\n- Rely on the retrieved context to answer the query accurately.\n- If the context does not contain the answer, use your pre-trained knowledge but mention that it is based on general tax understanding.`
      : CA_SYSTEM_PROMPT;

    const result = await streamText({
      model: openrouterClient(modelName),
      system: finalSystemPrompt,
      messages: formattedMessages,
      onFinish: async ({ text }) => {
        // Save assistant response to DB
        await prisma.message.create({
          data: {
            sessionId,
            role: "assistant",
            content: text,
          }
        });

        // Update session timestamp
        await prisma.session.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() }
        });
      }
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "An error occurred during chat processing" }, { status: 500 });
  }
}
