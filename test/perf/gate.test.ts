/**
 * Performance regression gate edge-case tests.
 * Covers cold start, metric denylist, threshold boundaries, and statistical edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { checkPerfRegressions } from '../../src/perf/index.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';
import type { PerfMetricRow } from '../../src/storage/database.js';

describe('Performance Regression Gate', () => {
  let tmpDir: string;
  let dbPath: string;
  let config: CerberusConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-perf-'));
    dbPath = path.join(tmpDir, 'data.db');
    config = {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, provider: 'mock' },
      storage: { db_path: dbPath },
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setupBaseline(db: CerberusDB, metricName: string, values: number[], branch = 'main') {
    for (let i = 0; i < values.length; i++) {
      const runId = db.createRun({
        ci_run_id: `baseline-${metricName}-${i}`,
        commit_sha: `sha${i}`,
        branch,
        triggered_at: new Date(Date.now() - (values.length - i) * 86400000).toISOString(),
      });
      db.insertPerfMetric({
        run_id: runId,
        metric_name: metricName,
        value_ms: values[i],
        page_or_endpoint: 'page',
      });
    }
    db.save();
  }

  it('flags a clear regression (800ms baseline, 1400ms current)', async () => {
    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'page_load_ms', [780, 810, 795, 820, 805, 790, 815, 800, 795, 810]);

    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'page_load_ms',
      value_ms: 1400,
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].metricName).toBe('page_load_ms');
    expect(result.regressions[0].deltaPct).toBeGreaterThan(50);
    db.close();
  });

  it('does NOT flag normal variance (750-850ms range)', async () => {
    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'page_load_ms', [780, 810, 795, 820, 805, 790, 815, 800, 795, 810]);

    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'page_load_ms',
      value_ms: 830, // within normal range
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(0);
    db.close();
  });

  it('marks metric as insufficient_history when < 3 baseline runs', async () => {
    const db = await CerberusDB.create(dbPath);
    // Only 2 baseline runs
    await setupBaseline(db, 'new_metric_ms', [500, 520]);

    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'new_metric_ms',
      value_ms: 900,
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(0);
    expect(result.insufficientHistory).toContain('new_metric_ms');
    db.close();
  });

  it('excludes metrics in the denylist', async () => {
    const configWithExclude = {
      ...config,
      perf: { ...config.perf, exclude: ['noisy_metric_ms'] },
    };

    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'noisy_metric_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'noisy_metric_ms',
      value_ms: 500, // 400% increase, but excluded
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, configWithExclude);
    expect(result.regressions.length).toBe(0);
    expect(result.insufficientHistory.length).toBe(0);
    db.close();
  });

  it('respects per-metric threshold overrides', async () => {
    const configCustom = {
      ...config,
      perf: {
        ...config.perf,
        threshold_pct: 20,
        thresholds: { 'lenient_metric_ms': 50 }, // 50% threshold
      },
    };

    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'lenient_metric_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    // 30% increase — would fail with default 20% threshold, but passes with 50%
    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'lenient_metric_ms',
      value_ms: 130,
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, configCustom);
    expect(result.regressions.length).toBe(0);
    db.close();
  });

  it('per-metric threshold triggers when exceeded', async () => {
    const configCustom = {
      ...config,
      perf: {
        ...config.perf,
        threshold_pct: 20,
        thresholds: { 'strict_metric_ms': 10 }, // 10% threshold
      },
    };

    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'strict_metric_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    // 15% increase — passes default 20% but fails strict 10%
    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'strict_metric_ms',
      value_ms: 115,
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, configCustom);
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].metricName).toBe('strict_metric_ms');
    db.close();
  });

  it('compares against baseline branch, not current branch', async () => {
    const db = await CerberusDB.create(dbPath);

    // Baseline on main: 100ms consistently
    await setupBaseline(db, 'api_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], 'main');

    // PR branch has its own runs (should be ignored for baseline)
    await setupBaseline(db, 'api_ms', [200, 200, 200], 'feature');

    // Current PR run: 120ms (20% increase from main baseline)
    const currentMetrics: PerfMetricRow[] = [{
      id: 0,
      run_id: 0,
      metric_name: 'api_ms',
      value_ms: 121,
      page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    // Should compare against main (100ms), not feature (200ms)
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].baselineMedian).toBe(100);
    db.close();
  });

  it('handles multiple metrics in one run', async () => {
    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'metric_a_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    await setupBaseline(db, 'metric_b_ms', [200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);

    const currentMetrics: PerfMetricRow[] = [
      {
        id: 0, run_id: 0, metric_name: 'metric_a_ms', value_ms: 200, page_or_endpoint: 'page',
      }, // 100% increase — regression
      {
        id: 0, run_id: 0, metric_name: 'metric_b_ms', value_ms: 210, page_or_endpoint: 'page',
      }, // 5% increase — fine
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].metricName).toBe('metric_a_ms');
    db.close();
  });

  it('handles empty current metrics', async () => {
    const db = await CerberusDB.create(dbPath);
    const result = checkPerfRegressions([], db, config);
    expect(result.regressions.length).toBe(0);
    expect(result.insufficientHistory.length).toBe(0);
    db.close();
  });

  it('computes correct median for even number of baseline values', async () => {
    const db = await CerberusDB.create(dbPath);
    // 4 baseline runs: 100, 100, 100, 100 → median = 100
    await setupBaseline(db, 'even_ms', [80, 100, 100, 100]);

    const currentMetrics: PerfMetricRow[] = [{
      id: 0, run_id: 0, metric_name: 'even_ms', value_ms: 121, page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].baselineMedian).toBe(100);
    db.close();
  });

  it('uses default threshold when no per-metric override exists', async () => {
    const db = await CerberusDB.create(dbPath);
    await setupBaseline(db, 'default_ms', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    // 25% increase — exceeds default 20% threshold
    const currentMetrics: PerfMetricRow[] = [{
      id: 0, run_id: 0, metric_name: 'default_ms', value_ms: 125, page_or_endpoint: 'page',
    }];

    const result = checkPerfRegressions(currentMetrics, db, config);
    expect(result.regressions.length).toBe(1);
    expect(result.regressions[0].thresholdPct).toBe(20);
    db.close();
  });
});
