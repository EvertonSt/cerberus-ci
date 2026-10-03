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
   * The end-to-end suite drives the dev server over 127.0.0.1, and Next treats
   * that as a different origin from the `localhost` it was bound to. Without
   * this it refuses to serve its own chunks and the page renders unstyled.
   *
   * Worth recording how this was found: the journey test passed anyway, because
   * it asserts structure, navigation, a 404 and response headers - none of which
   * depend on a stylesheet arriving. The only symptom was a warning in the
   * server log. A green test suite is not evidence that the app worked, so the
   * fix belongs here rather than in the assertions.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost"],

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
