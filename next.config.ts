import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  outputFileTracingIncludes: {
    "/**/*": ["./prisma/dev.db"],
  },
};

export default nextConfig;
