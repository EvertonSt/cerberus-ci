/**
 * Test that perf regression detection prefers manually-set baselines.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { checkPerfRegressions } from '../../src/perf/index.js';
import { generateDefaultConfig, type CerberusConfig } from '../../src/config/schema.js';

describe('perf baseline priority', () => {
  let tmpDir: string;
  let db: CerberusDB;
  let config: CerberusConfig;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-baseline-priority-'));
    const dbPath = path.join(tmpDir, 'test.db');

    config = {
      ai: { provider: 'mock', model: 'mock', base_url: null, api_key_env: null },
      classifier: { consecutive_failures_threshold: 3, history_depth: 5, cache_ttl_days: 30 },
      perf: { baseline_branch: 'main', baseline_runs: 10, threshold_pct: 20, thresholds: {}, exclude: [] },
      gate: { fail_on_regression: true, fail_on_unknown: false, fail_on_perf_regression: true, max_new_flaky_tests: 3 },
      storage: { db_path: dbPath },
    } as CerberusConfig;

    db = await CerberusDB.create(dbPath);

    // ── Scenario: main branch has high latency (900-1000ms) ──
    // Without manual baselines, these would be the "normal" values.
    // But we have a known-good baseline run at 500ms on a different branch.
    for (let i = 0; i < 10; i++) {
      const runId = db.createRun({
        ci_run_id: `main-run-${i}`,
        commit_sha: `main${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() - (10 - i) * 86400000).toISOString(),
      });
      db.insertPerfMetric({
        run_id: runId,
        metric_name: 'page_load_ms',
        value_ms: 900 + Math.random() * 100, // 900-1000ms (slow but "normal" for main)
        page_or_endpoint: '/home',
      });
    }

    // ── Manual baseline: known-good run at 500ms ──
    const baselineRun = db.createRun({
      ci_run_id: 'known-good-run',
      commit_sha: 'good1111',
      branch: 'release',
      triggered_at: '2026-01-01T00:00:00Z',
    });
    db.insertPerfMetric({
      run_id: baselineRun,
      metric_name: 'page_load_ms',
      value_ms: 500, // Much faster — this is what "good" looks like
      page_or_endpoint: '/home',
    });

    // Mark it as a manual baseline
    db.setBaseline(baselineRun, 'v1.0 release — known good');

    db.save();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('flags 700ms as regression when manual baseline is 500ms', () => {
    // 700ms vs 500ms baseline = +40% → should flag
    const currentMetrics = [
      { run_id: 999, metric_name: 'page_load_ms', value_ms: 700, page_or_endpoint: '/home' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].metricName).toBe('page_load_ms');
    expect(result.regressions[0].baselineMedian).toBe(500); // uses manual baseline, not main's ~950
    expect(result.regressions[0].deltaPct).toBe(40); // (700-500)/500*100 = 40%
  });

  it('does NOT flag 950ms as regression when main branch is the baseline', () => {
    // Clear manual baselines — now it falls back to main branch
    db.clearAllBaselines();
    db.save();

    // 950ms vs ~950 main median = ~0% → should NOT flag
    const currentMetrics = [
      { run_id: 999, metric_name: 'page_load_ms', value_ms: 950, page_or_endpoint: '/home' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.regressions).toHaveLength(0);

    // Restore manual baseline for other tests
    const run = db.getRunByCiId('known-good-run');
    if (run) db.setBaseline(run.id, 'v1.0 release — known good');
    db.save();
  });

  it('getBaselineMetrics returns manual baseline data', () => {
    const metrics = db.getBaselineMetrics('page_load_ms', 'main', 10);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].value_ms).toBe(500);
  });

  it('getBaselineMetrics falls back to branch when no manual baseline', () => {
    db.clearAllBaselines();
    db.save();

    const metrics = db.getBaselineMetrics('page_load_ms', 'main', 10);
    expect(metrics.length).toBe(10); // all main branch runs

    // Restore
    const run = db.getRunByCiId('known-good-run');
    if (run) db.setBaseline(run.id, 'v1.0 release — known good');
    db.save();
  });
});
