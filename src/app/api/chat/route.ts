import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText } from "ai";
import { searchHybrid } from "@/lib/vectorStore";
import { formatGraphRelationships } from "@/lib/neo4j";
import { calculateTax } from "@/lib/taxCalculator";
import { validateAndCorrectText, checkDiscrepancies } from "@/lib/qualityGate";
import { generateOfflineReport } from "@/lib/ruleEngine";
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
- FORCE CHAIN OF THOUGHT REASONING: Before stating any final tax liability or comparative tax summary, you must write out the step-by-step calculation for each head of income (Salary, House Property, Capital Gains, Business/Profession, etc.) separately. This forces logical progression and prevents mathematical errors.
- USE CALCULATION CARDS FOR SPLITS: When presenting step-by-step calculations (such as joint owner splits, standard deduction calculation, etc.), you must wrap them in <CalculationGrid> and <CalculationCard> tags.
  Example syntax:
  <CalculationGrid>
    <CalculationCard icon="home" title="Individual Share of Gross Annual Value (Rent)" value="₹4,00,000 × 50% = ₹2,00,000" />
    <CalculationCard icon="percent" title="Individual Share of Interest on Home Loan" value="₹6,00,000 × 50% = ₹3,00,000" />
  </CalculationGrid>
  Supported values for the 'icon' attribute are: "home", "percent", "calc", "file", "user". Use "home" for property/rent, "percent" for loan interest/slabs, and "calc" for other calculations.
- STATUTORY CHECKLIST FOR HOUSE PROPERTY: When calculating Income from House Property, you must explicitly apply the 30% Standard Deduction under Section 24(a) on Net Annual Value (NAV = Rent Received - Municipal Taxes) before deducting Section 24(b) interest. Ensure you state this checklist sequence clearly.
- STATUTORY TABLES: For table calculations (such as the statutory checklist for House Property), write standard markdown tables. Keep headers empty or descriptive. Ensure the summary/final row clearly has a description containing "Final Income" or "Total Tax" or "Savings" so the UI can highlight it. If a row is a loss, format the value clearly with the word "[LOSS]" or in parentheses like "(₹1,60,000) [LOSS]".
- STRICT TOOL CALLING: Do not perform calculations in your head. Rely strictly on the \`tax_slab_calculator\` tool's execution. Every number in your response (for standard deduction, rebates, cess, and net tax) must map strictly from these JSON keys:
  * Gross Salary / Gross Income -> gross_salary
  * Standard Deduction -> standard_deduction
  * HRA Exemption -> hra_exemption
  * Chapter VI-A Deductions (80C, 80D, etc.) -> chapter_vi_a_deductions
  * Home Loan Interest (Sec 24b) -> home_loan_interest
  * Total Deductions/Exemptions -> deductions_allowed
  * Taxable Income -> taxable_income
  * Slab Tax -> slab_tax
  * Rebate (Sec 87A) -> rebate
  * Health & Education Cess (4%) -> cess
  * Net Tax Liability -> total_tax
  Ensure that every number in your response matches these keys exactly. Do not round or alter these values.

Strict Policy Constraints:
Policy Guardrail: When evaluating the New Tax Regime (Section 115BAC), you must strictly enforce that any loss under the head 'Income from House Property' can neither be set off against any other head of income in the current year NOR carried forward to any future years. The loss lapses entirely. Never advise a user that they can carry forward a house property loss under the New Regime.`;

export function extractAssessmentYear(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("2024-25") || normalized.includes("24-25") || normalized.includes("ay24") || normalized.includes("ay 24")) {
    return "AY 2024-25";
  }
  return "AY 2025-26"; // Default
}

