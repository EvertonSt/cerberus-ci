/**
 * Tests for getTestHistory — cerberus history command.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/index.js';
import { getTestHistory } from '../../src/cli/history.js';
import { generateDefaultConfig } from '../../src/config/schema.js';

describe('getTestHistory', () => {
  let tmpDir: string;
  let configPath: string;
  let db: CerberusDB;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-history-test-'));
    configPath = path.join(tmpDir, 'cerberus.config.yml');

    // Create a config that points to our test DB
    const dbPath = path.join(tmpDir, 'test.db');
    const config = generateDefaultConfig();
    // Write config with custom db_path
    const yamlContent = config.replace(
      'db_path: .cerberus/data.db',
      `db_path: ${dbPath}`,
    );
    fs.writeFileSync(configPath, yamlContent);

    db = await CerberusDB.create(dbPath);

    // Seed test data: 5 runs with a flaky test
    for (let i = 0; i < 5; i++) {
      const runId = db.createRun({
        ci_run_id: `hist-run-${i}`,
        commit_sha: `hist${i}abcdef`,
        branch: 'main',
        triggered_at: new Date(Date.now() + i * 86400000).toISOString(),
      });

      // Flaky test: P F P F P pattern
      const status = i % 2 === 0 ? 'passed' : 'failed';
      db.insertTestResult({
        run_id: runId,
        test_name: 'flaky-test.spec.ts:42',
        file_path: 'tests/flaky-test.spec.ts',
        status,
        duration_ms: 1000 + i * 100,
        error_message: status === 'failed' ? 'TimeoutError: timeout' : undefined,
      });

      // Always-pass test
      db.insertTestResult({
        run_id: runId,
        test_name: 'stable-test.spec.ts:10',
        file_path: 'tests/stable-test.spec.ts',
        status: 'passed',
        duration_ms: 500,
      });
    }

    db.save();
  });

  afterAll(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns history for a flaky test', async () => {
    const result = await getTestHistory({
      testName: 'flaky-test.spec.ts:42',
      branch: 'main',
      depth: 20,
      configPath,
      json: false,
    });

    expect(result.testName).toBe('flaky-test.spec.ts:42');
    expect(result.branch).toBe('main');
    expect(result.pattern).toMatch(/^[PF]+$/);
    expect(result.pattern.length).toBe(5);
    // Pattern should alternate: P F P F P (newest first, but seeded chronologically)
    // Actually depends on insert order — but should have both P and F
    expect(result.pattern).toContain('P');
    expect(result.pattern).toContain('F');
    expect(result.entries.length).toBe(5);
    expect(result.flakyScore).toBeGreaterThan(0); // has state changes
  });

  it('returns history for a stable test', async () => {
    const result = await getTestHistory({
      testName: 'stable-test.spec.ts:10',
      branch: 'main',
      depth: 20,
      configPath,
      json: false,
    });

    expect(result.pattern).toBe('PPPPP');
    expect(result.flakyScore).toBe(0); // no state changes
    expect(result.entries.length).toBe(5);
  });

  it('respects depth limit', async () => {
    const result = await getTestHistory({
      testName: 'flaky-test.spec.ts:42',
      branch: 'main',
      depth: 3,
      configPath,
      json: false,
    });

    expect(result.pattern.length).toBe(3);
    expect(result.entries.length).toBe(3);
  });

  it('returns JSON-compatible output', async () => {
    const result = await getTestHistory({
      testName: 'flaky-test.spec.ts:42',
      branch: 'main',
      depth: 10,
      configPath,
      json: true,
    });

    expect(typeof result.testName).toBe('string');
    expect(typeof result.pattern).toBe('string');
    expect(typeof result.flakyScore).toBe('number');
    expect(Array.isArray(result.entries)).toBe(true);
    if (result.entries.length > 0) {
      expect(result.entries[0]).toHaveProperty('runId');
      expect(result.entries[0]).toHaveProperty('status');
      expect(result.entries[0]).toHaveProperty('durationMs');
    }
  });

  it('handles non-existent test gracefully', async () => {
    const result = await getTestHistory({
      testName: 'does-not-exist.spec.ts:99',
      branch: 'main',
      depth: 10,
      configPath,
      json: false,
    });

    expect(result.pattern).toBe('');
    expect(result.entries).toHaveLength(0);
    expect(result.flakyScore).toBe(0);
  });

  it('defaults to main branch', async () => {
    const result = await getTestHistory({
      testName: 'flaky-test.spec.ts:42',
      depth: 10,
      configPath,
      json: false,
    });

    expect(result.branch).toBe('main');
  });
});
