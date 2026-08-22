/**
 * Cerberus configuration schema and loader.
 * Loads cerberus.config.yml from the target repo.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import type { AIConfig } from '../ai/provider.js';

export interface ClassifierConfig {
  /**
   * Minimum consecutive failures before classifying as regression without AI
   */
  consecutive_failures_threshold: number;
  /**
   * Number of recent runs to check for pass/fail history pattern
   */
  history_depth: number;
  /**
   * Days to look back for cached verdicts
   */
  cache_ttl_days: number;
}

export interface PerfConfig {
  /**
   * Branch to use as baseline for performance comparison
   */
  baseline_branch: string;
  /**
   * Number of baseline runs to compute rolling median/p90 from
   */
  baseline_runs: number;
  /**
   * Default regression threshold percentage (e.g. 20 = flag if >20% slower)
   */
  threshold_pct: number;
  /**
   * Per-metric threshold overrides
   */
  thresholds: Record<string, number>;
  /**
   * Metrics to exclude from gating
   */
  exclude: string[];
}

export interface GateConfig {
  fail_on_regression: boolean;
  fail_on_unknown: boolean;
  fail_on_perf_regression: boolean;
  max_new_flaky_tests: number;
}

export interface StorageConfig {
  db_path: string;
}

export interface CerberusConfig {
  ai: AIConfig;
  classifier: ClassifierConfig;
  perf: PerfConfig;
  gate: GateConfig;
  storage: StorageConfig;
}

export const DEFAULT_CONFIG: CerberusConfig = {
  ai: {
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    base_url: null,
    api_key_env: 'ANTHROPIC_API_KEY',
  },
  classifier: {
    consecutive_failures_threshold: 3,
    history_depth: 5,
    cache_ttl_days: 30,
  },
  perf: {
    baseline_branch: 'main',
    baseline_runs: 10,
    threshold_pct: 20,
    thresholds: {},
    exclude: [],
  },
  gate: {
    fail_on_regression: true,
    fail_on_unknown: false,
    fail_on_perf_regression: true,
    max_new_flaky_tests: 3,
  },
  storage: {
    db_path: '.cerberus/data.db',
  },
};

/**
 * Deep merge two objects, with the source overriding the target.
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      sourceVal !== undefined &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === 'object' &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }
  return result;
}

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a Cerberus config and return errors/warnings.
 * Call this after loadConfig() to catch misconfigurations early.
 */
