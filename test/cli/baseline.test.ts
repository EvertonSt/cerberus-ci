/**
 * Tests for cerberus baseline — set, list, clear performance baselines.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { setBaseline, listBaselines, clearBaseline, formatBaselineList } from '../../src/cli/baseline.js';
import { generateDefaultConfig } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';

describe('cerberus baseline', () => {
  let tmpDir: string;
  let configPath: string;
  let db: CerberusDB;
  let config: CerberusConfig;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-baseline-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    configPath = path.join(tmpDir, 'cerberus.config.yml');

    const defaultConfig = generateDefaultConfig();
    fs.writeFileSync(configPath, defaultConfig.replace('.cerberus/data.db', dbPath));

    config = {
      ai: { provider: 'mock', model: 'mock', base_url: null, api_key_env: null },
      classifier: { consecutive_failures_threshold: 3, history_depth: 5, cache_ttl_days: 30 },
      perf: { baseline_branch: 'main', baseline_runs: 10, threshold_pct: 20, thresholds: {}, exclude: [] },
      gate: { fail_on_regression: true, fail_on_unknown: false, fail_on_perf_regression: true, max_new_flaky_tests: 3 },
      storage: { db_path: dbPath },
    } as CerberusConfig;

    db = await CerberusDB.create(dbPath);

    // Create run 1 — has perf metrics (good candidate for baseline)
    const run1 = db.createRun({
      ci_run_id: 'baseline-run-1',
      commit_sha: 'aaa1111111111111111111111111111111111111',
      branch: 'main',
      triggered_at: '2026-01-10T10:00:00Z',
    });

    db.insertTestResult({
      run_id: run1,
      test_name: 'test1.spec.ts:1',
      file_path: 'tests/test1.spec.ts',
      status: 'passed',
      duration_ms: 500,
    });

    db.insertPerfMetric({ run_id: run1, metric_name: 'page_load_ms', value_ms: 800, page_or_endpoint: '/home' });
    db.insertPerfMetric({ run_id: run1, metric_name: 'api_latency_ms', value_ms: 200, page_or_endpoint: '/api' });

    // Create run 2 — has perf metrics
    const run2 = db.createRun({
      ci_run_id: 'baseline-run-2',
      commit_sha: 'bbb2222222222222222222222222222222222222',
      branch: 'main',
      triggered_at: '2026-01-11T10:00:00Z',
    });

    db.insertTestResult({
      run_id: run2,
      test_name: 'test1.spec.ts:1',
      file_path: 'tests/test1.spec.ts',
      status: 'passed',
      duration_ms: 550,
    });

    db.insertPerfMetric({ run_id: run2, metric_name: 'page_load_ms', value_ms: 820, page_or_endpoint: '/home' });

    // Create run 3 — no perf metrics (should fail to set as baseline)
    db.createRun({
      ci_run_id: 'baseline-run-3',
      commit_sha: 'ccc3333333333333333333333333333333333333',
      branch: 'main',
      triggered_at: '2026-01-12T10:00:00Z',
    });

    db.save();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('setBaseline', () => {
    it('marks a run as baseline', async () => {
      await setBaseline({
        runId: 'baseline-run-1',
        configPath,
      });

      // Verify in DB
      const db2 = await CerberusDB.create(config.storage.db_path);
      try {
        const run = db2.getRunByCiId('baseline-run-1');
        expect(run).not.toBeNull();
        expect(db2.isBaseline(run!.id)).toBe(true);
      } finally {
        db2.close();
      }
    });

    it('sets a label on the baseline', async () => {
      await setBaseline({
        runId: 'baseline-run-2',
        label: 'v1.0 release baseline',
        configPath,
      });

      const db2 = await CerberusDB.create(config.storage.db_path);
      try {
        const baselines = db2.getBaselineRuns();
        const labeled = baselines.find((b) => b.run.ci_run_id === 'baseline-run-2');
        expect(labeled).toBeDefined();
        expect(labeled!.label).toBe('v1.0 release baseline');
      } finally {
        db2.close();
      }
    });

    it('rejects run with no perf metrics', async () => {
      await expect(
        setBaseline({ runId: 'baseline-run-3', configPath }),
      ).rejects.toThrow('no performance metrics');
    });

    it('rejects non-existent run', async () => {
      await expect(
        setBaseline({ runId: 'nonexistent', configPath }),
      ).rejects.toThrow('Run not found');
    });
  });

  describe('listBaselines', () => {
    it('lists all baselines', async () => {
      const result = await listBaselines({ configPath, json: false });
      expect(result.baselines.length).toBeGreaterThanOrEqual(2);

      const ids = result.baselines.map((b) => b.runId);
      expect(ids).toContain('baseline-run-1');
      expect(ids).toContain('baseline-run-2');
    });

    it('includes metric counts', async () => {
      const result = await listBaselines({ configPath, json: false });
      const run1 = result.baselines.find((b) => b.runId === 'baseline-run-1');
      expect(run1).toBeDefined();
      expect(run1!.perfMetricCount).toBe(2); // page_load_ms + api_latency_ms
      expect(run1!.testCount).toBe(1);
    });

    it('includes label', async () => {
      const result = await listBaselines({ configPath, json: false });
      const run2 = result.baselines.find((b) => b.runId === 'baseline-run-2');
      expect(run2).toBeDefined();
      expect(run2!.label).toBe('v1.0 release baseline');
    });

    it('returns valid JSON structure', async () => {
      const result = await listBaselines({ configPath, json: true });
      expect(Array.isArray(result.baselines)).toBe(true);
      if (result.baselines.length > 0) {
        expect(result.baselines[0]).toHaveProperty('runId');
        expect(result.baselines[0]).toHaveProperty('commitSha');
        expect(result.baselines[0]).toHaveProperty('branch');
        expect(result.baselines[0]).toHaveProperty('perfMetricCount');
      }
    });
  });

  describe('clearBaseline', () => {
    it('clears a specific baseline', async () => {
      await clearBaseline({ runId: 'baseline-run-1', configPath });

      const db2 = await CerberusDB.create(config.storage.db_path);
      try {
        const run = db2.getRunByCiId('baseline-run-1');
        expect(run).not.toBeNull();
        expect(db2.isBaseline(run!.id)).toBe(false);
      } finally {
        db2.close();
      }
    });

    it('clears all baselines', async () => {
      await clearBaseline({ configPath });

      const db2 = await CerberusDB.create(config.storage.db_path);
      try {
        const baselines = db2.getBaselineRuns();
        expect(baselines).toHaveLength(0);
      } finally {
        db2.close();
      }
    });

    it('rejects clearing non-existent baseline', async () => {
      await expect(
        clearBaseline({ runId: 'baseline-run-1', configPath }),
      ).rejects.toThrow('not a baseline');
    });

    it('rejects clearing non-existent run', async () => {
      await expect(
        clearBaseline({ runId: 'nonexistent', configPath }),
      ).rejects.toThrow('Run not found');
    });
  });

  describe('formatBaselineList', () => {
    it('formats empty baselines', () => {
      const text = formatBaselineList({ baselines: [] });
      expect(text).toContain('No baselines set');
      expect(text).toContain('cerberus baseline set');
    });

    it('formats baselines with labels', () => {
      const text = formatBaselineList({
        baselines: [
          {
            runId: 'run-1',
            commitSha: 'abc1234',
            branch: 'main',
            triggeredAt: '2026-01-10T10:00:00Z',
            label: 'release baseline',
            createdAt: '2026-01-10T11:00:00Z',
            testCount: 50,
            perfMetricCount: 5,
          },
        ],
      });
      expect(text).toContain('run-1');
      expect(text).toContain('"release baseline"');
      expect(text).toContain('50');
      expect(text).toContain('5');
    });
  });
});
