/**
 * cerberus baseline — manage performance baselines from known-good runs.
 *
 * Subcommands:
 *   cerberus baseline set --run-id <id> [--label <label>]   Mark a run as a baseline
 *   cerberus baseline list                                   List all baselines
 *   cerberus baseline clear [--run-id <id>]                  Remove baseline(s)
 */

import { loadConfig, validateConfig } from '../config/schema.js';
import { CerberusDB } from '../storage/database.js';

export interface BaselineSetOptions {
  runId: string;
  label?: string;
  configPath: string;
}

export interface BaselineClearOptions {
  runId?: string;
  configPath: string;
}

export interface BaselineListOptions {
  configPath: string;
  json: boolean;
}

export interface BaselineListResult {
  baselines: Array<{
    runId: string;
    commitSha: string;
    branch: string;
    triggeredAt: string;
    label: string | null;
    createdAt: string;
    testCount: number;
    perfMetricCount: number;
  }>;
}

/**
 * Mark a run as a performance baseline.
 */
export async function setBaseline(options: BaselineSetOptions): Promise<void> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);
  try {
    const run = db.getRunByCiId(options.runId);
    if (!run) {
      throw new Error(`Run not found: ${options.runId}`);
    }

    // Verify the run has performance metrics
    const metrics = db.getPerfMetricsForRun(run.id);
    if (metrics.length === 0) {
      throw new Error(
        `Run ${options.runId} has no performance metrics. ` +
          `Ingest perf data before setting it as a baseline.`,
      );
    }

    db.setBaseline(run.id, options.label);
    db.save();
  } finally {
    db.close();
  }
}

/**
 * Remove baseline(s).
 */
export async function clearBaseline(options: BaselineClearOptions): Promise<void> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);
  try {
    if (options.runId) {
      const run = db.getRunByCiId(options.runId);
      if (!run) {
        throw new Error(`Run not found: ${options.runId}`);
      }
      if (!db.isBaseline(run.id)) {
        throw new Error(`Run ${options.runId} is not a baseline.`);
      }
      db.clearBaseline(run.id);
    } else {
      db.clearAllBaselines();
    }
    db.save();
  } finally {
    db.close();
  }
}

/**
 * List all baselines.
 */
export async function listBaselines(options: BaselineListOptions): Promise<BaselineListResult> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);
  try {
    const baselines = db.getBaselineRuns();
    return {
      baselines: baselines.map((b) => {
        const testResults = db.getTestResultsForRun(b.run.id);
        const perfMetrics = db.getPerfMetricsForRun(b.run.id);
        return {
          runId: b.run.ci_run_id,
          commitSha: b.run.commit_sha.substring(0, 7),
          branch: b.run.branch,
          triggeredAt: b.run.triggered_at,
          label: b.label,
          createdAt: b.created_at,
          testCount: testResults.length,
          perfMetricCount: perfMetrics.length,
        };
      }),
    };
  } finally {
    db.close();
  }
}

/**
 * Format baseline list as human-readable text.
 */
export function formatBaselineList(result: BaselineListResult): string {
  const lines: string[] = [];

  lines.push('🐕‍🦺 Cerberus Performance Baselines');
  lines.push('═'.repeat(50));
  lines.push('');

  if (result.baselines.length === 0) {
    lines.push('  No baselines set.');
    lines.push('');
    lines.push('  Set a baseline from a known-good run:');
    lines.push('    cerberus baseline set --run-id <run-id> [--label "description"]');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`  ${result.baselines.length} baseline(s):`);
  lines.push('');

  for (const b of result.baselines) {
    const labelStr = b.label ? ` — "${b.label}"` : '';
    lines.push(`  📌 ${b.runId}${labelStr}`);
    lines.push(`     Commit: ${b.commitSha} | Branch: ${b.branch}`);
    lines.push(`     Run at: ${b.triggeredAt}`);
    lines.push(`     Metrics: ${b.perfMetricCount} | Tests: ${b.testCount}`);
    lines.push(`     Set: ${b.createdAt}`);
    lines.push('');
  }

  lines.push('  Remove a baseline:');
  lines.push('    cerberus baseline clear --run-id <run-id>');
  lines.push('    cerberus baseline clear           # clear all baselines');
  lines.push('');

  return lines.join('\n');
}
