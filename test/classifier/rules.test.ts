/**
 * Tests for the classifier rule-based tier — the deterministic rules
 * that run before any cache lookup or AI call.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CerberusDB } from '../../src/storage/database.js';
import { classifyRun } from '../../src/classifier/index.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import type { CerberusConfig } from '../../src/config/schema.js';

describe('Classifier Rule-Based Tier', () => {
  let tmpDir: string;
  let dbPath: string;
  let config: CerberusConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerberus-rules-'));
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

  it('classifies retry-pass as flaky (retry_count > 0)', async () => {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'retry-001',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'flaky.spec.ts:42',
      file_path: 'flaky.spec.ts',
      status: 'failed',
      duration_ms: 30000,
      error_message: 'Timeout of 30000ms exceeded',
      retry_count: 1, // retried once
    });
    db.save();
    db.close();

    const result = await classifyRun('retry-001', config);
    expect(result.flaky).toBe(1);
    expect(result.regression).toBe(0);
    expect(result.providerUsed).toBe('mock');
  });

  it('classifies 3+ consecutive failures as regression', async () => {
    const db = await CerberusDB.create(dbPath);

    // Create 4 historical runs where the same test failed
    for (let i = 0; i < 4; i++) {
      const runId = db.createRun({
        ci_run_id: `consist-${i}`,
        commit_sha: `sha${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() - (4 - i) * 86400000).toISOString(),
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'broken.spec.ts:1',
        file_path: 'broken.spec.ts',
        status: 'failed',
        duration_ms: 100,
        error_message: 'AssertionError: expected true to equal false',
        retry_count: 0,
      });
    }
    db.save();
    db.close();

    const result = await classifyRun('consist-3', config);
    expect(result.regression).toBe(1);
    expect(result.flaky).toBe(0);
  });

  it('does not classify 2 consecutive failures as regression (below threshold)', async () => {
    const db = await CerberusDB.create(dbPath);

    // Only 2 historical failures (below default threshold of 3)
    for (let i = 0; i < 2; i++) {
      const runId = db.createRun({
        ci_run_id: `two-${i}`,
        commit_sha: `sha${i}`,
        branch: 'main',
        triggered_at: new Date(Date.now() - (2 - i) * 86400000).toISOString(),
      });

      db.insertTestResult({
        run_id: runId,
        test_name: 'unstable.spec.ts:1',
        file_path: 'unstable.spec.ts',
        status: 'failed',
        duration_ms: 100,
        error_message: 'Some error',
        retry_count: 0,
      });
    }
    db.save();
    db.close();

    const result = await classifyRun('two-1', config);
    // Should not be rule-classified as regression (only 2 failures, threshold is 3)
    // Will fall through to AI (mock) classification
    expect(result.total).toBe(1);
  });

  it('classifies navigation timeout as flaky via rule', async () => {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'nav-timeout-001',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'nav.spec.ts:10',
      file_path: 'nav.spec.ts',
      status: 'timedOut',
      duration_ms: 30000,
      error_message: 'Navigation timeout of 30000ms exceeded',
      retry_count: 0,
    });
    db.save();
    db.close();

    const result = await classifyRun('nav-timeout-001', config);
    expect(result.flaky).toBe(1);
    expect(result.regression).toBe(0);
  });

  it('handles empty error message gracefully', async () => {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'empty-err-001',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'mystery.spec.ts:1',
      file_path: 'mystery.spec.ts',
      status: 'failed',
      duration_ms: 50,
      error_message: '',
      retry_count: 0,
    });
    db.save();
    db.close();

    // Should not crash
    const result = await classifyRun('empty-err-001', config);
    expect(result.total).toBe(1);
  });

  it('handles null error message gracefully', async () => {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'null-err-001',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    db.insertTestResult({
      run_id: runId,
      test_name: 'silent.spec.ts:1',
      file_path: 'silent.spec.ts',
      status: 'failed',
      duration_ms: 0,
      retry_count: 0,
    });
    db.save();
    db.close();

    const result = await classifyRun('null-err-001', config);
    expect(result.total).toBe(1);
  });

  it('classifies multiple failures in one run independently', async () => {
    const db = await CerberusDB.create(dbPath);
    const runId = db.createRun({
      ci_run_id: 'multi-001',
      commit_sha: 'sha1',
      branch: 'main',
      triggered_at: new Date().toISOString(),
    });

    // Test A: retried (flaky signal)
    db.insertTestResult({
      run_id: runId,
      test_name: 'a.spec.ts:1',
      file_path: 'a.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Error A',
      retry_count: 2,
    });

    // Test B: no retry, generic error (will go to mock AI)
    db.insertTestResult({
      run_id: runId,
      test_name: 'b.spec.ts:1',
      file_path: 'b.spec.ts',
      status: 'failed',
      duration_ms: 100,
      error_message: 'Error B',
      retry_count: 0,
    });

    // Test C: navigation timeout (flaky signal via rule)
    db.insertTestResult({
      run_id: runId,
      test_name: 'c.spec.ts:1',
      file_path: 'c.spec.ts',
      status: 'timedOut',
      duration_ms: 30000,
      error_message: 'Navigation timeout of 30000ms exceeded',
      retry_count: 0,
    });
    db.save();
    db.close();

    const result = await classifyRun('multi-001', config);
    expect(result.total).toBe(3);
    expect(result.flaky).toBe(2); // A (retry) + C (timeout rule)
    expect(result.regression + result.unknown + result.flaky).toBe(3);
  });

  it('throws on non-existent run', async () => {
    await expect(classifyRun('nonexistent', config)).rejects.toThrow('Run not found');
  });
});
