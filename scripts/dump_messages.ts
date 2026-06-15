import { prisma } from "../src/lib/db";

async function main() {
  const sessions = await prisma.session.findMany({
    include: {
      messages: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  console.log(`Found ${sessions.length} sessions:`);
  for (const session of sessions) {
    console.log(`\nSession ID: ${session.id} | Title: ${session.title}`);
    console.log(`Messages (${session.messages.length}):`);
    for (const msg of session.messages) {
      console.log(`  [${msg.role}] (${msg.createdAt.toISOString()}):`);
      console.log(`  ${msg.content.substring(0, 200)}...`);
    }
  }
}

main().catch(console.error);
