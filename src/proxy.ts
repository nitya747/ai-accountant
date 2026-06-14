import middleware from "next-auth/middleware";

// In Next.js 16, 'middleware' is renamed to 'proxy'. 
// We export the next-auth handler as both default and the named 'proxy' export.
export const proxy = middleware;
export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/chat/:path*",
    "/api/chat/:path*",
  ],
};
