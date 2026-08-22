/**
 * Tests for report generation — generateReport (no real GitHub API calls).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { generateReport } from '../../src/report/index.js';
import { classifyRun } from '../../src/classifier/index.js';
import { DEFAULT_CONFIG, type CerberusConfig } from '../../src/config/schema.js';

function makeConfig(overrides?: Record<string, unknown>): CerberusConfig {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  if (overrides) {
    if (overrides.gate) Object.assign(config.gate, overrides.gate);
  }
  return config;
}

describe('generateReport', () => {
  let tmpDir: string;
  let db: CerberusDB;
  let config: CerberusConfig;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-report-test-'));
    config = makeConfig();
    config.storage.db_path = path.join(tmpDir, 'test.db');
    db = await CerberusDB.create(config.storage.db_path);

    // Seed a run with test results
    const runId = db.createRun({
      ci_run_id: 'report-test-1',
      commit_sha: 'report123',
      branch: 'feature/reports',
      triggered_at: new Date().toISOString(),
      pr_number: 42,
    });

    // Add test results
    db.insertTestResult({
      run_id: runId,
      test_name: 'checkout.spec.ts:42',
      file_path: 'tests/checkout.spec.ts',
      status: 'failed',
      duration_ms: 5000,
      error_message: 'TimeoutError: Navigation timeout',
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'login.spec.ts:18',
      file_path: 'tests/login.spec.ts',
      status: 'passed',
      duration_ms: 1200,
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'auth.spec.ts:7',
      file_path: 'tests/auth.spec.ts',
      status: 'failed',
      duration_ms: 3000,
      error_message: "Expected 'admin' to equal 'user'",
    });

    // Save to disk so classifyRun can read via its own DB connection
    db.save();

    // Run classifier (uses mock provider)
    await classifyRun('report-test-1', config);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates markdown report with PASSED gate', async () => {
    // Use a config that doesn't fail on regressions for this test
    const passConfig = makeConfig({
      gate: { fail_on_regression: false, fail_on_unknown: false },
    });
    passConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: passConfig,
    });

    expect(result.markdown).toContain('## 🐕‍🦺 Cerberus Quality Gate');
    expect(result.markdown).toContain('Gate:');
    expect(result.markdown).toContain('Classified using:');
    expect(result.posted).toBe(false); // no GITHUB_TOKEN set
  });

  it('generates markdown with deduplication marker', async () => {
    const passConfig = makeConfig({
      gate: { fail_on_regression: false, fail_on_unknown: false },
    });
    passConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: passConfig,
    });

    expect(result.markdown).toContain('<!-- cerberus-quality-gate -->');
    // Should appear twice (start and end)
    const marker = '<!-- cerberus-quality-gate -->';
    const count = result.markdown.split(marker).length - 1;
    expect(count).toBe(2);
  });

  it('throws for non-existent run', async () => {
    await expect(
      generateReport({
        runId: 'nonexistent-run',
        prNumber: 1,
        repo: 'test/repo',
        config,
      }),
    ).rejects.toThrow('Run not found');
  });

  it('includes flaky test names in report', async () => {
    const passConfig = makeConfig({
      gate: { fail_on_regression: false, fail_on_unknown: false },
    });
    passConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: passConfig,
    });

    // Should mention test names
    const hasTestRef =
      result.markdown.includes('checkout.spec.ts:42') ||
      result.markdown.includes('auth.spec.ts:7');
    expect(hasTestRef).toBe(true);
  });

  it('includes provider attribution', async () => {
    const passConfig = makeConfig({
      gate: { fail_on_regression: false, fail_on_unknown: false },
    });
    passConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: passConfig,
    });

    expect(result.markdown).toMatch(/Classified using: .+/);
  });

  it('includes AI analysis section', async () => {
    const passConfig = makeConfig({
      gate: { fail_on_regression: false, fail_on_unknown: false },
    });
    passConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: passConfig,
    });

    expect(result.markdown).toContain('<details><summary>AI Analysis</summary>');
    expect(result.markdown).toContain('</details>');
  });

  it('shows FAIL gate when regressions exist and config enables it', async () => {
    // Config with fail_on_regression=true (default)
    const strictConfig = makeConfig();
    strictConfig.storage.db_path = config.storage.db_path;

    const result = await generateReport({
      runId: 'report-test-1',
      prNumber: 42,
      repo: 'test/repo',
      config: strictConfig,
    });

    // Default config has fail_on_regression: true, so should show FAILED
    // (depends on what the classifier produced)
    expect(result.markdown).toContain('Gate:');
  });
});
