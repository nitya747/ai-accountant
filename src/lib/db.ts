import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let prismaInstance: PrismaClient;

if (typeof window === "undefined") {
  // Server-side initialization
  const adapter = new PrismaBetterSqlite3({
    url: "prisma/dev.db",
  });
  prismaInstance = globalForPrisma.prisma || new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaInstance;
} else {
  // Client-side fallback (should not be reached as db is only imported server-side)
  prismaInstance = new PrismaClient();
}

export const prisma = prismaInstance;
