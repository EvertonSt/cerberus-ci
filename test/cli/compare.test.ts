/**
 * Tests for cerberus compare — two-run diff functionality.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { compareRuns, formatCompareText } from '../../src/cli/compare.js';
import { generateDefaultConfig } from '../../src/config/schema.js';

describe('cerberus compare', () => {
  let tmpDir: string;
  let configPath: string;
  let db: CerberusDB;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-compare-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    configPath = path.join(tmpDir, 'cerberus.config.yml');

    // Write config pointing to test DB
    const config = generateDefaultConfig();
    fs.writeFileSync(configPath, config.replace('.cerberus/data.db', dbPath));

    db = await CerberusDB.create(dbPath);

    // ── Run 1 (before): 5 tests, 2 failures, 3 passes ──
    const run1 = db.createRun({
      ci_run_id: 'compare-run-1',
      commit_sha: 'aaa1111111111111111111111111111111111111',
      branch: 'main',
      triggered_at: '2026-01-10T10:00:00Z',
    });

    db.insertTestResult({
      run_id: run1,
      test_name: 'auth.spec.ts:10',
      file_path: 'tests/auth.spec.ts',
      status: 'passed',
      duration_ms: 500,
    });
    db.insertTestResult({
      run_id: run1,
      test_name: 'checkout.spec.ts:42',
      file_path: 'tests/checkout.spec.ts',
      status: 'failed',
      duration_ms: 30000,
      error_message: 'TimeoutError',
    });
    db.insertTestResult({
      run_id: run1,
      test_name: 'search.spec.ts:7',
      file_path: 'tests/search.spec.ts',
      status: 'passed',
      duration_ms: 800,
    });
    db.insertTestResult({
      run_id: run1,
      test_name: 'login.spec.ts:15',
      file_path: 'tests/login.spec.ts',
      status: 'failed',
      duration_ms: 15000,
      error_message: 'Element not found',
    });
    db.insertTestResult({
      run_id: run1,
      test_name: 'profile.spec.ts:20',
      file_path: 'tests/profile.spec.ts',
      status: 'passed',
      duration_ms: 600,
    });

    // Perf metrics for run 1
    db.insertPerfMetric({ run_id: run1, metric_name: 'page_load_ms', value_ms: 800, page_or_endpoint: '/home' });
    db.insertPerfMetric({ run_id: run1, metric_name: 'api_latency_ms', value_ms: 200, page_or_endpoint: '/api' });

    // ── Run 2 (after): 5 tests (1 changed, 1 new failure, 1 resolved), perf regression ──
    const run2 = db.createRun({
      ci_run_id: 'compare-run-2',
      commit_sha: 'bbb2222222222222222222222222222222222222',
      branch: 'main',
      triggered_at: '2026-01-11T10:00:00Z',
    });

    db.insertTestResult({
      run_id: run2,
      test_name: 'auth.spec.ts:10',
      file_path: 'tests/auth.spec.ts',
      status: 'failed', // was passing → new failure
      duration_ms: 2000,
      error_message: "Expected 'admin' to equal 'user'",
    });
    db.insertTestResult({
      run_id: run2,
      test_name: 'checkout.spec.ts:42',
      file_path: 'tests/checkout.spec.ts',
      status: 'passed', // was failing → resolved
      duration_ms: 4500,
    });
    db.insertTestResult({
      run_id: run2,
      test_name: 'search.spec.ts:7',
      file_path: 'tests/search.spec.ts',
      status: 'passed', // unchanged
      duration_ms: 850,
    });
    db.insertTestResult({
      run_id: run2,
      test_name: 'login.spec.ts:15',
      file_path: 'tests/login.spec.ts',
      status: 'failed', // still failing
      duration_ms: 12000,
      error_message: 'Element not found',
    });
    // profile.spec.ts:20 removed, dashboard.spec.ts:5 added
    db.insertTestResult({
      run_id: run2,
      test_name: 'dashboard.spec.ts:5',
      file_path: 'tests/dashboard.spec.ts',
      status: 'passed',
      duration_ms: 700,
    });

    // Perf metrics for run 2 — page_load regression, api_latency improvement
    db.insertPerfMetric({ run_id: run2, metric_name: 'page_load_ms', value_ms: 1100, page_or_endpoint: '/home' });
    db.insertPerfMetric({ run_id: run2, metric_name: 'api_latency_ms', value_ms: 150, page_or_endpoint: '/api' });

    db.save();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects new failures', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    expect(result.summary.newFailures).toBe(1); // auth.spec.ts:10
  });

  it('detects resolved failures', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    expect(result.summary.resolved).toBe(1); // checkout.spec.ts:42
  });

  it('detects unchanged tests', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    expect(result.summary.unchanged).toBe(1); // search.spec.ts:7 (unchanged passed)
    // login.spec.ts:15 is included because both failed (status unchanged but both failed)
  });

  it('detects new test (dashboard.spec.ts:5)', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    const newTest = result.testDiffs.find((d) => d.testName === 'dashboard.spec.ts:5');
    expect(newTest).toBeDefined();
    expect(newTest!.before).toBe('(new)');
    expect(newTest!.after).toBe('passed');
  });

  it('detects removed test (profile.spec.ts:20)', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    const removedTest = result.testDiffs.find((d) => d.testName === 'profile.spec.ts:20');
    expect(removedTest).toBeDefined();
    expect(removedTest!.before).toBe('passed');
    expect(removedTest!.after).toBe('(removed)');
  });

  it('detects performance regressions', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    expect(result.summary.perfRegressions).toBe(1);
    const pageLoad = result.perfDiffs.find((d) => d.metricName === 'page_load_ms');
    expect(pageLoad).toBeDefined();
    expect(pageLoad!.deltaPct).toBeGreaterThan(20); // 800→1100 = +37.5%
  });

  it('detects performance improvements', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    expect(result.summary.perfImprovements).toBe(1);
    const apiLatency = result.perfDiffs.find((d) => d.metricName === 'api_latency_ms');
    expect(apiLatency).toBeDefined();
    expect(apiLatency!.deltaPct).toBeLessThan(-10); // 200→150 = -25%
  });

  it('formatCompareText produces readable output', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: false,
    });

    const text = formatCompareText(result);
    expect(text).toContain('Cerberus Run Comparison');
    expect(text).toContain('compare-run-1');
    expect(text).toContain('compare-run-2');
    expect(text).toContain('auth.spec.ts:10');
    expect(text).toContain('checkout.spec.ts:42');
    expect(text).toContain('page_load_ms');
    expect(text).toContain('api_latency_ms');
    expect(text).toContain('New failures');
    expect(text).toContain('Resolved');
  });

  it('throws for non-existent run', async () => {
    await expect(
      compareRuns({
        runId: 'nonexistent',
        configPath,
        json: false,
      }),
    ).rejects.toThrow('Run not found');
  });

  it('throws when no previous run exists', async () => {
    // compare-run-1 is the earliest on main, so no previous run
    await expect(
      compareRuns({
        runId: 'compare-run-1',
        configPath,
        json: false,
      }),
    ).rejects.toThrow('No previous run found');
  });

  it('auto-selects previous run when other-run-id not specified', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      configPath,
      json: false,
    });

    expect(result.beforeRun.ci_run_id).toBe('compare-run-1');
    expect(result.afterRun.ci_run_id).toBe('compare-run-2');
  });

  it('returns valid JSON structure', async () => {
    const result = await compareRuns({
      runId: 'compare-run-2',
      otherRunId: 'compare-run-1',
      configPath,
      json: true,
    });

    expect(result.beforeRun).toHaveProperty('ci_run_id');
    expect(result.afterRun).toHaveProperty('ci_run_id');
    expect(Array.isArray(result.testDiffs)).toBe(true);
    expect(Array.isArray(result.perfDiffs)).toBe(true);
    expect(result.summary).toHaveProperty('newFailures');
    expect(result.summary).toHaveProperty('resolved');
    expect(result.summary).toHaveProperty('perfRegressions');
  });
});
