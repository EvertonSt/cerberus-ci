import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // The engine is Node code: filesystem, WASM SQLite, child processes. There
    // is no DOM in it, and pretending otherwise only hides the real boundary.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist", "e2e"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      /*
       * Coverage is measured over the ENGINE, not over everything in src/.
       *
       * `src/app` and `src/components` are React server/client components with
       * no unit tests; their behaviour is covered by the Playwright journey
       * that drives the real site in a real browser. Counting them here would
       * not make them better tested - it would dilute a number that currently
       * means something. The site is measured by its own gate, not by borrowing
       * a percentage from the engine.
       */
      include: ["src/lib/**/*.ts", "src/cli/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        // The CLI entrypoint wires commands and exits the process; it is
        // covered through the individual command modules, not by importing it.
        "src/cli/index.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
