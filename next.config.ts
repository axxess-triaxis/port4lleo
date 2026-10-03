import type { NextConfig } from "next";
import { findPublicSecrets } from "./src/lib/env-guard";

const leaks = findPublicSecrets(process.env);
if (leaks.length > 0) {
  // Values are never printed, only which variable is wrong and why.
  throw new Error(`Refusing to build: public env vars contain secrets:\n- ${leaks.join("\n- ")}`);
}

const nextConfig: NextConfig = {
  // Some clients request /favicon.ico directly; serve the app icon there.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.png" }];
  },
};

export default nextConfig;
