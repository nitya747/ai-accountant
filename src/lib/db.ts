import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let prismaInstance: PrismaClient;

if (typeof window === "undefined") {
  // Server-side initialization
  let dbPath = path.join(process.cwd(), "prisma", "dev.db");

  // For serverless/Vercel environments, we copy the DB to a writable /tmp directory
  const isServerless = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (isServerless) {
    const tmpDbPath = path.join(os.tmpdir(), "dev.db");
    try {
      // Ensure source database exists before attempting to copy
      if (fs.existsSync(dbPath)) {
        if (!fs.existsSync(tmpDbPath)) {
          fs.copyFileSync(dbPath, tmpDbPath);
        }
        dbPath = tmpDbPath;
      }
    } catch (e) {
      console.error("Failed to copy database to temp directory, falling back to original path:", e);
    }
  }

  const adapter = new PrismaBetterSqlite3({
    url: dbPath,
  });
  prismaInstance = globalForPrisma.prisma || new PrismaClient({ adapter });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prismaInstance;
} else {
  // Client-side fallback (should not be reached as db is only imported server-side)
  prismaInstance = new PrismaClient();
}

export const prisma = prismaInstance;
