import { withAuth } from "next-auth/middleware";

// In Next.js 16, 'middleware' is renamed to 'proxy'.
// We wrap NextAuth's middleware using withAuth and custom sign-in redirect options.
export const proxy = withAuth({
  pages: {
    signIn: "/login",
  },
});

export default proxy;

export const config = {
  matcher: [
    "/chat/:path*",
    "/api/chat/:path*",
  ],
};
