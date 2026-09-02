import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Emits .next/standalone — a self-contained server with only the modules actually imported.
  // Keeps the container image small enough that cold starts stay tolerable.
  output: "standalone",
  // Dependencies live in the monorepo root's node_modules, not this app's. Without this, tracing
  // stops at the app directory and the standalone output ships without them.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
