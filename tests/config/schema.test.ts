import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  generateDefaultConfig,
  validateConfig,
  DEFAULT_CONFIG,
} from "../../src/lib/config/schema";
import type { CerberusConfig } from "../../src/lib/config/schema";

describe("Config Schema", () => {
  describe("loadConfig", () => {
    it("returns defaults when config file does not exist", () => {
      const config = loadConfig("/nonexistent/path/config.yml");
      expect(config.ai.provider).toBe("claude");
      expect(config.gate.fail_on_regression).toBe(true);
    });

    it("loads config from a YAML file", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-test-"));
      const configPath = path.join(tmpDir, "cerberus.config.yml");

      const yaml = `
ai:
  provider: mock
  model: test-model

gate:
  fail_on_regression: false
  max_new_flaky_tests: 10
`;

      fs.writeFileSync(configPath, yaml, "utf-8");

      const config = loadConfig(configPath);
      expect(config.ai.provider).toBe("mock");
      expect(config.ai.model).toBe("test-model");
      expect(config.gate.fail_on_regression).toBe(false);
      expect(config.gate.max_new_flaky_tests).toBe(10);

      // Defaults should be preserved for unset values
      expect(config.gate.fail_on_unknown).toBe(DEFAULT_CONFIG.gate.fail_on_unknown);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it("deep merges with defaults", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-test-"));
      const configPath = path.join(tmpDir, "cerberus.config.yml");

      const yaml = `
classifier:
  consecutive_failures_threshold: 5
`;

      fs.writeFileSync(configPath, yaml, "utf-8");

      const config = loadConfig(configPath);
      expect(config.classifier.consecutive_failures_threshold).toBe(5);
      expect(config.classifier.history_depth).toBe(DEFAULT_CONFIG.classifier.history_depth);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe("generateDefaultConfig", () => {
    it("generates valid YAML", () => {
      const content = generateDefaultConfig();
      expect(content).toContain("ai:");
      expect(content).toContain("provider: claude");
      expect(content).toContain("classifier:");
      expect(content).toContain("gate:");
      expect(content).toContain("perf:");
    });

    it("includes comments", () => {
      const content = generateDefaultConfig();
      expect(content).toContain("# Cerberus CI Configuration");
    });
  });

  describe("validateConfig", () => {
    it("passes for default config", () => {
      const result = validateConfig(DEFAULT_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it("rejects invalid provider", () => {
      const config = {
        ...DEFAULT_CONFIG,
        ai: { ...DEFAULT_CONFIG.ai, provider: "invalid" as CerberusConfig["ai"]["provider"] },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("provider"))).toBe(true);
    });

    it("requires base_url for openai-compatible", () => {
      const config = {
        ...DEFAULT_CONFIG,
        ai: { ...DEFAULT_CONFIG.ai, provider: "openai-compatible" as const, base_url: null },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("base_url"))).toBe(true);
    });

    it("warns when base_url is set for non-openai provider", () => {
      const config = {
        ...DEFAULT_CONFIG,
        ai: { ...DEFAULT_CONFIG.ai, provider: "claude" as const, base_url: "https://example.com" },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("base_url"))).toBe(true);
    });

    it("rejects empty model", () => {
      const config = {
        ...DEFAULT_CONFIG,
        ai: { ...DEFAULT_CONFIG.ai, model: "" },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("model"))).toBe(true);
    });

    it("rejects consecutive_failures_threshold < 1", () => {
      const config = {
        ...DEFAULT_CONFIG,
        classifier: { ...DEFAULT_CONFIG.classifier, consecutive_failures_threshold: 0 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects history_depth < 1", () => {
      const config = {
        ...DEFAULT_CONFIG,
        classifier: { ...DEFAULT_CONFIG.classifier, history_depth: 0 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects negative cache_ttl_days", () => {
      const config = {
        ...DEFAULT_CONFIG,
        classifier: { ...DEFAULT_CONFIG.classifier, cache_ttl_days: -1 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("warns when baseline_runs < 3", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, baseline_runs: 2 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("baseline_runs"))).toBe(true);
    });

    it("rejects threshold_pct > 100", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, threshold_pct: 150 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects threshold_pct <= 0", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, threshold_pct: 0 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects invalid per-metric threshold", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, thresholds: { bad: 200 } },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("rejects negative max_new_flaky_tests", () => {
      const config = {
        ...DEFAULT_CONFIG,
        gate: { ...DEFAULT_CONFIG.gate, max_new_flaky_tests: -1 },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    it("warns when fail_on_regression is false", () => {
      const config = {
        ...DEFAULT_CONFIG,
        gate: { ...DEFAULT_CONFIG.gate, fail_on_regression: false },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes("fail_on_regression"))).toBe(true);
    });

    it("rejects empty db_path", () => {
      const config = {
        ...DEFAULT_CONFIG,
        storage: { db_path: "" },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
    });

    /*
     * Regression tests for a crash found by running the GitHub Action rather
     * than by testing: `Object.entries(config.perf.thresholds)` threw
     * "Cannot convert undefined or null to object" on the configuration this
     * repository ships.
     */
    it("reports rather than throws when perf.thresholds is null", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, thresholds: null },
      } as unknown as CerberusConfig;

      expect(() => validateConfig(config)).not.toThrow();
      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("perf.thresholds"))).toBe(true);
    });

    it("reports rather than throws when perf.thresholds is not an object", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, thresholds: "page_load_ms: 20" },
      } as unknown as CerberusConfig;

      expect(() => validateConfig(config)).not.toThrow();
      expect(validateConfig(config).valid).toBe(false);
    });

    it("rejects a non-numeric threshold value", () => {
      const config = {
        ...DEFAULT_CONFIG,
        perf: { ...DEFAULT_CONFIG.perf, thresholds: { page_load_ms: "fast" } },
      } as unknown as CerberusConfig;

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("page_load_ms"))).toBe(true);
    });
  });

  describe("the configuration this repository ships", () => {
    const examplePath = path.join(process.cwd(), "cerberus.config.example.yml");

    it("exists", () => {
      expect(fs.existsSync(examplePath)).toBe(true);
    });

    it("parses and passes validation", () => {
      // This is the file the README tells a reader to copy, and the action's
      // default `config-path`. Before the deepMerge fix it loaded with
      // `perf.thresholds === null` and every command failed on load.
      const config = loadConfig(examplePath);
      const result = validateConfig(config);

      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it("keeps the default for a section whose children are all commented out", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cerberus-cfg-"));
      const file = path.join(dir, "cerberus.config.yml");
      try {
        fs.writeFileSync(
          file,
          [
            "perf:",
            "  baseline_branch: main",
            "  thresholds:",
            "    # everything under here is a comment",
            "storage:",
            "  db_path: .cerberus/data.db",
            "",
          ].join("\n"),
        );

        const config = loadConfig(file);

        // null in YAML means "not specified", so the {} default must survive.
        expect(config.perf.thresholds).toEqual({});
        expect(validateConfig(config).errors).toEqual([]);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
