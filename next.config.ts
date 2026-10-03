import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Keep the engine's Node-only packages out of the browser/server bundle.
   *
   * `sql.js` is WebAssembly and must be loaded from `node_modules` at runtime;
   * `js-yaml` and `xml2js` reach for Node built-ins at import time; the
   * Anthropic SDK is server-only by construction. Bundling any of them produces
   * a build that compiles and then fails at the first request.
   */
  serverExternalPackages: ["sql.js", "js-yaml", "xml2js", "@anthropic-ai/sdk"],

  /*
   * Overridable so two builds can coexist on one machine. The end-to-end suite
   * builds beside the development build rather than over it.
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  /*
   * Security headers live HERE, not in vercel.json.
   *
   * Two sources of truth for the same header list means one of them is stale,
   * and the stale one is whichever nobody tests. Declaring them in the Next
   * config means they are applied by `next start` locally as well as on Vercel,
   * so `pnpm build && pnpm start` reproduces production exactly.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
