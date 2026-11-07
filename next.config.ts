import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./agent-skills/**/*"],
  },
};

export default nextConfig;
