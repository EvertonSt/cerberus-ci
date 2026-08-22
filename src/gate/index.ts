/**
 * Gate Logic — deterministic pass/fail decision based on classifications.
 * 
 * This module NEVER calls an AI provider — it only reads stored verdicts.
 * This separation ensures gate behavior is 100% deterministic given the same DB state.
 */

import { CerberusDB } from '../storage/index.js';
import type { CerberusConfig } from '../config/schema.js';
import { checkPerfRegressions } from '../perf/index.js';

export interface GateResult {
  passed: boolean;
  reasons: string[];
  flakyCount: number;
  regressionCount: number;
  unknownCount: number;
  perfRegressionCount: number;
}

/**
 * Evaluate the CI gate for a given run.
 * Returns pass/fail with detailed reasons.
 */
export async function evaluateGate(
  runId: string,
  config: CerberusConfig,
): Promise<GateResult> {
  const db = await CerberusDB.create(config.storage.db_path);

  try {
    const run = db.getRunByCiId(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    const classifications = db.getClassificationsForRun(run.id);
    const reasons: string[] = [];

    // Count by verdict
    let flakyCount = 0;
    let regressionCount = 0;
    let unknownCount = 0;

    for (const c of classifications) {
      switch (c.verdict) {
        case 'flaky':
          flakyCount++;
          break;
        case 'regression':
          regressionCount++;
          break;
        case 'unknown':
          unknownCount++;
          break;
      }
    }

    // Check regressions
    if (config.gate.fail_on_regression && regressionCount > 0) {
      reasons.push(`${regressionCount} regression(s) detected — real bugs found.`);
    }

    // Check unknowns
    if (config.gate.fail_on_unknown && unknownCount > 0) {
      reasons.push(
        `${unknownCount} test(s) classified as unknown — investigate manually.`,
      );
    }

    // Check flaky count threshold (0 means unlimited)
    if (config.gate.max_new_flaky_tests > 0 && flakyCount > config.gate.max_new_flaky_tests) {
      reasons.push(
        `${flakyCount} flaky tests exceeds threshold of ${config.gate.max_new_flaky_tests} — flaky test count is too high.`,
      );
    }

    // Check performance regressions
    let perfRegressionCount = 0;
    if (config.gate.fail_on_perf_regression) {
      const perfMetrics = db.getPerfMetricsForRun(run.id);
      if (perfMetrics.length > 0) {
        const perfResult = checkPerfRegressions(perfMetrics, db, config);
        perfRegressionCount = perfResult.regressions.length;

        if (perfRegressionCount > 0) {
          for (const reg of perfResult.regressions) {
            reasons.push(
              `Performance regression: ${reg.metricName} ${reg.currentValue.toFixed(0)}ms vs baseline ${reg.baselineMedian.toFixed(0)}ms (+${reg.deltaPct.toFixed(1)}%, threshold: ${reg.thresholdPct}%)`,
            );
          }
        }

        if (perfResult.insufficientHistory.length > 0) {
          reasons.push(
            `Insufficient history for metrics: ${perfResult.insufficientHistory.join(', ')}`,
          );
        }
      }
    }

    return {
      passed: reasons.length === 0,
      reasons,
      flakyCount,
      regressionCount,
      unknownCount,
      perfRegressionCount,
    };
  } finally {
    db.close();
  }
}
