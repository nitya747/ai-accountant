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
    console.log(`[DB] Running in serverless/production mode. Source: ${dbPath}, Target: ${tmpDbPath}`);
    try {
      // Ensure source database exists before attempting to copy
      if (fs.existsSync(dbPath)) {
        console.log(`[DB] Source database found at ${dbPath}.`);
        if (!fs.existsSync(tmpDbPath)) {
          fs.copyFileSync(dbPath, tmpDbPath);
          console.log("[DB] Copied source database to /tmp successfully.");
        } else {
          console.log("[DB] Database already exists in /tmp, skipping copy.");
        }
        dbPath = tmpDbPath;
      } else {
        // Fallback: If source db was not bundled, create empty database in /tmp to prevent folder-not-found crash
        console.warn(`[DB] Source database not found at ${dbPath}. Creating empty fallback...`);
        if (!fs.existsSync(tmpDbPath)) {
          fs.writeFileSync(tmpDbPath, "");
          console.log("[DB] Created empty database in /tmp.");
        } else {
          console.log("[DB] Empty database already exists in /tmp.");
        }
        dbPath = tmpDbPath;
      }
    } catch (e) {
      console.error("[DB] Failed to copy database to temp directory:", e);
    }
  }

  console.log(`[DB] Final database path used by adapter: ${dbPath}`);
  process.env.DATABASE_URL = `file:${dbPath}`;
  console.log(`[DB] Overwrote process.env.DATABASE_URL to: ${process.env.DATABASE_URL}`);

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
