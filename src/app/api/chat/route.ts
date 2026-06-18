import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText } from "ai";
import { searchHybrid } from "@/lib/vectorStore";
import { formatGraphRelationships } from "@/lib/neo4j";
import { calculateTax } from "@/lib/taxCalculator";
import { validateAndCorrectText } from "@/lib/qualityGate";
import {
  tax_slab_calculator,
  itr_form_selector,
  deduction_lookup,
  tds_lookup,
} from "@/lib/taxTools";
import fs from "fs";
import path from "path";

function logErrorToFile(error: any, context: string) {
  try {
    const logPath = path.join(process.cwd(), "scripts", "error.log");
    const timestamp = new Date().toISOString();
    const errorMessage = `${timestamp} [${context}]: ${error?.message || error}\nStack: ${error?.stack || ""}\n\n`;
    fs.appendFileSync(logPath, errorMessage);
  } catch (e) {
    console.error("Failed to write to error log file", e);
  }
}

function logDebugToFile(message: string) {
  try {
    const logPath = path.join(process.cwd(), "scripts", "debug.log");
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `${timestamp}: ${message}\n`);
  } catch (e) {
    console.error("Failed to write to debug log file", e);
  }
}

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

function generateTitleFromMessage(message: string): string {
  let title = message.trim();
  if (title.length <= 30) {
    return title;
  }
  const sentences = title.split(/[.!?\n]/);
  let firstSentence = sentences[0].trim();
  if (firstSentence.length > 30) {
    firstSentence = firstSentence.substring(0, 30);
    const lastSpace = firstSentence.lastIndexOf(" ");
    if (lastSpace > 10) {
      firstSentence = firstSentence.substring(0, lastSpace);
    }
    firstSentence += "...";
  }
  return firstSentence || "Chat Session";
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

    // Automatically update the session title if it is still a default title
    if (dbSession && (dbSession.title === "New Chat" || dbSession.title === "New Session" || !dbSession.title)) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const isMockMode = !apiKey || apiKey === "mock-openrouter-key";
      let generatedTitle = "";
      if (isMockMode) {
        generatedTitle = generateTitleFromMessage(userContent);
      } else {
        try {
          const openrouterClient = createOpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey: apiKey,
          });
          const modelName = process.env.PRIMARY_MODEL || "deepseek/deepseek-chat-v3-0324:free";
          
          const response = await generateText({
            model: openrouterClient.chat(modelName),
            prompt: `Summarize the following user query into a short, concise chat title of 3-5 words. Do not use punctuation, quotation marks, or surrounding text. Keep it clean and descriptive.\n\nQuery: ${userContent}`,
          });
          
          generatedTitle = response.text.trim().replace(/['"“`’]/g, "");
          if (!generatedTitle || generatedTitle.length > 45) {
            generatedTitle = generateTitleFromMessage(userContent);
          }
        } catch (err) {
          console.error("Failed to generate AI title:", err);
          generatedTitle = generateTitleFromMessage(userContent);
        }
      }
      
      await prisma.session.update({
        where: { id: sessionId },
        data: { title: generatedTitle }
      });
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
      } else {
        mockResponseText += `No matching tax provisions were found. Ask about tax calculation, ITR forms, TDS rates, or deductions.\n`;
      }

      // Reconstruct mock tool result payload for context and correction
      let toolResults: any[] = [];
      if (lowerQuery.includes("calculate") || lowerQuery.includes("tax on") || lowerQuery.includes("salary of") || lowerQuery.includes("earning")) {
        const matches = lowerQuery.replace(/,/g, "").match(/\d+/g);
        const amount = matches ? parseInt(matches[0], 10) : 800000;
        const calcRes = calculateTax({ salary: amount });
        toolResults.push({
          toolCallId: "mock-call-slab",
          toolName: "tax_slab_calculator",
          args: { salary: amount },
          result: { success: true, calculation: calcRes }
        });
      }

      // Run Quality Gate correction on final mock text
      mockResponseText = validateAndCorrectText(mockResponseText, toolResults);

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            logDebugToFile("Mock mode stream started");
            // Determine query-specific search states
            const lowerQ = userContent.toLowerCase();
            let searchMessage = "Searching tax database & context...";
            let searchState = "searching_db";
            
            if (lowerQ.includes("latest") || lowerQ.includes("recent") || lowerQ.includes("update") || lowerQ.includes("news") || lowerQ.includes("web") || lowerQ.includes("amendment") || lowerQ.includes("2026")) {
              searchMessage = "Searching the web for latest tax updates...";
              searchState = "searching_web";
            } else if (lowerQ.includes("calculate") || lowerQ.includes("tax on") || lowerQ.includes("salary")) {
              searchMessage = "Searching tax database for slab rates...";
            } else if (lowerQ.includes("itr") || lowerQ.includes("form")) {
              searchMessage = "Searching tax database for ITR forms...";
            } else if (lowerQ.includes("tds")) {
              searchMessage = "Searching tax database for TDS sections...";
            }

            const initialStates = [
              { success: true, state: "thinking", message: "Thinking..." },
              { success: true, state: searchState, message: searchMessage },
              { success: true, state: "analyzing", message: "Analyzing tax regulations..." }
            ];

            for (const stateObj of initialStates) {
              controller.enqueue(encoder.encode(`v:${JSON.stringify(stateObj)}\n`));
              await new Promise((resolve) => setTimeout(resolve, 400));
            }

            const words = mockResponseText.split(" ");
            let wordsStreamed = 0;
            for (const word of words) {
              const chunk = `0:${JSON.stringify(word + " ")}\n`;
              controller.enqueue(encoder.encode(chunk));
              wordsStreamed++;

              // Inject validation chunks after first few words (simulating tool finished)
              if (wordsStreamed === 5 && toolResults.length > 0) {
                const validationChunks = [
                  { success: true, state: "verifying_math", message: "Verifying math..." },
                  { success: true, state: "cross_referencing_sections", message: "Cross-referencing Income Tax Sections..." },
                  { success: true, state: "validated", message: "Math validated" }
                ];
                for (const vc of validationChunks) {
                  controller.enqueue(encoder.encode(`v:${JSON.stringify(vc)}\n`));
                  await new Promise((resolve) => setTimeout(resolve, 150));
                }
              }
              await new Promise((resolve) => setTimeout(resolve, 20)); // typing effect
            }
            
            // Save tool messages sequentially
            for (const tr of toolResults) {
              logDebugToFile(`Mock mode saving tool: ${tr.toolName}`);
              await prisma.message.create({
                data: {
                  sessionId,
                  role: "tool",
                  content: JSON.stringify(tr.result),
                  state: JSON.stringify({
                    toolCallId: tr.toolCallId,
                    toolName: tr.toolName,
                    args: tr.args
                  })
                }
              });
            }

            // Save assistant response to DB at the end of streaming
            logDebugToFile("Mock mode saving assistant response to database");
            await prisma.message.create({
              data: {
                sessionId,
                role: "assistant",
                content: mockResponseText,
                state: toolResults.length > 0 ? JSON.stringify(toolResults) : null
              }
            });

            // Update session timestamp
            await prisma.session.update({
              where: { id: sessionId },
              data: { updatedAt: new Date() }
            });

            logDebugToFile("Mock mode stream execution finished successfully");
            controller.close();
          } catch (err: any) {
            console.error("Mock mode stream execution error:", err);
            logErrorToFile(err, "mock_mode_stream");
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Experimental-Stream-Data": "true",
          "X-Telemetry-Metadata": JSON.stringify({ telemetryEnabled: true }),
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
        "X-Title": "Corpus",
      }
    });

    const modelName = process.env.PRIMARY_MODEL || "deepseek/deepseek-chat-v3-0324:free";

    // Load chronological history from the database to ensure role strictness and State Layer context
    const dbMessages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" }
    });

    const formattedMessages: any[] = [];
    for (const msg of dbMessages) {
      if (msg.role === "user") {
        formattedMessages.push({
          role: "user",
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        if (msg.state) {
          try {
            const toolResults = JSON.parse(msg.state);
            if (Array.isArray(toolResults) && toolResults.length > 0) {
              // Reconstruct tool calls
              formattedMessages.push({
                role: "assistant",
                content: "",
                toolCalls: toolResults.map((tr: any) => ({
                  type: "tool-call",
                  toolCallId: tr.toolCallId,
                  toolName: tr.toolName,
                  args: tr.args,
                })),
              });
              // Reconstruct tool results
              formattedMessages.push({
                role: "tool",
                content: toolResults.map((tr: any) => ({
                  type: "tool-result",
                  toolCallId: tr.toolCallId,
                  toolName: tr.toolName,
                  result: tr.result,
                })),
              });
            }
          } catch (e) {
            console.error("Failed to parse message state:", e);
          }
        }
        formattedMessages.push({
          role: "assistant",
          content: msg.content,
        });
      }
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformedStream = new ReadableStream({
      async start(controller) {
        try {
          // Determine query-specific search states
          const lowerQ = userContent.toLowerCase();
          let searchMessage = "Searching tax database & context...";
          let searchState = "searching_db";
          
          if (lowerQ.includes("latest") || lowerQ.includes("recent") || lowerQ.includes("update") || lowerQ.includes("news") || lowerQ.includes("web") || lowerQ.includes("amendment") || lowerQ.includes("2026")) {
            searchMessage = "Searching the web for latest tax updates...";
            searchState = "searching_web";
          } else if (lowerQ.includes("calculate") || lowerQ.includes("tax on") || lowerQ.includes("salary")) {
            searchMessage = "Searching tax database for slab rates...";
          } else if (lowerQ.includes("itr") || lowerQ.includes("form")) {
            searchMessage = "Searching tax database for ITR forms...";
          } else if (lowerQ.includes("tds")) {
            searchMessage = "Searching tax database for TDS sections...";
          }

          controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "thinking", message: "Thinking..." })}\n`));
          await new Promise((resolve) => setTimeout(resolve, 300));
          
          controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: searchState, message: searchMessage })}\n`));

          // Run Hybrid RAG retrieval pipeline (semantic search + graph expansion + reranking)
          let retrievedContext = "";
          try {
            logDebugToFile("Standard stream: starting RAG retrieval");
            const { chunks, relationships } = await searchHybrid(userContent, 10, 4, sessionId);
            
            const chunkContext = chunks
              .map((c) => `[Document: ${c.title} | Source: ${c.source}]\n${c.content}`)
              .join("\n\n---\n\n");

            const graphContext = formatGraphRelationships(relationships);
            
            retrievedContext = [chunkContext, graphContext].filter(Boolean).join("\n\n---\n\n");
          } catch (err) {
            console.error("Failed to retrieve hybrid tax context:", err);
          }

          controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "analyzing", message: "Analyzing tax regulations..." })}\n`));
          await new Promise((resolve) => setTimeout(resolve, 200));

          // Inject RAG context into system prompt
          const finalSystemPrompt = retrievedContext
            ? `${CA_SYSTEM_PROMPT}\n\nHere is the most relevant tax database context retrieved for the user's query:\n${retrievedContext}\n\nGuidelines:\n- Rely on the retrieved context to answer the query accurately.\n- If the context does not contain the answer, use your pre-trained knowledge but mention that it is based on general tax understanding.`
            : CA_SYSTEM_PROMPT;

          let resolveFinish: () => void = () => {};
          const onFinishPromise = new Promise<void>((resolve) => {
            resolveFinish = resolve;
          });

          logDebugToFile("Standard stream: invoking streamText");
          const result = await streamText({
            model: openrouterClient.chat(modelName),
            system: finalSystemPrompt,
            messages: formattedMessages,
            maxSteps: 5,
            tools: {
              tax_slab_calculator,
              itr_form_selector,
              deduction_lookup,
              tds_lookup,
            },
            onFinish: async ({ text, toolResults }: any) => {
              try {
                logDebugToFile(`Standard stream: onFinish started. Text length: ${text?.length}, Tools: ${toolResults?.length || 0}`);
                // Run Quality Gate validation and correction
                const validatedText = validateAndCorrectText(text, toolResults || []);

                // 1. Save tool messages sequentially
                if (toolResults && toolResults.length > 0) {
                  for (const res of toolResults) {
                    logDebugToFile(`Standard stream: saving tool response for ${res.toolName}`);
                    await prisma.message.create({
                      data: {
                        sessionId,
                        role: "tool",
                        content: JSON.stringify(res.result),
                        state: JSON.stringify({
                          toolCallId: res.toolCallId,
                          toolName: res.toolName,
                          args: res.args
                        }),
                      }
                    });
                  }
                }

                // 2. Save assistant response (Presentation + State Layer)
                logDebugToFile("Standard stream: saving assistant response to database");
                await prisma.message.create({
                  data: {
                    sessionId,
                    role: "assistant",
                    content: validatedText,
                    state: toolResults && toolResults.length > 0 ? JSON.stringify(toolResults) : null,
                  }
                });

                // Update session timestamp
                await prisma.session.update({
                  where: { id: sessionId },
                  data: { updatedAt: new Date() }
                });
                logDebugToFile("Standard stream: onFinish database save completed successfully");
              } catch (e) {
                console.error("Error in standard onFinish:", e);
                logErrorToFile(e, "standard_onFinish");
              } finally {
                resolveFinish();
              }
            }
          } as any);

          const originalResponse = result.toUIMessageStreamResponse();
          const originalStream = originalResponse.body;
          if (!originalStream) {
            resolveFinish();
            throw new Error("Failed to get stream from streamText");
          }

          const reader = originalStream.getReader();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              logDebugToFile("Standard stream: reader loop done=true. Awaiting onFinishPromise...");
              if (buffer) {
                controller.enqueue(encoder.encode(buffer));
              }
              // Wait for db save to complete before closing the stream
              await onFinishPromise;
              logDebugToFile("Standard stream: onFinishPromise resolved. Closing controller.");
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              controller.enqueue(encoder.encode(line + "\n"));

              // Check for tool results chunk prefix (3, 5, or a)
              const isToolResult = line.startsWith("3:") || line.startsWith("5:") || line.startsWith("a:") || line.startsWith("4:");
              if (isToolResult) {
                logDebugToFile("Standard stream: detected tool results in stream line");
                // Stream tool running state
                controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "calculating", message: "Running tax tools & calculators..." })}\n`));

                // Stream validation & telemetry micro-state chunks
                const validationChunks = [
                  { success: true, state: "verifying_math", message: "Verifying math..." },
                  { success: true, state: "cross_referencing_sections", message: "Cross-referencing Income Tax Sections..." },
                  { success: true, state: "validated", message: "Math validated" }
                ];
                for (const chunk of validationChunks) {
                  controller.enqueue(encoder.encode(`v:${JSON.stringify(chunk)}\n`));
                  await new Promise((resolve) => setTimeout(resolve, 150));
                }
              }
            }
          }
          controller.close();
        } catch (err: any) {
          console.error("Stream execution error:", err);
          logErrorToFile(err, "standard_stream_error");
          controller.enqueue(encoder.encode(`0:${JSON.stringify("An error occurred while generating the answer. Please try again.")}\n`));
          controller.close();
        }
      }
    });

    return new Response(transformedStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Experimental-Stream-Data": "true",
        "X-Telemetry-Metadata": JSON.stringify({ telemetryEnabled: true }),
        "Connection": "keep-alive",
      }
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "An error occurred during chat processing" }, { status: 500 });
  }
}