export function validateConfig(config: CerberusConfig): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── AI config validation ──────────────────────────────────
  const validProviders = ['claude', 'openai-compatible', 'mock'];
  if (!validProviders.includes(config.ai.provider)) {
    errors.push(
      `ai.provider must be one of: ${validProviders.join(', ')}. Got: '${config.ai.provider}'`,
    );
  }

  if (config.ai.provider === 'openai-compatible' && !config.ai.base_url) {
    errors.push(
      "ai.base_url is required when ai.provider is 'openai-compatible'. " +
      "Example: 'https://api.openai.com/v1'",
    );
  }

  if (config.ai.base_url && config.ai.provider !== 'openai-compatible') {
    warnings.push(
      `ai.base_url is set but ai.provider is '${config.ai.provider}'. ` +
      'base_url is only used with openai-compatible provider.',
    );
  }

  if (!config.ai.model || config.ai.model.trim() === '') {
    errors.push('ai.model cannot be empty.');
  }

  // ── Classifier config validation ──────────────────────────
  if (config.classifier.consecutive_failures_threshold < 1) {
    errors.push(
      `classifier.consecutive_failures_threshold must be >= 1. Got: ${config.classifier.consecutive_failures_threshold}`,
    );
  }

  if (config.classifier.history_depth < 1) {
    errors.push(
      `classifier.history_depth must be >= 1. Got: ${config.classifier.history_depth}`,
    );
  }

  if (config.classifier.cache_ttl_days < 0) {
    errors.push(
      `classifier.cache_ttl_days must be >= 0. Got: ${config.classifier.cache_ttl_days}`,
    );
  }

  // ── Perf config validation ────────────────────────────────
  if (config.perf.baseline_runs < 3) {
    warnings.push(
      `perf.baseline_runs is ${config.perf.baseline_runs}. ` +
      'Need at least 3 runs for meaningful statistical comparison. ' +
      'Consider increasing to 10+ for stable baselines.',
    );
  }

  if (config.perf.threshold_pct <= 0 || config.perf.threshold_pct > 100) {
    errors.push(
      `perf.threshold_pct must be between 0 and 100. Got: ${config.perf.threshold_pct}`,
    );
  }

  for (const [metric, pct] of Object.entries(config.perf.thresholds)) {
    if (pct <= 0 || pct > 100) {
      errors.push(
        `perf.thresholds.${metric} must be between 0 and 100. Got: ${pct}`,
      );
    }
  }

  // ── Gate config validation ────────────────────────────────
  if (config.gate.max_new_flaky_tests < 0) {
    errors.push(
      `gate.max_new_flaky_tests must be >= 0 (0 = unlimited). Got: ${config.gate.max_new_flaky_tests}`,
    );
  }

  if (!config.gate.fail_on_regression) {
    warnings.push(
      'gate.fail_on_regression is false. Regressions will not block the build. ' +
      'This is unusual — most teams want to catch regressions.',
    );
  }

  // ── Storage config validation ─────────────────────────────
  if (!config.storage.db_path || config.storage.db_path.trim() === '') {
    errors.push('storage.db_path cannot be empty.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Load cerberus.config.yml from the given directory.
 * Falls back to defaults if file doesn't exist.
 */
export function loadConfig(configPath: string): CerberusConfig {
  const fullPath = path.resolve(configPath);

  if (!fs.existsSync(fullPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const fileContent = fs.readFileSync(fullPath, 'utf-8');
  const parsed = yaml.load(fileContent) as Record<string, unknown> | null;

  if (!parsed || typeof parsed !== 'object') {
    return { ...DEFAULT_CONFIG };
  }

  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    parsed as Record<string, unknown>,
  ) as unknown as CerberusConfig;
}

/**
 * Generate the default cerberus.config.yml content with comments.
 */
export function generateDefaultConfig(): string {
  return `# Cerberus CI Configuration
# See: https://github.com/EvertonSt/cerberus-ci#configuration

# AI Provider Configuration
ai:
  # Provider: claude | openai-compatible | mock
  provider: claude
  # Model identifier (provider-specific)
  model: claude-sonnet-4-6
  # base_url: only required for openai-compatible provider
  # Examples:
  #   OpenAI:  https://api.openai.com/v1
  #   Ollama:  http://localhost:11434/v1
  #   Groq:    https://api.groq.com/openai/v1
  # base_url: null
  # Environment variable holding the API key
  api_key_env: ANTHROPIC_API_KEY

# Classifier Configuration
classifier:
  # Number of consecutive failures to auto-classify as regression
  consecutive_failures_threshold: 3
  # How many recent runs to check for pass/fail patterns
  history_depth: 5
  # How long (days) to cache verdicts before re-classifying
  cache_ttl_days: 30

# Performance Regression Gate
perf:
  # Branch to use as baseline for performance comparison
  baseline_branch: main
  # Number of baseline runs for rolling median/p90
  baseline_runs: 10
  # Default regression threshold (flag if >N% slower than baseline)
  threshold_pct: 20
  # Per-metric threshold overrides
  thresholds: {}
  # Metrics to exclude from gating (known noisy metrics)
  exclude: []

# Gate Logic (deterministic — no AI calls at gate time)
gate:
  # Fail the build if any regression is detected
  fail_on_regression: true
  # Fail the build if any test is classified as unknown
  fail_on_unknown: false
  # Fail the build if performance regression detected
  fail_on_perf_regression: true
  # Maximum number of new flaky tests before failing
  max_new_flaky_tests: 3

# Storage
storage:
  # Path to SQLite database (relative to project root)
  db_path: .cerberus/data.db
`;
}
