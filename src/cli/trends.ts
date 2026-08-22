/**
 * cerberus trends — analyze flaky test trends across multiple runs.
 * Shows which tests are getting worse, which are improving, and overall CI health.
 */

import { loadConfig, validateConfig } from '../config/schema.js';
import { CerberusDB } from '../storage/database.js';

export interface TrendsOptions {
  branch: string;
  depth: number;
  configPath: string;
  json: boolean;
}

export interface TestTrend {
  testName: string;
  totalRuns: number;
  failCount: number;
  passCount: number;
  failRate: number;
  recentFailRate: number; // last 5 runs
  trend: 'improving' | 'stable' | 'worsening';
  lastFailure?: string;
}

export interface TrendsResult {
  branch: string;
  totalRuns: number;
  overallFailRate: number;
  tests: TestTrend[];
  worstTests: TestTrend[]; // top 5 by fail rate
  improvingTests: TestTrend[];
  worseningTests: TestTrend[];
}

export async function getTrends(options: TrendsOptions): Promise<TrendsResult> {
  const config = loadConfig(options.configPath);
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration errors: ${validation.errors.join(', ')}`);
  }

  const db = await CerberusDB.create(config.storage.db_path);

  try {
    // Get total runs on this branch
    const runsResult = db.getDb().exec(
      'SELECT COUNT(*) FROM runs WHERE branch = ?',
      [options.branch],
    );
    const totalRuns = runsResult[0]?.values[0]?.[0] as number || 0;

    if (totalRuns === 0) {
      return {
        branch: options.branch,
        totalRuns: 0,
        overallFailRate: 0,
        tests: [],
        worstTests: [],
        improvingTests: [],
        worseningTests: [],
      };
    }

    // Get all unique test names with their pass/fail counts
    const testStats = db.getDb().exec(
      `SELECT 
        tr.test_name,
        COUNT(*) as total,
        SUM(CASE WHEN tr.status IN ('failed', 'timedOut') THEN 1 ELSE 0 END) as fail_count,
        SUM(CASE WHEN tr.status = 'passed' THEN 1 ELSE 0 END) as pass_count,
        MAX(r.triggered_at) as last_seen
       FROM test_results tr
       JOIN runs r ON r.id = tr.run_id
       WHERE r.branch = ?
       GROUP BY tr.test_name
       HAVING total >= 2`,
      [options.branch],
    );

    const tests: TestTrend[] = [];

    if (testStats[0]) {
      for (const vals of testStats[0].values) {
        const testName = vals[0] as string;
        const total = vals[1] as number;
        const failCount = vals[2] as number;
        const passCount = vals[3] as number;
        const failRate = total > 0 ? failCount / total : 0;

        // Get recent fail rate (last 5 runs)
        const recentResult = db.getDb().exec(
          `SELECT 
            SUM(CASE WHEN tr.status IN ('failed', 'timedOut') THEN 1 ELSE 0 END) as recent_fails,
            COUNT(*) as recent_total
           FROM (
             SELECT tr.status, r.triggered_at
             FROM test_results tr
             JOIN runs r ON r.id = tr.run_id
             WHERE tr.test_name = ? AND r.branch = ?
             ORDER BY r.triggered_at DESC
             LIMIT 5
           ) tr`,
          [testName, options.branch],
        );

        const recentFails = recentResult[0]?.values[0]?.[0] as number ?? 0;
        const recentTotal = recentResult[0]?.values[0]?.[1] as number ?? 0;
        const recentFailRate = recentTotal > 0 ? recentFails / recentTotal : 0;

        // Determine trend
        let trend: 'improving' | 'stable' | 'worsening' = 'stable';
        // Use absolute difference threshold (min 0.1 or 20% of overall rate)
        const threshold = Math.max(0.1, failRate * 0.2);
        if (recentFailRate > failRate + threshold) {
          trend = 'worsening';
        } else if (recentFailRate < failRate - threshold) {
          trend = 'improving';
        }

        // Get last failure timestamp
        const lastFailResult = db.getDb().exec(
          `SELECT r.triggered_at
           FROM test_results tr
           JOIN runs r ON r.id = tr.run_id
           WHERE tr.test_name = ? AND r.branch = ? AND tr.status IN ('failed', 'timedOut')
           ORDER BY r.triggered_at DESC
           LIMIT 1`,
          [testName, options.branch],
        );
        const lastFailure = lastFailResult[0]?.values[0]?.[0] as string | undefined;

        tests.push({
          testName,
          totalRuns: total,
          failCount,
          passCount,
          failRate,
          recentFailRate,
          trend,
          lastFailure,
        });
      }
    }

    // Compute overall fail rate
    const overallResult = db.getDb().exec(
      `SELECT 
        SUM(CASE WHEN status IN ('failed', 'timedOut') THEN 1 ELSE 0 END) as fails,
        COUNT(*) as total
       FROM test_results tr
       JOIN runs r ON r.id = tr.run_id
       WHERE r.branch = ?`,
      [options.branch],
    );
    const overallFails = overallResult[0]?.values[0]?.[0] as number || 0;
    const overallTotal = overallResult[0]?.values[1]?.[0] as number || 0;
    const overallFailRate = overallTotal > 0 ? overallFails / overallTotal : 0;

    // Sort and categorize
    const worstTests = [...tests]
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 5);

    const improvingTests = tests.filter((t) => t.trend === 'improving');
    const worseningTests = tests.filter((t) => t.trend === 'worsening');

    return {
      branch: options.branch,
      totalRuns,
      overallFailRate,
      tests,
      worstTests,
      improvingTests,
      worseningTests,
    };
  } finally {
    db.close();
  }
}
