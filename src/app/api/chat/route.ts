import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { searchHybrid } from "@/lib/vectorStore";
import { formatGraphRelationships } from "@/lib/neo4j";
import { calculateTax } from "@/lib/taxCalculator";
import {
  tax_slab_calculator,
  itr_form_selector,
  deduction_lookup,
  tds_lookup,
} from "@/lib/taxTools";

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

    // Run Hybrid RAG retrieval pipeline (semantic search + graph expansion + reranking)
    let retrievedContext = "";
    try {
      const { chunks, relationships } = await searchHybrid(userContent, 10, 4, sessionId);
      
      const chunkContext = chunks
        .map((c) => `[Document: ${c.title} | Source: ${c.source}]\n${c.content}`)
        .join("\n\n---\n\n");

      const graphContext = formatGraphRelationships(relationships);
      
      retrievedContext = [chunkContext, graphContext].filter(Boolean).join("\n\n---\n\n");
    } catch (err) {
      console.error("Failed to retrieve hybrid tax context:", err);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    const isMockMode = !apiKey || apiKey === "mock-openrouter-key";

    if (isMockMode) {
      // Mock streaming mode to support local prototyping without API keys
      let mockResponseText = `Hello! I am your AI Chartered Accountant. (Running in Mock Mode)\n\n`;
      
      const lowerQuery = userContent.toLowerCase();
      if (lowerQuery.includes("calculate") || lowerQuery.includes("tax on") || lowerQuery.includes("salary of") || lowerQuery.includes("earning")) {
        // Extract a number from the query
        const matches = lowerQuery.replace(/,/g, "").match(/\d+/g);
        const amount = matches ? parseInt(matches[0], 10) : 800000; // default to 8 Lakhs
        const calcRes = calculateTax({ salary: amount });
        
        mockResponseText += `### Programmatic Tax Calculation (Mock Mode)\n`;
        mockResponseText += `For a salary of **₹${amount.toLocaleString("en-IN")}** (AY 2025-26):\n\n`;
        mockResponseText += `| Item | Old Regime | New Regime |\n`;
        mockResponseText += `| :--- | :--- | :--- |\n`;
        mockResponseText += `| **Gross Salary** | ₹${amount.toLocaleString("en-IN")} | ₹${amount.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Standard Deduction** | ₹${calcRes.oldRegime.salaryStandardDeduction.toLocaleString("en-IN")} | ₹${calcRes.newRegime.salaryStandardDeduction.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Taxable Income** | ₹${calcRes.oldRegime.taxableIncome.toLocaleString("en-IN")} | ₹${calcRes.newRegime.taxableIncome.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Slab Tax** | ₹${calcRes.oldRegime.slabTax.toLocaleString("en-IN")} | ₹${calcRes.newRegime.slabTax.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Rebate (Sec 87A)** | ₹${calcRes.oldRegime.rebate87A.toLocaleString("en-IN")} | ₹${calcRes.newRegime.rebate87A.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Health & Education Cess (4%)** | ₹${calcRes.oldRegime.cess.toLocaleString("en-IN")} | ₹${calcRes.newRegime.cess.toLocaleString("en-IN")} |\n`;
        mockResponseText += `| **Net Tax Liability** | **₹${calcRes.oldRegime.netTax.toLocaleString("en-IN")}** | **₹${calcRes.newRegime.netTax.toLocaleString("en-IN")}** |\n\n`;
        mockResponseText += `**Recommendation:** The **${calcRes.optimalRegime} Regime** is better for you. `;
        if (calcRes.taxSavings > 0) {
          mockResponseText += `You will save **₹${calcRes.taxSavings.toLocaleString("en-IN")}**.\n`;
        } else {
          mockResponseText += `Both regimes result in the same tax liability.\n`;
        }
      } else if (lowerQuery.includes("itr") || lowerQuery.includes("form") || lowerQuery.includes("return")) {
        const hasSalary = lowerQuery.includes("salary") || lowerQuery.includes("job") || lowerQuery.includes("salaried");
        const hasCapitalGains = lowerQuery.includes("capital") || lowerQuery.includes("gain") || lowerQuery.includes("share") || lowerQuery.includes("stock");
        const hasPresumptive = lowerQuery.includes("presumptive") || lowerQuery.includes("freelance") || lowerQuery.includes("44ad");
        const hasRegularBusiness = lowerQuery.includes("business") && !hasPresumptive;

        const itrRes = (await itr_form_selector.execute!(
          {
            hasSalary,
            hasCapitalGains,
            hasPresumptiveBusiness: hasPresumptive,
            hasPresumptiveProfessional: hasPresumptive,
            hasRegularBusinessOrProfessional: hasRegularBusiness,
          },
          { toolCallId: "mock", messages: [] }
        )) as any;

        mockResponseText += `### ITR Form Selection (Mock Mode)\n`;
        mockResponseText += `Based on your profile, you should file **${itrRes.selectedForm}**.\n\n`;
        mockResponseText += `**Reasons:**\n`;
        itrRes.reasons.forEach((r: string) => {
          mockResponseText += `- ${r}\n`;
        });
      } else if (lowerQuery.includes("tds") || lowerQuery.includes("tax deducted")) {
        let lookupType = "rent";
        if (lowerQuery.includes("salary")) lookupType = "salary";
        else if (lowerQuery.includes("contractor") || lowerQuery.includes("194c")) lookupType = "contractor";
        else if (lowerQuery.includes("professional") || lowerQuery.includes("194j")) lookupType = "professional";
        else if (lowerQuery.includes("life insurance") || lowerQuery.includes("194da")) lookupType = "life insurance";
        else if (lowerQuery.includes("interest") || lowerQuery.includes("194a")) lookupType = "interest";

        const tdsRes = (await tds_lookup.execute!(
          { sectionOrType: lookupType },
          { toolCallId: "mock", messages: [] }
        )) as any;
        mockResponseText += `### TDS Rates & Thresholds (Mock Mode)\n\n`;
        tdsRes.results.forEach((item: any) => {
          mockResponseText += `- **${item.section}** (${item.type}): **${item.rate}** | Threshold: **${item.threshold}**\n  *Notes:* ${item.notes}\n\n`;
        });
      } else if (lowerQuery.includes("deduction") || lowerQuery.includes("80c") || lowerQuery.includes("80d") || lowerQuery.includes("saving")) {
        let profile: "salaried" | "senior_citizen" | "business_owner" | "professional" | "general" = "salaried";
        if (lowerQuery.includes("senior") || lowerQuery.includes("citizen") || lowerQuery.includes("age")) profile = "senior_citizen";
        else if (lowerQuery.includes("business") || lowerQuery.includes("owner")) profile = "business_owner";
        else if (lowerQuery.includes("professional") || lowerQuery.includes("consultant")) profile = "professional";

        const dedRes = (await deduction_lookup.execute!(
          { profile },
          { toolCallId: "mock", messages: [] }
        )) as any;
        mockResponseText += `### Tax Deductions & Exemptions for ${profile.replace("_", " ")} (Mock Mode)\n\n`;
        mockResponseText += `| Section | Old Regime | New Regime | Description |\n`;
        mockResponseText += `| :--- | :--- | :--- | :--- |\n`;
        dedRes.deductions.forEach((d: any) => {
          mockResponseText += `| **${d.section}** | ${d.oldRegime} | ${d.newRegime} | ${d.description} |\n`;
        });
      } else if (retrievedContext) {
        mockResponseText += `Based on your query, here are the relevant tax provisions retrieved:\n\n---\n\n${retrievedContext}\n\n---\n\n`;
      } else {
        mockResponseText += `No matching tax provisions were found. Ask about tax calculation, ITR forms, TDS rates, or deductions.\n`;
      }

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
      maxSteps: 5,
      tools: {
        tax_slab_calculator,
        itr_form_selector,
        deduction_lookup,
        tds_lookup,
      },
      onFinish: async ({ text }: { text: string }) => {
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
    } as any);

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "An error occurred during chat processing" }, { status: 500 });
  }
}
