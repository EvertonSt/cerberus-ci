import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/*
 * Three layers, in order of how much they know:
 *
 *  1. `eslint-config-next` supplies the framework rules (React Compiler-aware
 *     hooks rules, Next's own import rules) for the site half of this repo.
 *  2. `recommendedTypeChecked` is scoped to the TypeScript tree. It is not
 *     applied globally because a type-aware rule throws at config-load time
 *     when handed a file with no program in it.
 *  3. Narrow overrides for the places where the strict defaults are wrong.
 */
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next*/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
    "public/**",
  ]),
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts", "*.config.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* `any` is how a type error becomes a runtime one three files away. */
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      /* An unawaited promise in a request handler is a 500 that never logs. */
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-return": "off",

      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      /*
       * The CLI is the product's interface: `cerberus run` printing to stdout is
       * the whole point, so `console.log` is allowed there and in the gate
       * scripts. It is a warning everywhere else, not an error, because a
       * `no-console` error in a CLI repo trains people to switch the rule off.
       */
      "no-console": ["warn", { allow: ["warn", "error", "log", "info"] }],
    },
  },
  {
    /*
     * The test tier, pointed at its OWN tsconfig.
     *
     * `projectService` finds the nearest tsconfig, and tsconfig.json excludes
     * `tests/` on purpose (see tsconfig.tests.json for why). Without naming the
     * project here, every test file fails to build a program and ESLint reports
     * a parse error for all of them - 26 errors that measure nothing about the
     * code and bury whatever is real underneath.
     */
    files: ["tests/**/*.{ts,tsx}", "e2e/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.tests.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-console": "off",

      /*
       * Two rules the test tier deliberately does not inherit.
       *
       * `require-await` - a fetch double must be `async json()` because
       * `Response.json()` is async in the real thing. Removing `async` to
       * satisfy the rule makes the double stop matching the contract it
       * exists to test against.
       *
       * `no-unsafe-return` - a mock returning the fixture it was handed is
       * what a mock does. The `any` is the input, not a new escape hatch.
       *
       * Both stay ON everywhere else. Scoping them to tests is not the
       * same as turning them off.
       */
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    /* Next's config API is Promise-based by contract; `require-await` cannot tell. */
    files: ["next.config.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    /*
     * Tests and the gate scripts feed deliberately wrong-shaped values into the
     * code and assert on `expect.any(String)`, which is `any` by design. That
     * is the job, not a smell — and these are the only paths where a value is
     * untyped on purpose. The rules stay on everywhere else.
     */
    files: ["tests/**/*.{ts,tsx}", "e2e/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
    },
  },
  {
    /*
     * The attribution and secret scanners necessarily contain every pattern
     * they hunt for. Linting them would mean weakening rules to accommodate
     * the guard — and a rule weakened for the guard gets weakened again later.
     */
    files: ["scripts/check-attribution.ts", "scripts/check-secrets.ts"],
    rules: {
      "no-empty": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);