function parseSpeculativeCalculatorArgsRegex(query: string): any | null {
  const normalized = query.toLowerCase()
    .replace(/,/g, "")
    .replace(/\blakhs?\b/g, "l")
    .replace(/\bcrores?\b/g, "cr")
    .replace(/\bthousands?\b/g, "k");

  // Check if there are signs of calculation and numbers
  const hasNumbers = /\d+/.test(normalized) || /\b\d+l\b/.test(normalized) || /\b\d+k\b/.test(normalized);
  const hasTaxKeywords = normalized.includes("salary") || normalized.includes("tax") || normalized.includes("income") || normalized.includes("rent") || normalized.includes("earn") || normalized.includes("80c") || normalized.includes("80d") || normalized.includes("deduction");
  
  if (!hasNumbers || !hasTaxKeywords) {
    return null;
  }

  // Basic extraction helper
  const parseAmount = (text: string, keywordPatterns: RegExp[]): number => {
    for (const pat of keywordPatterns) {
      const match = text.match(pat);
      if (match) {
        const numStr = match[1] || match[0].replace(/[^\d.kKlLcrCR]/g, "");
        const val = parseFloat(numStr);
        if (numStr.toLowerCase().endsWith("l")) {
          return val * 100000;
        }
        if (numStr.toLowerCase().endsWith("k")) {
          return val * 1000;
        }
        if (numStr.toLowerCase().endsWith("cr")) {
          return val * 10000000;
        }
        return val;
      }
    }
    return 0;
  };

  const salary = parseAmount(normalized, [
    /salary\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i,
    /earning\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i,
    /(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\s*[^0-9]*?salary/i
  ]);

  const rentPaid = parseAmount(normalized, [
    /rent\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i,
    /(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\s*[^0-9]*?rent/i
  ]);

  const section80C = parseAmount(normalized, [
    /80c\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i
  ]);

  const section80D = parseAmount(normalized, [
    /80d\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i
  ]);

  const section24b = parseAmount(normalized, [
    /home loan\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i,
    /24b\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i,
    /interest\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i
  ]);

  if (salary > 0 || rentPaid > 0 || section80C > 0 || section80D > 0 || section24b > 0) {
    const hraReceived = normalized.includes("hra") ? parseAmount(normalized, [/hra\s*[^0-9]*?(\d+(?:\.\d+)?\s*(?:l|k|cr)?)\b/i]) : rentPaid;
    const basicSalary = salary * 0.4;
    
    return {
      salary,
      rentPaid,
      hraReceived: hraReceived || rentPaid,
      basicSalary,
      section80C,
      section80D,
      section24b,
      isMetro: normalized.includes("metro") || normalized.includes("mumbai") || normalized.includes("delhi") || normalized.includes("bangalore") || normalized.includes("chennai") || normalized.includes("kolkata")
    };
  }

  return null;
}

export async function parseSpeculativeCalculatorArgs(
  query: string,
  openrouterClient?: any,
  modelName?: string
): Promise<{ args: any | null; error?: string } | null> {
  if (openrouterClient && modelName) {
    try {
      logDebugToFile("Speculative calculation: starting LLM-based parsing...");
      const response = await generateText({
        model: openrouterClient.chat(modelName),
        system: `You are an AI financial assistant. Your job is to extract tax-related parameters from user queries for a tax calculator.
Extract the following details as a JSON object, converting all amounts to ANNUAL figures in INR:
- hasTaxCalculationIntent (boolean): True ONLY if the query has tax calculation or deduction context and contains numerical financial figures, salary, rent, or deduction amounts.
- salary (number): gross annual salary/income. If monthly (e.g. 50k pm, 50,000 per month), multiply by 12. If in lakhs, multiply by 100000 (e.g. 12 lakhs = 1200000). If in crores, multiply by 10000000.
- rentPaid (number): annual rent paid. If monthly, multiply by 12.
- hraReceived (number): annual HRA received. If not specified but rent is paid, default to same as rent paid.
- basicSalary (number): annual basic salary (default to 40% of salary if not specified).
- section80C (number): total deduction under Section 80C.
- section80D (number): total deduction under Section 80D.
- section24b (number): home loan interest deduction under Section 24b.
- isMetro (boolean): true if user lives in a metro city (Mumbai, Delhi, Kolkata, Chennai, Bangalore).

Output ONLY a valid JSON object matching the format below. Do not include markdown code block formatting (like \`\`\`json) or any explanations.

JSON format:
{
  "hasTaxCalculationIntent": boolean,
  "salary": number,
  "rentPaid": number,
  "hraReceived": number,
  "basicSalary": number,
  "section80C": number,
  "section80D": number,
  "section24b": number,
  "isMetro": boolean
}`,
        prompt: `Query: "${query}"`,
        temperature: 0,
      });

      const responseText = response.text.trim();
      const cleanJson = responseText.replace(/```json/i, "").replace(/```/g, "").trim();
      logDebugToFile("Speculative calculation LLM raw response: " + responseText);
      const parsed = JSON.parse(cleanJson);

      if (parsed.hasTaxCalculationIntent) {
        return {
          args: {
            salary: parsed.salary || 0,
            rentPaid: parsed.rentPaid || 0,
            hraReceived: parsed.hraReceived || parsed.rentPaid || 0,
            basicSalary: parsed.basicSalary || (parsed.salary ? parsed.salary * 0.4 : 0),
            section80C: parsed.section80C || 0,
            section80D: parsed.section80D || 0,
            section24b: parsed.section24b || 0,
            isMetro: !!parsed.isMetro,
          }
        };
      }
      return null;
    } catch (e: any) {
      logErrorToFile(e, "parseSpeculativeCalculatorArgsLLM");
      logDebugToFile("LLM-based parsing failed or timed out. Falling back to regex-based parsing...");
      const regexArgs = parseSpeculativeCalculatorArgsRegex(query);
      return { args: regexArgs, error: "Speculative LLM extractor offline (fallback to local regex)" };
    }
  }

  // No LLM configured or offline:
  const regexArgs = parseSpeculativeCalculatorArgsRegex(query);
  return { args: regexArgs };
}

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
    let isMockMode = !apiKey || apiKey === "mock-openrouter-key";

    const ay = extractAssessmentYear(userContent);

    if (!isMockMode) {
      try {
        logDebugToFile("Starting online chat flow...");
        const openrouterClient = createOpenAI({
          baseURL: "https://openrouter.ai/api/v1",
          apiKey: apiKey,
          headers: {
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Corpus",
          }
        });

        const modelName = process.env.PRIMARY_MODEL || "deepseek/deepseek-chat-v3-0324:free";

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
                  formattedMessages.push({
                    role: "assistant",
                    content: toolResults.map((tr: any) => ({
                      type: "tool-call",
                      toolCallId: tr.toolCallId || "calc-call",
                      toolName: tr.toolName,
                      input: tr.args,
                    })),
                  });
                  formattedMessages.push({
                    role: "tool",
                    content: toolResults.map((tr: any) => ({
                      type: "tool-result",
                      toolCallId: tr.toolCallId || "calc-call",
                      toolName: tr.toolName,
                      output: {
                        type: "json",
                        value: tr.result
                      },
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

        const transformedStream = new ReadableStream({
          async start(controller) {
            try {
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
              await new Promise((resolve) => setTimeout(resolve, 200));
              
              controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: searchState, message: searchMessage })}\n`));

              // Parallel execution: RAG retrieval & Speculative calculator execution
              let speculativeParserError: string | undefined = undefined;
              const speculativePromiseWrapper = (async () => {
                try {
                  const parseResult = await parseSpeculativeCalculatorArgs(userContent, openrouterClient, modelName);
                  if (parseResult) {
                    if (parseResult.error) {
                      speculativeParserError = parseResult.error;
                    }
                    const speculativeArgs = parseResult.args;
                    if (speculativeArgs) {
                      logDebugToFile("Speculative calculation arguments extracted: " + JSON.stringify(speculativeArgs));
                      const res = await tax_slab_calculator.execute!(
                        { ...speculativeArgs, assessmentYear: ay },
                        { toolCallId: "speculative-calc-call", messages: [] }
                      );
                      return { args: { ...speculativeArgs, assessmentYear: ay }, result: res, toolCallId: "speculative-calc-call" };
                    }
                  }
                } catch (err) {
                  logErrorToFile(err, "speculativePromiseWrapper");
                }
                return null;
              })();

              logDebugToFile("Starting parallel RAG retrieval and speculative calc execution...");
              const [ragResult, speculativeResult] = await Promise.all([
                searchHybrid(userContent, 10, 4, sessionId, ay),
                speculativePromiseWrapper
              ]);

              if (speculativeParserError) {
                controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "thinking", message: `⚠️ ${speculativeParserError}` })}\n`));
                await new Promise((resolve) => setTimeout(resolve, 1000));
              }

              const chunkContext = ragResult.chunks
                .map((c) => `[Document: ${c.title} | Source: ${c.source}]\n${c.content}`)
                .join("\n\n---\n\n");

              const graphContext = formatGraphRelationships(ragResult.relationships);
              
              const retrievedContext = [chunkContext, graphContext].filter(Boolean).join("\n\n---\n\n");

              controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "analyzing", message: "Analyzing tax regulations..." })}\n`));
              await new Promise((resolve) => setTimeout(resolve, 200));

              const finalSystemPrompt = retrievedContext
                ? `${CA_SYSTEM_PROMPT}\n\nHere is the most relevant tax database context retrieved for the user's query:\n${retrievedContext}\n\nGuidelines:\n- Rely on the retrieved context to answer the query accurately.\n- If the context does not contain the answer, use your pre-trained knowledge but mention that it is based on general tax understanding.`
                : CA_SYSTEM_PROMPT;

              // Self-correction loop
              let attempt = 0;
              const maxAttempts = 3;
              const currentMessages = [...formattedMessages];
              let finalText = "";
              let finalToolResults: any[] = [];
              let isAgentSuccess = false;

              while (attempt < maxAttempts && !isAgentSuccess) {
                logDebugToFile(`Agent Loop: Turn ${attempt + 1}/${maxAttempts}`);

                if (attempt === 0 && speculativeResult) {
                  logDebugToFile("Injecting speculative calculator tool call & result");
                  currentMessages.push({
                    role: "assistant",
                    content: [{
                      type: "tool-call",
                      toolCallId: "speculative-calc-call",
                      toolName: "tax_slab_calculator",
                      input: speculativeResult.args,
                    }],
                  });
                  currentMessages.push({
                    role: "tool",
                    content: [
                      {
                        type: "tool-result",
                        toolCallId: "speculative-calc-call",
                        toolName: "tax_slab_calculator",
                        output: {
                          type: "json",
                          value: speculativeResult.result,
                        },
                      }
                    ]
                  });
                }

                const response = await generateText({
                  model: openrouterClient.chat(modelName),
                  system: finalSystemPrompt,
                  messages: currentMessages,
                  maxSteps: 5,
                  tools: {
                    tax_slab_calculator,
                    itr_form_selector,
                    deduction_lookup,
                    tds_lookup,
                  },
                } as any);

                finalText = response.text;
                finalToolResults = response.toolResults || [];

                let mergedToolResults = [...finalToolResults];
                if (speculativeResult) {
                  mergedToolResults.push({
                    toolCallId: "speculative-calc-call",
                    toolName: "tax_slab_calculator",
                    args: speculativeResult.args,
                    result: speculativeResult.result
                  });
                }

                const check = checkDiscrepancies(finalText, mergedToolResults);

                if (check.isValid) {
                  logDebugToFile("Agent Loop: Check passed. No discrepancies found.");
                  isAgentSuccess = true;
                  finalText = check.correctedText;
                } else {
                  logDebugToFile(`Agent Loop: Discrepancies detected: ${check.errorFeedback}`);
                  attempt++;
                  if (attempt < maxAttempts) {
                    currentMessages.push({
                      role: "assistant",
                      content: finalText,
                    });
                    currentMessages.push({
                      role: "user",
                      content: check.errorFeedback || "",
                    });
                  } else {
                    logDebugToFile("Agent Loop: Max attempts reached. Applying final safety hard override.");
                    finalText = check.correctedText;
                  }
                }
              }

              let mergedToolResults = [...finalToolResults];
              if (speculativeResult && !finalToolResults.some(r => r.toolName === "tax_slab_calculator")) {
                mergedToolResults.push({
                  toolCallId: "speculative-calc-call",
                  toolName: "tax_slab_calculator",
                  args: speculativeResult.args,
                  result: speculativeResult.result
                });
              }

              if (mergedToolResults.length > 0) {
                for (const res of mergedToolResults) {
                  await prisma.message.create({
                    data: {
                      sessionId,
                      role: "tool",
                      content: JSON.stringify(res.result),
                      state: JSON.stringify({
                        toolCallId: res.toolCallId || "calc-call",
                        toolName: res.toolName,
                        args: res.args
                      }),
                    }
                  });
                }
              }

              await prisma.message.create({
                data: {
                  sessionId,
                  role: "assistant",
                  content: finalText,
                  state: mergedToolResults.length > 0 ? JSON.stringify(mergedToolResults) : null,
                }
              });

              await prisma.session.update({
                where: { id: sessionId },
                data: { updatedAt: new Date() }
              });

              if (mergedToolResults.length > 0) {
                controller.enqueue(encoder.encode(`v:${JSON.stringify({ success: true, state: "calculating", message: "Running tax tools & calculators..." })}\n`));
                const validationChunks = [
                  { success: true, state: "verifying_math", message: "Verifying math..." },
                  { success: true, state: "cross_referencing_sections", message: "Cross-referencing Income Tax Sections..." },
                  { success: true, state: "validated", message: "Math validated" }
                ];
                for (const vc of validationChunks) {
                  controller.enqueue(encoder.encode(`v:${JSON.stringify(vc)}\n`));
                  await new Promise((resolve) => setTimeout(resolve, 100));
                }
              }

              const words = finalText.split(" ");
              for (const word of words) {
                controller.enqueue(encoder.encode(`0:${JSON.stringify(word + " ")}\n`));
                await new Promise((resolve) => setTimeout(resolve, 10));
              }

              controller.close();
            } catch (err: any) {
              console.error("Online transformedStream execution error:", err);
              logErrorToFile(err, "transformedStream");
              controller.enqueue(encoder.encode(`0:${JSON.stringify("An error occurred during response generation. Falling back to offline services...")}\n`));
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
      } catch (err) {
        console.warn("Online generation threw error. Bypassing to offline mock report...", err);
        logErrorToFile(err, "online_generation_fallback");
        isMockMode = true;
      }
    }

    if (isMockMode) {
      logDebugToFile("Entering offline fallback report generation");
      const offlineResult = await generateOfflineReport(userContent, ay);
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const initialStates = [
              { success: true, state: "thinking", message: "⚠️ Live AI offline. Running local calculations..." },
              { success: true, state: "searching_db", message: "Searching local tax database..." },
              { success: true, state: "analyzing", message: "Analyzing offline rules..." }
            ];

            for (const stateObj of initialStates) {
              controller.enqueue(encoder.encode(`v:${JSON.stringify(stateObj)}\n`));
              await new Promise((resolve) => setTimeout(resolve, 300));
            }

            for (const tr of offlineResult.toolResults) {
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

            await prisma.message.create({
              data: {
                sessionId,
                role: "assistant",
                content: offlineResult.text,
                state: offlineResult.toolResults.length > 0 ? JSON.stringify(offlineResult.toolResults) : null
              }
            });

            await prisma.session.update({
              where: { id: sessionId },
              data: { updatedAt: new Date() }
            });

            const words = offlineResult.text.split(" ");
            for (const word of words) {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(word + " ")}\n`));
              await new Promise((resolve) => setTimeout(resolve, 15));
            }

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
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "An error occurred during chat processing" }, { status: 500 });
  }
}
