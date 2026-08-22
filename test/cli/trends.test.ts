/**
 * Tests for the trends analysis functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { getTrends } from '../../src/cli/trends.js';

describe('Trends Analysis', () => {
  let tmpDir: string;
  let dbPath: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-trends-'));
    dbPath = path.join(tmpDir, 'data.db');
    configPath = path.join(tmpDir, 'cerberus.config.yml');

    // Create a minimal config
    fs.writeFileSync(configPath, `
storage:
  db_path: ${dbPath}
ai:
  provider: mock
`, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function setupMultipleRuns() {
    const db = await CerberusDB.create(dbPath);

    // Simulate 5 runs with a flaky test
    for (let i = 0; i < 5; i++) {
      const runId = db.createRun({
        ci_run_id: `run-${i}`,
        commit_sha: `sha${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() + i * 86400000).toISOString(),
      });

      // Flaky test: alternates pass/fail
      const status = i % 2 === 0 ? 'failed' : 'passed';
      db.insertTestResult({
        run_id: runId,
        test_name: 'flaky.spec.ts:42',
        file_path: 'flaky.spec.ts',
        status: status as 'passed' | 'failed',
        duration_ms: 100,
        error_message: status === 'failed' ? 'Error' : undefined,
      });

      // Stable test: always passes
      db.insertTestResult({
        run_id: runId,
        test_name: 'stable.spec.ts:1',
        file_path: 'stable.spec.ts',
        status: 'passed',
        duration_ms: 50,
      });
    }

    db.save();
    db.close();
  }

  it('returns empty result when no data exists', async () => {
    const result = await getTrends({
      branch: 'main',
      depth: 50,
      configPath,
      json: false,
    });

    expect(result.totalRuns).toBe(0);
    expect(result.tests.length).toBe(0);
  });

  it('analyzes trends correctly', async () => {
    await setupMultipleRuns();

    const result = await getTrends({
      branch: 'main',
      depth: 50,
      configPath,
      json: false,
    });

    expect(result.totalRuns).toBe(5);
    expect(result.tests.length).toBe(2);

    // Flaky test should have ~60% fail rate
    const flakyTest = result.tests.find((t) => t.testName === 'flaky.spec.ts:42');
    expect(flakyTest).toBeDefined();
    expect(flakyTest!.failCount).toBe(3); // runs 0, 2, 4 failed
    expect(flakyTest!.passCount).toBe(2);

    // Stable test should have 0% fail rate
    const stableTest = result.tests.find((t) => t.testName === 'stable.spec.ts:1');
    expect(stableTest).toBeDefined();
    expect(stableTest!.failCount).toBe(0);
    expect(stableTest!.passCount).toBe(5);
  });

  it('identifies worst tests', async () => {
    await setupMultipleRuns();

    const result = await getTrends({
      branch: 'main',
      depth: 50,
      configPath,
      json: false,
    });

    expect(result.worstTests.length).toBeGreaterThan(0);
    expect(result.worstTests[0].testName).toBe('flaky.spec.ts:42');
  });

  it('handles non-existent branch', async () => {
    await setupMultipleRuns();

    const result = await getTrends({
      branch: 'nonexistent',
      depth: 50,
      configPath,
      json: false,
    });

    expect(result.totalRuns).toBe(0);
    expect(result.tests.length).toBe(0);
  });

  it('detects worsening trend', async () => {
    const db = await CerberusDB.create(dbPath);

    // 10 runs: first 8 pass, last 2 fail (clearly worsening)
    for (let i = 0; i < 10; i++) {
      const runId = db.createRun({
        ci_run_id: `trend-${i}`,
        commit_sha: `sha${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() + i * 86400000).toISOString(),
      });

      const status = i < 8 ? 'passed' : 'failed';
      db.insertTestResult({
        run_id: runId,
        test_name: 'worsening.spec.ts:1',
        file_path: 'worsening.spec.ts',
        status: status as 'passed' | 'failed',
        duration_ms: 100,
        error_message: status === 'failed' ? 'Error' : undefined,
      });
    }

    db.save();
    db.close();

    const result = await getTrends({
      branch: 'main',
      depth: 50,
      configPath,
      json: false,
    });

    const test = result.tests.find((t) => t.testName === 'worsening.spec.ts:1');
    expect(test).toBeDefined();
    // Overall fail rate is 20% (2/10), recent fail rate is 100% (2/2) — clearly worsening
    expect(test!.trend).toBe('worsening');
    expect(result.worseningTests.length).toBe(1);
  });
});
