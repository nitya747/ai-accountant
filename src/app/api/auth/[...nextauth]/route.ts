import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export async function GET(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  return handler(req, { params });
}

export async function POST(req: Request, ctx: { params: Promise<any> }) {
  const params = await ctx.params;
  return handler(req, { params });
}

