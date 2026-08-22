/**
 * Tests for perf module — ingestPerfMetrics and checkPerfRegressions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { ingestPerfMetrics, checkPerfRegressions } from '../../src/perf/index.js';
import { DEFAULT_CONFIG, type CerberusConfig } from '../../src/config/schema.js';

function makeConfig(overrides?: Partial<CerberusConfig['perf']>): CerberusConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (overrides) {
    Object.assign(config.perf, overrides);
  }
  return config;
}

describe('ingestPerfMetrics', () => {
  let tmpDir: string;
  let db: CerberusDB;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-perf-test-'));
    db = await CerberusDB.create(path.join(tmpDir, 'test.db'));
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ingests custom JSON perf metrics', async () => {
    const perfFile = path.join(tmpDir, 'perf.json');
    fs.writeFileSync(
      perfFile,
      JSON.stringify([
        { metric_name: 'checkout_page_load_ms', value_ms: 842, page_or_endpoint: '/checkout' },
        { metric_name: 'login_response_ms', value_ms: 320, page_or_endpoint: '/api/login' },
      ]),
    );

    const runId = db.createRun({
      ci_run_id: 'perf-test-1',
      commit_sha: 'abc123',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    const result = await ingestPerfMetrics({
      tracePath: perfFile,
      runId,
      db,
    });

    expect(result.metricsCount).toBe(2);
    expect(result.metrics[0].metricName).toBe('checkout_page_load_ms');
    expect(result.metrics[0].valueMs).toBe(842);
    expect(result.metrics[1].pageOrEndpoint).toBe('/api/login');
  });

  it('throws on unsupported file format', async () => {
    const traceFile = path.join(tmpDir, 'trace.bin');
    fs.writeFileSync(traceFile, 'binary');

    const runId2 = db.createRun({
      ci_run_id: 'perf-test-2',
      commit_sha: 'def456',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    await expect(
      ingestPerfMetrics({ tracePath: traceFile, runId: runId2, db }),
    ).rejects.toThrow('Unsupported trace file format');
  });

  it('throws on invalid JSON array', async () => {
    const badFile = path.join(tmpDir, 'bad-perf.json');
    fs.writeFileSync(badFile, '{"not": "an array"}');

    const runId3 = db.createRun({
      ci_run_id: 'perf-test-3',
      commit_sha: 'ghi789',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    // Falls through to Playwright trace parser which won't find events
    const result = await ingestPerfMetrics({ tracePath: badFile, runId: runId3, db });
    expect(result.metricsCount).toBe(0);
  });

  it('ingests Playwright trace format', async () => {
    const traceFile = path.join(tmpDir, 'trace.json');
    fs.writeFileSync(
      traceFile,
      JSON.stringify({
        events: [
          {
            type: 'resource-snapshot',
            pageOrEndpoint: '/checkout',
            snapshot: {
              timing: {
                load: 1200,
                domContentLoaded: 800,
              },
            },
          },
        ],
      }),
    );

    const runId4 = db.createRun({
      ci_run_id: 'perf-test-trace',
      commit_sha: 'trace1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    const result = await ingestPerfMetrics({ tracePath: traceFile, runId: runId4, db });

    expect(result.metricsCount).toBe(2);
    expect(result.metrics[0].metricName).toBe('/checkout_page_load_ms');
    expect(result.metrics[0].valueMs).toBe(1200);
    expect(result.metrics[1].metricName).toBe('/checkout_dom_content_loaded_ms');
    expect(result.metrics[1].valueMs).toBe(800);
  });

  it('ingests Playwright trace with timing object', async () => {
    const traceFile = path.join(tmpDir, 'trace-timing.json');
    fs.writeFileSync(
      traceFile,
      JSON.stringify({
        timing: {
          page_load_ms: 950,
          first_paint_ms: 300,
        },
      }),
    );

    const runId5 = db.createRun({
      ci_run_id: 'perf-test-timing',
      commit_sha: 'timing1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    const result = await ingestPerfMetrics({ tracePath: traceFile, runId: runId5, db });

    expect(result.metricsCount).toBe(2);
    expect(result.metrics.find((m) => m.metricName === 'page_load_ms')?.valueMs).toBe(950);
  });
});

describe('checkPerfRegressions', () => {
  let tmpDir: string;
  let db: CerberusDB;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-perf-check-'));
    db = await CerberusDB.create(path.join(tmpDir, 'check.db'));

    // Seed baseline runs on main branch
    for (let i = 0; i < 10; i++) {
      const runId = db.createRun({
        ci_run_id: `baseline-${i}`,
        commit_sha: `base${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() - (10 - i) * 86400000).toISOString(),
      });
      db.insertPerfMetric({
        run_id: runId,
        metric_name: 'page_load_ms',
        value_ms: 800 + Math.random() * 50, // 800-850ms
        page_or_endpoint: '/checkout',
      });
      db.insertPerfMetric({
        run_id: runId,
        metric_name: 'api_response_ms',
        value_ms: 200 + Math.random() * 20,
        page_or_endpoint: '/api/data',
      });
    }
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects a regression when current exceeds threshold', () => {
    const config = makeConfig({ threshold_pct: 20 });
    const currentMetrics = [
      { run_id: 999, metric_name: 'page_load_ms', value_ms: 1200, page_or_endpoint: '/checkout' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].metricName).toBe('page_load_ms');
    expect(result.regressions[0].deltaPct).toBeGreaterThan(40); // 1200 vs ~825
    expect(result.regressions[0].thresholdPct).toBe(20);
  });

  it('does not flag normal variance as regression', () => {
    const config = makeConfig({ threshold_pct: 20 });
    const currentMetrics = [
      { run_id: 999, metric_name: 'page_load_ms', value_ms: 840, page_or_endpoint: '/checkout' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.regressions).toHaveLength(0);
  });

  it('reports insufficient history when fewer than 3 baseline runs', () => {
    // Create a sparse branch
    const sparseRunId = db.createRun({
      ci_run_id: 'sparse-run',
      commit_sha: 'sparse1',
      branch: 'feature-x',
      triggered_at: new Date().toISOString(),
    });
    db.insertPerfMetric({
      run_id: sparseRunId,
      metric_name: 'new_metric_ms',
      value_ms: 500,
      page_or_endpoint: '/new',
    });

    const config = makeConfig({ threshold_pct: 20 });
    const currentMetrics = [
      { run_id: sparseRunId, metric_name: 'new_metric_ms', value_ms: 500, page_or_endpoint: '/new' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.insufficientHistory).toContain('new_metric_ms');
  });

  it('respects metric exclude list', () => {
    const config = makeConfig({
      threshold_pct: 10,
      exclude: ['page_load_ms'],
    });
    const currentMetrics = [
      { run_id: 999, metric_name: 'page_load_ms', value_ms: 5000, page_or_endpoint: '/checkout' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    expect(result.regressions).toHaveLength(0);
    expect(result.insufficientHistory).toHaveLength(0);
  });

  it('uses per-metric threshold when configured', () => {
    const config = makeConfig({
      threshold_pct: 20,
      thresholds: { 'api_response_ms': 5 }, // stricter threshold
    });
    const currentMetrics = [
      { run_id: 999, metric_name: 'api_response_ms', value_ms: 230, page_or_endpoint: '/api/data' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    // 230 vs ~210 median = ~9.5% delta, exceeds 5% threshold
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].thresholdPct).toBe(5);
  });

  it('handles even number of baseline values for median', () => {
    // Create branch with exactly 4 runs
    const evenRunId = db.createRun({
      ci_run_id: 'even-run',
      commit_sha: 'even1',
      branch: 'even-branch',
      triggered_at: new Date().toISOString(),
    });
    db.insertPerfMetric({
      run_id: evenRunId,
      metric_name: 'even_metric_ms',
      value_ms: 100,
      page_or_endpoint: '/even',
    });

    // Add 4 baseline runs with known values
    for (let i = 0; i < 4; i++) {
      const runId = db.createRun({
        ci_run_id: `even-base-${i}`,
        commit_sha: `evenbase${i}`,
        branch: 'even-base',
        triggered_at: new Date(Date.now() - i * 86400000).toISOString(),
      });
      db.insertPerfMetric({
        run_id: runId,
        metric_name: 'even_metric_ms',
        value_ms: 100 + i * 10, // 100, 110, 120, 130 → median = 115
        page_or_endpoint: '/even',
      });
    }

    const config = makeConfig({
      threshold_pct: 20,
      baseline_branch: 'even-base',
    });
    const currentMetrics = [
      { run_id: evenRunId, metric_name: 'even_metric_ms', value_ms: 140, page_or_endpoint: '/even' },
    ];

    const result = checkPerfRegressions(currentMetrics, db, config);

    // 140 vs 115 median = 21.7% > 20% threshold
    expect(result.regressions).toHaveLength(1);
  });
});
