/**
 * Exhaustive tests for gate logic — every config flag combination.
 * The gate must be 100% deterministic given the same DB state and config.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { evaluateGate } from '../../src/gate/index.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';

describe('Gate Logic — Config Combinations', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-gate-'));
    dbPath = path.join(tmpDir, 'data.db');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeConfig(overrides: Partial<CerberusConfig['gate']>): CerberusConfig {
    return {
      ...DEFAULT_CONFIG,
      ai: { ...DEFAULT_CONFIG.ai, provider: 'mock' },
      storage: { db_path: dbPath },
      gate: { ...DEFAULT_CONFIG.gate, ...overrides },
    };
  }

  async function setupRunWithClassifications(
    classifications: Array<{ status: 'failed' | 'timedOut'; verdict: 'flaky' | 'regression' | 'unknown' }>,
  ) {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'gate-test',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    for (let i = 0; i < classifications.length; i++) {
      const testId = db.insertTestResult({
        run_id: runId,
        test_name: `test${i}.spec.ts:1`,
        file_path: `test${i}.spec.ts`,
        status: classifications[i].status,
        duration_ms: 100,
        error_message: `Error ${i}`,
      });

      db.insertClassification({
        test_result_id: testId,
        error_signature: `sig-${i}`,
        verdict: classifications[i].verdict,
        confidence: 0.8,
        reasoning: `Test ${i}`,
        classified_by: 'rules',
      });
    }

    db.save();
    db.close();
  }

  // ── fail_on_regression ─────────────────────────────────────

  it('passes when regression detected but fail_on_regression is false', async () => {
    const config = makeConfig({ fail_on_regression: false });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'regression' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(true);
    expect(result.regressionCount).toBe(1);
  });

  it('fails when regression detected and fail_on_regression is true', async () => {
    const config = makeConfig({ fail_on_regression: true });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'regression' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.regressionCount).toBe(1);
  });

  // ── fail_on_unknown ────────────────────────────────────────

  it('passes when unknown detected but fail_on_unknown is false', async () => {
    const config = makeConfig({ fail_on_unknown: false });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'unknown' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(true);
    expect(result.unknownCount).toBe(1);
  });

  it('fails when unknown detected and fail_on_unknown is true', async () => {
    const config = makeConfig({ fail_on_unknown: true });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'unknown' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.unknownCount).toBe(1);
  });

  // ── max_new_flaky_tests ────────────────────────────────────

  it('passes when flaky count is exactly at threshold', async () => {
    const config = makeConfig({ max_new_flaky_tests: 3 });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(true);
    expect(result.flakyCount).toBe(3);
  });

  it('fails when flaky count exceeds threshold', async () => {
    const config = makeConfig({ max_new_flaky_tests: 3 });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.flakyCount).toBe(4);
  });

  it('allows any number of flaky tests when max_new_flaky_tests is 0 (unlimited)', async () => {
    const config = makeConfig({ max_new_flaky_tests: 0 });
    await setupRunWithClassifications([
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(true);
    expect(result.flakyCount).toBe(5);
  });

  // ── Combined scenarios ─────────────────────────────────────

  it('passes with all flaky when all gates are enabled', async () => {
    const config = makeConfig({
      fail_on_regression: true,
      fail_on_unknown: true,
      fail_on_perf_regression: true,
      max_new_flaky_tests: 3,
    });

    await setupRunWithClassifications([
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(true);
  });

  it('fails with regression even when fail_on_unknown is false', async () => {
    const config = makeConfig({
      fail_on_regression: true,
      fail_on_unknown: false,
    });

    await setupRunWithClassifications([
      { status: 'failed', verdict: 'regression' },
      { status: 'failed', verdict: 'unknown' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.regressionCount).toBe(1);
  });

  it('fails with too many flaky even when no regression', async () => {
    const config = makeConfig({
      fail_on_regression: true,
      max_new_flaky_tests: 2,
    });

    await setupRunWithClassifications([
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.regressionCount).toBe(0);
    expect(result.flakyCount).toBe(3);
  });

  it('passes with empty classifications', async () => {
    const config = makeConfig({});
    const db = await CerberusDB.create(dbPath);
    db.createRun({
      ci_run_id: 'empty-run',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });
    db.save();
    db.close();

    const result = await evaluateGate('empty-run', config);
    expect(result.passed).toBe(true);
    expect(result.flakyCount).toBe(0);
    expect(result.regressionCount).toBe(0);
    expect(result.unknownCount).toBe(0);
  });

  it('fails on regression even when max_new_flaky_tests is unlimited', async () => {
    const config = makeConfig({
      fail_on_regression: true,
      max_new_flaky_tests: 0, // unlimited flaky
    });

    await setupRunWithClassifications([
      { status: 'failed', verdict: 'regression' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
  });

  it('returns reasons for all failures', async () => {
    const config = makeConfig({
      fail_on_regression: true,
      fail_on_unknown: true,
      max_new_flaky_tests: 1,
    });

    await setupRunWithClassifications([
      { status: 'failed', verdict: 'regression' },
      { status: 'failed', verdict: 'unknown' },
      { status: 'failed', verdict: 'flaky' },
      { status: 'failed', verdict: 'flaky' },
    ]);

    const result = await evaluateGate('gate-test', config);
    expect(result.passed).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2); // regression + unknown + too many flaky
  });

  it('throws on non-existent run', async () => {
    const config = makeConfig({});
    await expect(evaluateGate('nonexistent', config)).rejects.toThrow('Run not found');
  });
});
