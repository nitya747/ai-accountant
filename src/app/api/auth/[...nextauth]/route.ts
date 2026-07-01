import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

async function authHandler(req: Request, context: { params: Promise<{ nextauth?: string[] }> }) {
  const resolvedParams = await context.params;
  return handler(req, { ...context, params: resolvedParams });
}

export { authHandler as GET, authHandler as POST };

