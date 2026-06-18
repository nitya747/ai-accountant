import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const { id } = await params;

    const { content } = await req.json();
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }

    // Find the message and check if it belongs to the user's session
    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        session: true,
      },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (message.session.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Delete all messages in the same session created at or after this message
    // Since we will re-send this user message with the new content,
    // we delete the original message and all subsequent messages.
    await prisma.message.deleteMany({
      where: {
        sessionId: message.sessionId,
        createdAt: {
          gte: message.createdAt,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to edit message:", error);
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 });
  }
}
