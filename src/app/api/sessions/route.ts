import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

function generateTitleFromMessage(message: string): string {
  let title = message.trim();
  
  // If it's a PDF upload description, extract the doc type or file name
  if (title.startsWith("[Uploaded Document:") || title.startsWith("[Uploaded File:")) {
    const docMatch = title.match(/Document Type:\*\*?\s*([^\n]+)/i);
    const nameMatch = title.match(/Employee \(Taxpayer\):\*\*?\s*([^\n]+)/i);
    if (docMatch && nameMatch) {
      const cleanDoc = docMatch[1].trim().replace(/['"“`’]/g, "");
      const cleanName = nameMatch[1].trim().split(" ")[0].replace(/[^a-zA-Z]/g, "");
      return `${cleanDoc} - ${cleanName}`;
    }
    const fileMatch = title.match(/\[Uploaded (?:Document|File):\s*([^\]]+)\]/);
    if (fileMatch) {
      return `Doc: ${fileMatch[1].replace(/\.[^/.]+$/, "")}`;
    }
  }

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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const chatSessions = await prisma.session.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1,
        }
      },
      orderBy: { updatedAt: "desc" },
    });

    const formattedSessions = [];
    for (const s of chatSessions) {
      let title = s.title;
      if (title === "New Chat" || title === "New Session" || !title) {
        if (s.messages && s.messages.length > 0) {
          title = generateTitleFromMessage(s.messages[0].content);
          // Persist the updated title in the database
          await prisma.session.update({
            where: { id: s.id },
            data: { title },
          });
        }
      }
      formattedSessions.push({
        id: s.id,
        title: title || "New Chat",
        createdAt: s.createdAt,
      });
    }

    return NextResponse.json(formattedSessions);
  } catch (error: any) {
    console.error("Failed to fetch sessions:", error);
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    let title = "New Session";
    let parentSessionId: string | undefined;
    let upToMessageId: string | undefined;

    try {
      const body = await req.json();
      if (body.title) title = body.title;
      parentSessionId = body.parentSessionId;
      upToMessageId = body.upToMessageId;
    } catch {
      // Body empty or invalid
    }

    if (parentSessionId && upToMessageId) {
      const parentSession = await prisma.session.findFirst({
        where: { id: parentSessionId, userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!parentSession) {
        return NextResponse.json({ error: "Parent session not found" }, { status: 404 });
      }

      const targetIndex = parentSession.messages.findIndex((m) => m.id === upToMessageId);
      if (targetIndex === -1) {
        return NextResponse.json({ error: "Message not found in parent session" }, { status: 404 });
      }

      const branchTitle = title !== "New Session" ? title : `Branch of ${parentSession.title || "Chat"}`;
      const branchedSession = await prisma.session.create({
        data: {
          userId,
          title: branchTitle,
        },
      });

      const messagesToCopy = parentSession.messages.slice(0, targetIndex + 1);
      if (messagesToCopy.length > 0) {
        await prisma.message.createMany({
          data: messagesToCopy.map((m) => ({
            sessionId: branchedSession.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
        });
      }

      return NextResponse.json(branchedSession, { status: 201 });
    }

    const chatSession = await prisma.session.create({
      data: {
        userId,
        title,
      },
    });

    return NextResponse.json(chatSession, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
