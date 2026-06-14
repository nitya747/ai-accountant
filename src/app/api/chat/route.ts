import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

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
    await prisma.message.create({
      data: {
        sessionId,
        role: "user",
        content: lastUserMessage.content,
      }
    });

    const apiKey = process.env.OPENROUTER_API_KEY;
    const isMockMode = !apiKey || apiKey === "mock-openrouter-key";

    if (isMockMode) {
      // Mock streaming mode to support local prototyping without API keys
      const mockResponseText = `Hello! I am your AI Chartered Accountant. Since we are running in mock mode, I am giving you a pre-configured response. 

To enable real AI responses, please replace \`mock-openrouter-key\` in your \`.env\` file with a valid OpenRouter API key.

Here are a few things you can ask me about:
1. Deductions under **Section 80C** (up to ₹1.5 Lakhs in PPF, ELSS, etc.) or **Section 80D** (health insurance premiums)
2. Comparison of the **Old vs New Tax Regime** (AY 2025-26 / FY 2024-25)
3. Determining the correct **ITR Form** (ITR-1 for salary/interest, ITR-4 for presumptive business, etc.)

*Please consult a licensed CA for final filings.*`;

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const words = mockResponseText.split(" ");
          for (const word of words) {
            const chunk = `0:${JSON.stringify(word + " ")}\n`;
            controller.enqueue(encoder.encode(chunk));
            await new Promise((resolve) => setTimeout(resolve, 50)); // typing effect
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
      content: m.content
    }));

    const result = await streamText({
      model: openrouterClient(modelName),
      system: CA_SYSTEM_PROMPT,
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
